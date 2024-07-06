import { QuickJSAsyncWASMModule, QuickJSHandle, newQuickJSAsyncWASMModule } from 'quickjs-emscripten';
import fs from 'fs';
import path from 'path';
import BlockchainInterface from './BlockchainInterface';
import { RuntimeContext } from './RuntimeContext';
import { ABIMethod, WalletCodeDTO } from '../types';
import { BywiseHelper } from '@bywise/web3';

const PRESET = [
    "Math.random = () => 0;",
    "console = {log:blockchain.log};",
    "class EditDate extends Date { static now = () => parseInt(blockchain.getTxCreated());constructor() { super(EditDate.now()) }};",
    "Date = EditDate;",
].join('\n');
const FILE_BYWISE_UTILS = fs.readFileSync(path.join(__dirname, '../../imports/bywise-utils.mjs'), "utf-8")
const FILE_BYWISE_UTILS_V2 = fs.readFileSync(path.join(__dirname, '../../imports/bywise-utils-v2.mjs'), "utf-8")
const FILE_BIGNUMBER = fs.readFileSync(path.join(__dirname, '../../imports/bignumber.mjs'), "utf-8")
const imports = [
    { module: "bignumber.js", binary: FILE_BIGNUMBER },
    { module: "bywise-utils.js", binary: FILE_BYWISE_UTILS },
    { module: "bywise-utils", binary: FILE_BYWISE_UTILS_V2 }
]

export class BywiseRuntimeInstance {

    private blockchain = new BlockchainInterface();
    private modules: QuickJSAsyncWASMModule[] = [];

    private getModule = async (virtualMachineStack: number) => {
        if (virtualMachineStack < this.modules.length) {
            return this.modules[virtualMachineStack];
        }
        const module = await newQuickJSAsyncWASMModule();
        this.modules.push(module);
        return module;
    }

    getContract = async (ctx: RuntimeContext, amount: string, contractAddress: string, method: string, inputs: string[]) => {
        if (!BywiseHelper.isValidAddress(contractAddress)) throw new Error(`Invalid address`);
        if (!BywiseHelper.isValidAmount(amount)) throw new Error('BVM: invalid amount');
        if (inputs === undefined) throw new Error(`inputs array not found`);
        if (!Array.isArray(inputs)) throw new Error(`Inputs need be an array`);
        const walletCodeDTOJSON = await ctx.get(`${contractAddress}-WC`);
        if (!walletCodeDTOJSON) throw new Error(`Contract not found`);
        const walletCodeDTO: WalletCodeDTO = JSON.parse(walletCodeDTOJSON);
        walletCodeDTO.address = contractAddress;
        let foundMethod = false;
        let view = false;
        let payable = false;
        for (let i = 0; i < walletCodeDTO.abi.length; i++) {
            const abiMethod = walletCodeDTO.abi[i];
            if (abiMethod.name === method) {
                foundMethod = true;
                view = abiMethod.view;
                payable = abiMethod.payable;
                if (inputs.length !== abiMethod.parameters.length) throw new Error(`expected ${abiMethod.parameters.length} inputs`);
            }
        }
        if (!foundMethod) throw new Error(`Invalid method`);
        const exeCode = `globalThis.contract.${method}(${inputs.map(i => `"${i}"`).join(',')});`;

        return {
            view: view,
            payable: payable,
            exeCode: exeCode,
            wc: walletCodeDTO
        }
    }

