import BigNumber from "bignumber.js";
import { ApplicationContext, CommandDTO, ConfigDTO, Task, TransactionOutputDTO, TransactionsToExecute, WalletBalanceDTO } from '../types';
import { TxType, BywiseHelper, Tx } from '@bywise/web3';
import { ConfigProvider } from "./configs.service";
import { WalletProvider } from "./wallet.service";
import { Votes } from "../models";
import { EnvironmentProvider } from "./environment.service";
import { BywiseRuntimeInstance } from "../vm/BywiseRuntimeInstance";
import helper from "../utils/helper";
import { RuntimeContext } from "../vm/RuntimeContext";

const INSTANCES_SIZE = 5;

type VMInstance = {
  vm: BywiseRuntimeInstance,
  busy: boolean
}

export class VirtualMachineProvider {

  private instances: VMInstance[] = [];
  private getInstance = async () => {
    if (this.instances.length == 0) {
      for (let i = 0; i < INSTANCES_SIZE; i++) {
        this.instances.push({
          busy: false,
          vm: new BywiseRuntimeInstance()
        })
      }
    }
    while (true) {
      for (let i = 0; i < this.instances.length; i++) {
        const instance = this.instances[i];
        if (!instance.busy) {
          instance.busy = true;
          return instance;
        }
      }
      await helper.sleep(100);
    }
  }

  private environmentProvider;
  private configsProvider;
  private walletProvider;
  private applicationContext;
  private task;

  constructor(applicationContext: ApplicationContext, task: Task) {
    this.applicationContext = applicationContext;
    this.task = task;
    this.environmentProvider = new EnvironmentProvider(applicationContext);
    this.configsProvider = new ConfigProvider();
    this.walletProvider = new WalletProvider();
  }

  async executeTransactions(tte: TransactionsToExecute): Promise<void> {
    const ctx = new RuntimeContext(this.environmentProvider, tte.env);

    const outputs = [];
    tte.envOut.keys = [];
    tte.envOut.values = [];
    for (let i = 0; i < tte.txs.length; i++) {
      if (!this.task.isRun) return;
      
      const tx = tte.txs[i];

      let output = new TransactionOutputDTO();
      try {
        output = await this.executeTransaction(tx, ctx, tte.ignoreBalance);
        if (!output.error) {
          for (let j = 0; j < output.changes.walletAddress.length; j++) {
            const address = output.changes.walletAddress[j];
            const amount = new BigNumber(output.changes.walletAmount[j]);

            const walletDTO = await this.walletProvider.getWalletBalance(ctx, address);
            walletDTO.balance = walletDTO.balance.plus(amount);

            if (walletDTO.balance.isLessThan(new BigNumber(0))) {
              output.error = `low balance`;
            }

            await this.walletProvider.setWalletBalance(ctx, walletDTO);
          }
          let debit = new BigNumber(output.debit);
          for (let j = 0; j < tx.from.length; j++) {
            const from = tx.from[j];

            const walletDTO = await this.walletProvider.getWalletBalance(ctx, from);
            if (walletDTO.balance.isGreaterThanOrEqualTo(debit)) {
              walletDTO.balance = walletDTO.balance.minus(debit);
              await this.walletProvider.setWalletBalance(ctx, walletDTO);
              debit = new BigNumber(0);
            } else {
              debit = debit.minus(walletDTO.balance);
              walletDTO.balance = new BigNumber(0);
              await this.walletProvider.setWalletBalance(ctx, walletDTO);
            }
          }
          if (!tte.ignoreBalance && debit.isGreaterThan(new BigNumber(0))) {
            output.error = `Insuficient funds`;
          }
        }
      } catch (err: any) {
        if(err.message && typeof err.message == 'string') {
          output.error = err.message;
        } else {
          output.error = `Error: ${JSON.stringify(err)}`
        }
      }
      if (output.error) {
        tte.error = output.error;
        ctx.deleteCommit();
      } else {
        ctx.commit();
      }
      outputs.push(output);
    }
    for (let [key, valueEnv] of ctx.setMainKeys) {
      tte.envOut.keys.push(key);
      tte.envOut.values.push(valueEnv.value);
    }
    tte.outputs = outputs;
  }

