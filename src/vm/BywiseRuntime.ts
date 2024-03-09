import { QuickJSAsyncWASMModule, QuickJSAsyncRuntime, QuickJSAsyncContext, QuickJSHandle, newQuickJSAsyncWASMModule } from 'quickjs-emscripten';
import fs from 'fs';
import path from 'path';
import BlockchainInterface, { GetContract, TransactionMessage } from './BlockchainInterface';
import { SimulateDTO } from '../types';
import helper from '../utils/helper';

const seedrandom = require('seedrandom');
const PRESET = [
    "Math.random = () => parseFloat(blockchain.getRandom('float'));",
    "console = {log:blockchain.log};",
    "class EditDate extends Date { static now = () => parseInt(blockchain.getTxCreated());constructor() { super(EditDate.now()) }};",
    "Date = EditDate;",
].join('\n');
const imports = [
    { module: "bignumber.js", file: "imports/bignumber.mjs" },
    { module: "bywise-utils.js", file: "imports/bywise-utils.mjs" }
]

export type ABIParameters = {
    name: string;
    type: string[];
}

export type ABIMethod = {
    name: string;
    view: boolean;
    payable: boolean;
    parameters: ABIParameters[];
    returns: string[];
}

export class BywiseContractContext {
    txHash: string;
    abi: ABIMethod[];
    code: string;
    calls: string[];

    constructor(txHash: string, abi: ABIMethod[], code: string, calls: string[]) {
        this.txHash = txHash;
        this.abi = abi;
        this.code = code;
        this.calls = calls;
    }
}

export class BywiseRuntimeInstance {
    public bywiseVirtualMachineStack = 0;
    public interruptCycles = 0;
    public runtime: QuickJSAsyncRuntime;
    public callsCount = 0;
    public calls: string[] = [];
    public write = false;
    public globalComponents: (QuickJSHandle | QuickJSAsyncContext)[] = [];
    public tx?: TransactionMessage;
    public ctx: QuickJSAsyncContext;
    public blockchain: BlockchainInterface;

    constructor(module: QuickJSAsyncWASMModule, blockchain: BlockchainInterface) {
        this.blockchain = blockchain;

        this.runtime = module.newRuntime();
        this.runtime.setMemoryLimit(1024 * 640)
        this.runtime.setMaxStackSize(1024 * 320)
        this.runtime.setInterruptHandler(() => this.interruptCycles++ > 1024)
        this.runtime.setModuleLoader((moduleName) => {
            for (let i = 0; i < imports.length; i++) {
                const element = imports[i];
                if (element.module === moduleName) {
                    return fs.readFileSync(path.join(__dirname, '../../' + element.file), "utf-8");
                }
            }
            throw new Error(`module ${moduleName} not found`)
        });

        this.ctx = this.runtime.newContext();
        const blockchainHandle = this.ctx.newObject();
        this.blockchain.exposeMethods().forEach(method => {
            const func = this.ctx.newAsyncifiedFunction(method.name, async (...parans) => {
                this.interruptCycles++;
                if (!this.tx) throw new Error('transaction message not found');
                if (this.write) {
                    const decodedParans = parans.map(this.ctx.getString);
                    const response = await method.action(this.tx, ...decodedParans);
                    this.calls.push(response);
                    this.callsCount++;
                    return this.ctx.newString(response);
                } else {
                    return this.ctx.newString(this.calls[this.callsCount++]);
                }

            });
            this.ctx.setProp(blockchainHandle, method.name, func)
            this.globalComponents.push(func);
        });
        this.globalComponents.push(blockchainHandle);
        this.ctx.setProp(this.ctx.global, "blockchain", blockchainHandle);
    }

    private exec = async (tx: TransactionMessage, code: string, write: boolean): Promise<string> => {
        this.tx = tx;
        this.write = write;
        const result = await this.ctx.evalCodeAsync(code);
        const unwrapResult = this.ctx.unwrapResult(result);
        const resultStr = this.ctx.dump(unwrapResult);
        unwrapResult.dispose();
        return resultStr;
    }

    dispose = async () => {
        for (let i = 0; i < this.globalComponents.length; i++) {
            const comp = this.globalComponents[i];
            comp.dispose();
        }
        this.ctx.dispose();
        this.runtime.dispose();
    }