    deploy = async (ctx: RuntimeContext, contractAddress: string, code: string) => {
        ctx.contractAddress = contractAddress;
        ctx.cost += 14;
        const calls: string[] = [];
        const module = await this.getModule(ctx.virtualMachineStack);
        const runtime = module.newRuntime();
        runtime.setMemoryLimit(1024 * 640);
        runtime.setMaxStackSize(1024 * 320);
        runtime.setInterruptHandler(() => ctx.cost++ > 1024);
        runtime.setModuleLoader((moduleName) => {
            ctx.cost += 7;
            for (let i = 0; i < imports.length; i++) {
                const element = imports[i];
                if (element.module === moduleName) {
                    return element.binary;
                }
            }
            throw new Error(`module ${moduleName} not found`)
        });

        const globalComponents: QuickJSHandle[] = [];
        const vm = runtime.newContext();
        const blockchainHandle = vm.newObject();
        this.blockchain.exposeMethods().forEach(method => {
            const func = vm.newAsyncifiedFunction(method.name, async (...parans) => {
                ctx.cost += 1;
                const decodedParans = parans.map(vm.getString);
                const response = await method.action(this, ctx, ...decodedParans);
                calls.push(response);
                return vm.newString(response);
            });
            vm.setProp(blockchainHandle, method.name, func)
            globalComponents.push(func);
        });
        globalComponents.push(blockchainHandle);
        vm.setProp(vm.global, "blockchain", blockchainHandle);

        let error: undefined | string;
        let stack: undefined | string;
        let abi: ABIMethod[] = [];
        try {
            let result = await vm.evalCodeAsync(PRESET);
            let unwrapResult = vm.unwrapResult(result);
            unwrapResult.dispose();

            result = await vm.evalCodeAsync(code);
            if (result.error) {
                const errorObj = vm.dump(result.error);
                if(errorObj.message && typeof errorObj.message === 'string') {
                    error = errorObj.message;
                    stack = errorObj.stack
                } else {
                    error = JSON.stringify(errorObj);
                }
                result.error.dispose();
            } else {
                unwrapResult = vm.unwrapResult(result);
                unwrapResult.dispose();

                result = await vm.evalCodeAsync("globalThis.abi;");
                unwrapResult = vm.unwrapResult(result);
                abi = vm.dump(unwrapResult);
                unwrapResult.dispose();
            }
        } catch (err: any) {
            error = `VM ERROR: ${JSON.stringify(err)}`;
        }

        for (let i = 0; i < globalComponents.length; i++) {
            const comp = globalComponents[i];
            comp.dispose();
        }
        vm.dispose();
        runtime.dispose();
        return {
            abi: abi,
            calls: calls.reverse(),
            error: error,
            stack: stack
        };
    }

    exec = async (ctx: RuntimeContext, wc: WalletCodeDTO, code: string) => {
        ctx.contractAddress = wc.address;
        ctx.cost += 7;
        const calls: string[] = wc.calls.map(c => c);
        const module = await this.getModule(ctx.virtualMachineStack);
        const runtime = module.newRuntime();
        runtime.setMemoryLimit(1024 * 640);
        runtime.setMaxStackSize(1024 * 320);
        runtime.setInterruptHandler(() => ctx.cost++ > 1024);
        runtime.setModuleLoader((moduleName) => {
            ctx.cost += 7;
            for (let i = 0; i < imports.length; i++) {
                const element = imports[i];
                if (element.module === moduleName) {
                    return element.binary;
                }
            }
            throw new Error(`module ${moduleName} not found`)
        });

        const globalComponents: QuickJSHandle[] = [];
        const vm = runtime.newContext();
        const blockchainHandle = vm.newObject();
        this.blockchain.exposeMethods().forEach(method => {
            const func = vm.newAsyncifiedFunction(method.name, async (...parans) => {
                if (calls.length > 0) {
                    let call = calls.pop();
                    if (call === undefined) throw new Error(`invalid contract calls`);
                    return vm.newString(call);
                }
                ctx.cost += 1;
                const decodedParans = parans.map(vm.getString);
                const response = await method.action(this, ctx, ...decodedParans);
                return vm.newString(response);
            });
            vm.setProp(blockchainHandle, method.name, func)
            globalComponents.push(func);
        });
        globalComponents.push(blockchainHandle);
        vm.setProp(vm.global, "blockchain", blockchainHandle);

        let resultStr = '';
        let error: undefined | string;
        let stack: undefined | string;
        let costBefore = ctx.cost;
        try {
            let result = await vm.evalCodeAsync(PRESET);
            let unwrapResult = vm.unwrapResult(result);
            unwrapResult.dispose();

            result = await vm.evalCodeAsync(wc.code);
            unwrapResult = vm.unwrapResult(result);
            unwrapResult.dispose();

            ctx.cost = costBefore;

            result = await vm.evalCodeAsync(code);
            if (result.error) {
                const errorObj = vm.dump(result.error);
                if(errorObj.message && typeof errorObj.message === 'string') {
                    error = errorObj.message;
                    stack = errorObj.stack
                } else {
                    error = JSON.stringify(errorObj);
                }
                result.error.dispose();
            } else {
                unwrapResult = vm.unwrapResult(result);
                resultStr = vm.getString(unwrapResult);
                unwrapResult.dispose();
            }
        } catch (errorObj: any) {
            if(errorObj.message && typeof errorObj.message === 'string') {
                error = `VM ERROR: ${errorObj.message}`;
            } else if(errorObj && typeof errorObj === 'string') {
                error = `VM ERROR: ${errorObj}`;
            } else {
                error = `VM ERROR: ${JSON.stringify(errorObj)}`;
            }
        }

        for (let i = 0; i < globalComponents.length; i++) {
            const comp = globalComponents[i];
            comp.dispose();
        }
        vm.dispose();
        runtime.dispose();
        return {
            result: resultStr,
            error: error,
            stack: stack
        };
    }
}