  private async executeTransaction(tx: Tx, ctx: RuntimeContext, ignoreBalance: boolean): Promise<TransactionOutputDTO> {
    const output = new TransactionOutputDTO();
    ctx.tx = tx;
    ctx.cost = 0;
    ctx.balances = new Map();

    const feeCostType = parseInt((await this.configsProvider.getByName(ctx, 'feeCostType')).value);
    ctx.size = JSON.stringify(ctx.tx.data).length;

    if (ctx.tx.type === TxType.TX_CONTRACT) {
      const contractAddress = ctx.tx.data.contractAddress;
      const code = ctx.tx.data.code;

      if (typeof code !== 'string') throw new Error(`invalid code`);
      if (typeof contractAddress !== 'string') throw new Error(`invalid address`);
      if (!BywiseHelper.isValidAddress(contractAddress)) throw new Error(`invalid address`);
      if (!BywiseHelper.decodeBWSAddress(contractAddress).isContract) throw new Error(`invalid address - not is contract`);

      let walletCodeDTO = await this.walletProvider.getWalletCode(ctx, contractAddress);
      if (walletCodeDTO) throw new Error(`Cant update contract`);

      let contractAmount = new BigNumber(0);
      for (let i = 0; i < ctx.tx.to.length; i++) {
        if (ctx.tx.to[i] === contractAddress) {
          contractAmount = contractAmount.plus(new BigNumber(ctx.tx.amount[i]));
        }
      }

      ctx.sender = ctx.tx.from[0];
      ctx.amount = contractAmount.toString();
      const instance = await this.getInstance();
      const result = await instance.vm.deploy(ctx, contractAddress, code);
      instance.busy = false;

      if(result.error) {
        output.cost = ctx.cost;
        output.error = result.error;
        output.stack = result.stack;
        return output;
      }
      await this.walletProvider.setWalletCode(ctx, {
        address: contractAddress,
        status: 'locked',
        abi: result.abi,
        code: code,
        calls: result.calls,
      });
      ctx.output = {
        contractAddress: contractAddress,
        abi: result.abi
      }
    } else if (ctx.tx.type === TxType.TX_CONTRACT_EXE) {
      for (let i = 0; i < ctx.tx.to.length; i++) {
        const contractAddress = ctx.tx.to[i];
        const amount = ctx.tx.amount[i];

        if (BywiseHelper.isContractAddress(contractAddress)) {
          const instance = await this.getInstance();

          ctx.sender = ctx.tx.from[0];
          ctx.amount = amount;
          const contract = await instance.vm.getContract(ctx, amount, contractAddress, ctx.tx.data[i].method, ctx.tx.data[i].inputs);
          const result = await instance.vm.exec(ctx, contract.wc, contract.exeCode);
          instance.busy = false;

          if(result.error) {
            output.cost = ctx.cost;
            output.error = result.error;
            output.stack = result.stack;
            return output;
          }
          ctx.output = result.result;
        }
      }
    } else if (ctx.tx.type === TxType.TX_COMMAND) {
      let cmd = new CommandDTO(ctx.tx.data);
      await this.setConfig(ctx, cmd);
    } else if (ctx.tx.type === TxType.TX_BLOCKCHAIN_COMMAND) {
      let cmd = new CommandDTO(ctx.tx.data);
      await this.blockchainCommand(ctx, cmd);
    } else if (ctx.tx.type === TxType.TX_COMMAND_INFO) {
      let cmd = new CommandDTO(ctx.tx.data);
      await this.setInfo(ctx, cmd);
    }

    let debit = new BigNumber(0);
    for (let i = 0; i < ctx.tx.to.length; i++) {
      const to = ctx.tx.to[i];
      const amount = ctx.tx.amount[i];
      debit = debit.plus(new BigNumber(amount));
      ctx.balanceAdd(to, amount);
    }
    if (feeCostType == 0) {
      ctx.cost = 0;
    }
    let feeUsed = await this.calcFee(ctx, new BigNumber(ctx.size), debit, new BigNumber(ctx.cost));
    if (ctx.tx.type === TxType.TX_COMMAND || ctx.tx.type === TxType.TX_BLOCKCHAIN_COMMAND) {
      feeUsed = "0";
    }
    if (!ignoreBalance && (new BigNumber(ctx.tx.fee).isLessThan(new BigNumber(feeUsed)))) {
      throw new Error(`Invalid fee`);
    }
    debit = debit.plus(new BigNumber(feeUsed));

    output.cost = ctx.cost;
    output.size = ctx.size;
    output.fee = ctx.tx.fee;
    output.feeUsed = feeUsed;
    output.debit = debit.toString();
    output.logs = ctx.logs;
    output.events = ctx.events;
    output.output = ctx.output;
    ctx.setChanges(output.changes);
    return output;
  }