    execContract = async (getContract: GetContract, ctx: SimulateDTO, contractAddress: string, sender: string, value: string, code: string) => {
        const tx: TransactionMessage = {
            contractAddress,
            sender: sender,
            value: value,
            ctx,
            bywiseRuntime: this,
            getContract,
            random: seedrandom(`${ctx.sliceFrom}:${ctx.nonce}:${ctx.tx?.hash}`)
        }
        let abi: any;
        try {
            await this.exec(tx, PRESET, true);
            await this.exec(tx, code, true);
            abi = await this.exec(tx, "globalThis.abi;", true);
        } catch (err) {
            throw err;
        }
        const calls = this.calls.map(c => c);

        return new BywiseContractContext(ctx.tx ? ctx.tx.hash : '', abi, code, calls);
    }

    execInContract = async (getContract: GetContract, ctx: SimulateDTO, contractAddress: string, bcc: BywiseContractContext, sender: string, value: string, code: string) => {
        const tx: TransactionMessage = {
            contractAddress,
            sender: sender,
            value: value,
            ctx,
            bywiseRuntime: this,
            getContract,
            random: seedrandom(`${ctx.sliceFrom}:${ctx.nonce}:${ctx.tx?.hash}`)
        }
        this.calls = bcc.calls.map(c => c);
        try {
            await this.exec(tx, PRESET, false);
            await this.exec(tx, bcc.code, false);
            await this.exec(tx, "globalThis.abi;", false);
            const result = await this.exec(tx, code, true);
            return result;
        } catch (err) {
            throw err;
        }
    }
}

type RuntimeModule = {
    module: QuickJSAsyncWASMModule,
    busy: boolean,
}

export default class BywiseRuntime {
    private static modules: RuntimeModule[] = [];

    private static getModule = async (first: boolean) => {
        if (BywiseRuntime.modules.length === 0) {
            for (let i = 0; i < 10; i++) {
                BywiseRuntime.modules.push({
                    module: await newQuickJSAsyncWASMModule(),
                    busy: false,
                })
            }
        }
        if (first) {
            do {
                const runtimeModule = BywiseRuntime.modules[0];
                if (runtimeModule.busy) {
                    await helper.sleep(0);
                } else {
                    runtimeModule.busy = true;
                    return runtimeModule;
                }
            } while (true);
        } else {
            for (let i = 0; i < BywiseRuntime.modules.length; i++) {
                const runtimeModule = BywiseRuntime.modules[i];
                if (runtimeModule.busy) {
                    await helper.sleep(0);
                } else {
                    runtimeModule.busy = true;
                    return runtimeModule;
                }
            }
            throw new Error(`BVM: call many contracts`);
        }
    }

    static execContract = async (blockchain: BlockchainInterface, getContract: GetContract, ctx: SimulateDTO, contractAddress: string, sender: string, value: string, code: string) => {
        const runtimeModule = await BywiseRuntime.getModule(true);
        let br = new BywiseRuntimeInstance(runtimeModule.module, blockchain);
        try {
            let bcc = await br.execContract(getContract, ctx, contractAddress, sender, value, code);
            await br.dispose();
            runtimeModule.busy = false;
            return bcc;
        } catch (err) {
            await br.dispose();
            runtimeModule.busy = false;
            throw err;
        }
    }

    static execInContract = async (blockchain: BlockchainInterface, getContract: GetContract, ctx: SimulateDTO, contractAddress: string, bcc: BywiseContractContext, sender: string, value: string, code: string) => {
        const runtimeModule = await BywiseRuntime.getModule(true);
        let br = new BywiseRuntimeInstance(runtimeModule.module, blockchain);
        try {
            let result = await br.execInContract(getContract, ctx, contractAddress, bcc, sender, value, code);
            await br.dispose();
            runtimeModule.busy = false;
            return result;
        } catch (err) {
            await br.dispose();
            runtimeModule.busy = false;
            throw err;
        }
    }

    static execInContractSubContext = async (brSubcontext: BywiseRuntimeInstance, getContract: GetContract, ctx: SimulateDTO, contractAddress: string, bcc: BywiseContractContext, sender: string, value: string, code: string) => {
        const runtimeModule = await BywiseRuntime.getModule(false);
        let br = new BywiseRuntimeInstance(runtimeModule.module, brSubcontext.blockchain);
        br.bywiseVirtualMachineStack = brSubcontext.bywiseVirtualMachineStack + 1;
        br.interruptCycles = brSubcontext.interruptCycles;
        if (br.bywiseVirtualMachineStack > 5) {
            throw new Error(`BVM: call many contracts`);
        }
        try {
            let result = await br.execInContract(getContract, ctx, contractAddress, bcc, sender, value, code);
            brSubcontext.interruptCycles = br.interruptCycles;
            await br.dispose();
            runtimeModule.busy = false;
            return result;
        } catch (err) {
            await br.dispose();
            runtimeModule.busy = false;
            throw err;
        }
    }
}