  private async calcFee(ctx: RuntimeContext, size: BigNumber, amount: BigNumber, cost: BigNumber): Promise<string> {
    let feeBasic = (await this.configsProvider.getByName(ctx, 'feeBasic')).toNumber();
    let feeCoefSize = (await this.configsProvider.getByName(ctx, 'feeCoefSize')).toNumber();
    let feeCoefAmount = (await this.configsProvider.getByName(ctx, 'feeCoefAmount')).toNumber();
    let feeCoefCost = (await this.configsProvider.getByName(ctx, 'feeCoefCost')).toNumber();

    let fee = feeBasic;
    fee = fee.plus(feeCoefSize.multipliedBy(size));
    fee = fee.plus(feeCoefAmount.multipliedBy(amount));
    fee = fee.plus(feeCoefCost.multipliedBy(cost));
    return new BigNumber(fee.toPrecision(5)).toString();
  }

  private async checkAdminAddress(ctx: RuntimeContext) {
    if (ctx.env.blockHeight > 0) {
      let isAdmin = await this.configsProvider.isAdmin(ctx, ctx.tx.from[0]);
      if (!isAdmin) {
        throw new Error(`setConfig forbidden`);
      }
    }
  }

  private async blockchainCommand(ctx: RuntimeContext, cmd: CommandDTO): Promise<void> {
    if (!ctx.tx) throw new Error(`Blockchain Command Forbidden`);
    ctx.tx = new Tx(ctx.tx);

    if (cmd.name == 'vote-block') {
      if (cmd.input.length !== 2) throw new Error(`vote-block expected 2 inputs`);
      if (!/^[0-9]+$/.test(cmd.input[1])) throw new Error(`invalid height`);

      const from = ctx.tx.from[0];
      const hash = cmd.input[0];
      const height = parseInt(cmd.input[1]);
      const isValidator = await this.configsProvider.isValidator(ctx, from);

      const newVote: Votes = {
        chain: ctx.env.chain,
        txHash: ctx.tx.hash,
        blockHash: hash,
        lastHash: '',
        height: height,
        from: from,
        add: false,
        processed: false,
        valid: isValidator,
      }

      const votes = await this.applicationContext.database.VotesRepository.findByChainAndHeightAndFrom(ctx.env.chain, height, from);
      for (let i = 0; i < votes.length; i++) {
        const vote = votes[i];
        if (vote.txHash === newVote.txHash) {
          newVote.add = vote.add;
          newVote.lastHash = vote.lastHash;
          newVote.valid = newVote.valid || vote.valid;
        }
      }
      await this.applicationContext.database.VotesRepository.save(newVote);
    } else if (cmd.name == 'start-slice') {
      if (cmd.input.length !== 1) throw new Error(`start-slice expected 1 inputs`);
      if (!/^[0-9]+$/.test(cmd.input[0])) throw new Error(`invalid height`);
      const height = parseInt(cmd.input[0]);
      if (ctx.env.blockHeight !== height) throw new Error(`wrong start-slice - ${ctx.env.blockHeight}/${height}`);
    } else if (cmd.name == 'end-slice') {
      if (cmd.input.length !== 1) throw new Error(`end-slice expected 1 inputs`);
      if (!/^[0-9]+$/.test(cmd.input[0])) throw new Error(`invalid height`);
      const height = parseInt(cmd.input[0]);
      if (ctx.env.blockHeight !== height) throw new Error(`wrong end-slice - ${ctx.env.blockHeight}/${height}`);
    } else if (cmd.name == 'poi') {
      if (cmd.input.length !== 3) throw new Error(`start-slice expected 1 inputs`);
      if (!/^[0-9]+$/.test(cmd.input[0])) throw new Error(`invalid height`);
      if (!/^[a-f]+$/.test(cmd.input[1])) throw new Error(`invalid chain`);
      if (!/^[a-f0-9]+$/.test(cmd.input[2])) throw new Error(`invalid hash`);
      //const height = parseInt(cmd.input[0]);
      //const hash = cmd.input[1];
    } else {
      throw new Error("Method not implemented.");
    }
  }

  private async setConfig(ctx: RuntimeContext, cmd: CommandDTO): Promise<void> {
    await this.checkAdminAddress(ctx);

    if (cmd.name == 'setConfig') {
      if (cmd.input.length !== 2) throw new Error(`setConfig expected 2 inputs`);
      const cfgName = cmd.input[0];
      const cfgValue = cmd.input[1];
      const cfg = await this.configsProvider.getByName(ctx, cfgName);
      cfg.setValue(cfgValue);
      await this.configsProvider.setConfig(ctx, cfg);

    } else if (cmd.name == 'addAdmin') {
      if (cmd.input.length !== 1) throw new Error(`addAdmin expected 1 inputs`);
      const address = cmd.input[0];
      const cfg = new ConfigDTO({
        chain: ctx.env.chain,
        name: `admin-address-${address}`,
        value: 'true',
        type: 'boolean',
      })
      await this.configsProvider.setConfig(ctx, cfg);

    } else if (cmd.name == 'removeAdmin') {
      if (cmd.input.length !== 1) throw new Error(`removeAdmin expected 1 inputs`);
      const address = cmd.input[0];
      const cfg = new ConfigDTO({
        chain: ctx.env.chain,
        name: `admin-address-${address}`,
        value: 'false',
        type: 'boolean',
      })
      await this.configsProvider.setConfig(ctx, cfg);

    } else if (cmd.name == 'addValidator') {
      if (cmd.input.length !== 1) throw new Error(`addValidator expected 1 inputs`);
      const address = cmd.input[0];
      const cfg = new ConfigDTO({
        chain: ctx.env.chain,
        name: `validator-${address}`,
        value: 'true',
        type: 'boolean',
      })
      await this.configsProvider.setConfig(ctx, cfg);

    } else if (cmd.name == 'removeValidator') {
      if (cmd.input.length !== 1) throw new Error(`removeValidator expected 1 inputs`);
      const address = cmd.input[0];
      const cfg = new ConfigDTO({
        chain: ctx.env.chain,
        name: `validator-${address}`,
        value: 'false',
        type: 'boolean',
      })
      await this.configsProvider.setConfig(ctx, cfg);

    } else if (cmd.name == 'setBalance') {
      if (cmd.input.length !== 2) throw new Error(`setBalance expected 2 inputs`);
      const address = cmd.input[0];
      const amount = cmd.input[1];
      if (!BywiseHelper.isValidAddress(address)) throw new Error(`invalid address ${address}`);
      if (!BywiseHelper.isValidAmount(amount)) throw new Error(`invalid amount ${amount}`);
      const walletDTO: WalletBalanceDTO = {
        balance: new BigNumber(amount),
        address: address,
      }
      await this.walletProvider.setWalletBalance(ctx, walletDTO);

    } else if (cmd.name == 'addBalance') {
      if (cmd.input.length !== 2) throw new Error(`addBalance expected 2 inputs`);
      const address = cmd.input[0];
      const amount = cmd.input[1];
      if (!BywiseHelper.isValidAddress(address)) throw new Error(`invalid address ${address}`);
      if (!BywiseHelper.isValidAmount(amount)) throw new Error(`invalid amount ${amount}`);
      await ctx.balanceAdd(address, amount);

    } else if (cmd.name == 'subBalance') {
      if (cmd.input.length !== 2) throw new Error(`subBalance expected 2 inputs`);
      const address = cmd.input[0];
      const amount = cmd.input[1];
      await ctx.balanceSub(address, amount);
    } else {
      throw new Error("Method not implemented.");
    }
  }

  private async setInfo(ctx: RuntimeContext, cmd: CommandDTO): Promise<void> {
    if ((!ctx.tx)) {
      throw new Error(`setInfo forbidden`);
    }
    if (cmd.name == 'setInfo' && cmd.input.length === 2) {
      const name = cmd.input[0];
      const value = cmd.input[1];
      if (value.length > 1024 * 1000) throw new Error("Value info too long");

      let walletDTO = await this.walletProvider.getWalletInfo(ctx, ctx.tx.from[0]);
      if (name === 'name') walletDTO.name = value;
      if (name === 'url') walletDTO.url = value;
      if (name === 'bio') walletDTO.bio = value;
      if (name === 'photo') walletDTO.photo = value;
      if (name === 'publicKey') walletDTO.publicKey = value;
      await this.walletProvider.setWalletInfo(ctx, walletDTO);
      return;
    }
    throw new Error("Method not implemented.");
  }
}
