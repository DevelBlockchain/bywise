import BigNumber from "bignumber.js";
import { CommandDTO, SimulateDTO, TransactionOutputDTO } from '../types/transactions.type';
import { TxType, BywiseHelper, Tx, SliceData } from '@bywise/web3';
import { ConfigProvider } from "./configs.service";
import { ApplicationContext } from "../types/task.type";
import { WalletProvider } from "./wallet.service";
import BywiseRuntime, { BywiseContractContext } from "../vm/BywiseRuntime";
import BlockchainBywise from "../vm/BlockchainBywise";
import { EnvironmentProvider } from "./environment.service";
import { GetContract } from "../vm/BlockchainInterface";
import { ConfigDTO } from "../types";
import { Votes } from "../models";

export class VirtualMachineProvider {

  private configsProvider;
  private environmentProvider;
  private walletProvider;
  private applicationContext;
  private blockchainBywise;

  constructor(applicationContext: ApplicationContext) {
    this.applicationContext = applicationContext;
    this.configsProvider = new ConfigProvider(applicationContext);
    this.environmentProvider = new EnvironmentProvider(applicationContext);
    this.walletProvider = new WalletProvider(applicationContext);
    this.blockchainBywise = new BlockchainBywise(applicationContext);
  }

  async calcFee(ctx: SimulateDTO, size: BigNumber, amount: BigNumber, cost: BigNumber): Promise<string> {
    let feeBasic = (await this.configsProvider.getByName(ctx.envContext, 'feeBasic')).toNumber();
    let feeCoefSize = (await this.configsProvider.getByName(ctx.envContext, 'feeCoefSize')).toNumber();
    let feeCoefAmount = (await this.configsProvider.getByName(ctx.envContext, 'feeCoefAmount')).toNumber();
    let feeCoefCost = (await this.configsProvider.getByName(ctx.envContext, 'feeCoefCost')).toNumber();

    let fee = feeBasic;
    fee = fee.plus(feeCoefSize.multipliedBy(size));
    fee = fee.plus(feeCoefAmount.multipliedBy(amount));
    fee = fee.plus(feeCoefCost.multipliedBy(cost));
    return new BigNumber(fee.toPrecision(5)).toString();
  }

  async executeTransaction(tx: Tx, slice: { from: string, transactionsData?: SliceData[] }, ctx: SimulateDTO): Promise<TransactionOutputDTO> {
    ctx.sliceFrom = slice.from;
    ctx.output = new TransactionOutputDTO();
    ctx.output.cost = 0;
    ctx.proxyMock = [];
    if (slice.transactionsData) {
      for (let i = 0; i < slice.transactionsData.length; i++) {
        const txData = slice.transactionsData[i];
        if (txData.hash === tx.hash) {
          ctx.proxyMock = txData.data;
        }
      }
    }
    ctx.output.size = JSON.stringify(tx.data).length;
    ctx.tx = tx;

    let totalAmount = new BigNumber(0);
    for (let i = 0; i < tx.to.length; i++) {
      totalAmount = totalAmount.plus(new BigNumber(tx.amount[i]));
    }

    const getContract: GetContract = async (address: string, method: string, inputs: string[]): Promise<{ bcc: BywiseContractContext, code: string, view: boolean, payable: boolean }> => {
      if (!BywiseHelper.isValidAddress(address)) throw new Error(`Invalid address`);
      if (inputs === undefined) throw new Error(`inputs array not found`);
      if (!Array.isArray(inputs)) throw new Error(`Inputs need be an array`);
      const bccString = await this.environmentProvider.get(ctx.envContext, address);
      if (!bccString) throw new Error(`Contract not found`);
      const bcc: BywiseContractContext = JSON.parse(bccString);
      let foundMethod = false;
      let view = false;
      let payable = false;
      for (let i = 0; i < bcc.abi.length; i++) {
        const abiMethod = bcc.abi[i];
        if (abiMethod.name === method) {
          foundMethod = true;
          view = abiMethod.view;
          payable = abiMethod.payable;
          if (inputs.length !== abiMethod.parameters.length) throw new Error(`expected ${abiMethod.parameters.length} inputs`);
        }
      }
      if (!foundMethod) throw new Error(`Invalid method`);
      return {
        payable,
        view,
        bcc,
        code: `globalThis.contract.${method}(${inputs.map(i => `"${i}"`).join(',')});`
      }
    }

    if (tx.type === TxType.TX_CONTRACT) {
      const contractAddress = tx.data.contractAddress;
      const code = tx.data.code;

      if (typeof code !== 'string') throw new Error(`invalid code`);
      if (typeof contractAddress !== 'string') throw new Error(`invalid address`);
      if (!BywiseHelper.isValidAddress(contractAddress)) throw new Error(`invalid address`);
      if (!BywiseHelper.decodeBWSAddress(contractAddress).isContract) throw new Error(`invalid address - not is contract`);

      const oldContract = await this.environmentProvider.get(ctx.envContext, contractAddress);
      if (oldContract) throw new Error(`Cant update contract`);

      let contractAmount = new BigNumber(0);
      for (let i = 0; i < tx.to.length; i++) {
        if (tx.to[i] === contractAddress) {
          contractAmount = contractAmount.plus(new BigNumber(tx.amount[i]));
        }
      }
      if (!contractAmount.isEqualTo(new BigNumber('0'))) throw new Error(`Method not is payable`);

      const bcc = await BywiseRuntime.execContract(this.blockchainBywise, getContract, ctx, contractAddress, tx.from[0], contractAmount.toString(), code);

      this.environmentProvider.set(ctx.envContext, contractAddress, JSON.stringify(bcc));
      ctx.output.output = {
        contractAddress: contractAddress,
        abi: bcc.abi
      }
    } else if (tx.type === TxType.TX_CONTRACT_EXE) {

      for (let i = 0; i < tx.to.length; i++) {
        const to = tx.to[i];

        if (BywiseHelper.isContractAddress(to)) {
          const contract = await getContract(to, tx.data[i].method, tx.data[i].inputs);

          if (!contract.payable && !(new BigNumber(tx.amount[i])).isEqualTo(new BigNumber('0'))) throw new Error(`Method not is payable`);
          ctx.output.output = await BywiseRuntime.execInContract(this.blockchainBywise, getContract, ctx, to, contract.bcc, tx.from[0], tx.amount[i], contract.code);
        }
      }
    } else if (tx.type === TxType.TX_COMMAND) {
      let cmd = new CommandDTO(tx.data);
      await this.setConfig(ctx, cmd);
    } else if (tx.type === TxType.TX_BLOCKCHAIN_COMMAND) {
      let cmd = new CommandDTO(tx.data);
      await this.blockchainCommand(ctx, cmd);
    } else if (tx.type === TxType.TX_COMMAND_INFO) {
      let cmd = new CommandDTO(tx.data);
      await this.setInfo(ctx, cmd);
    }

    let feeUsed = await this.calcFee(ctx, new BigNumber(ctx.output.size), totalAmount, new BigNumber(ctx.output.cost));
    if (tx.type === TxType.TX_COMMAND || tx.type === TxType.TX_BLOCKCHAIN_COMMAND) {
      feeUsed = "0";
    }
    if (ctx.checkWalletBalance === true && (new BigNumber(tx.fee).isLessThan(new BigNumber(feeUsed)))) {
      throw new Error(`Invalid fee`);
    }

    ctx.totalFee = ctx.totalFee.plus(feeUsed);
    let debit = new BigNumber(feeUsed);
    for (let i = 0; i < tx.amount.length; i++) {
      const amount = new BigNumber(tx.amount[i]);
      debit = debit.plus(amount);
    }

    for (let i = 0; i < tx.to.length; i++) {
      const to = tx.to[i];
      if (BywiseHelper.isContractAddress(to)) {
        const amount = ctx.output.payableContracts.get(to);
        if (amount !== undefined) {
          const amountBN = new BigNumber(amount);

          const balanceDTO = await this.walletProvider.getWalletBalance(ctx.envContext, to);

          if (balanceDTO.balance.minus(amountBN).isLessThan(new BigNumber(0))) {
            throw new Error(`Contract with insufficient funds`);
          }

          if (amountBN.isGreaterThan(new BigNumber(feeUsed))) {
            throw new Error(`Contract only can pay used fee`);
          }

          debit = debit.minus(amountBN);
          balanceDTO.balance = balanceDTO.balance.minus(amountBN);

          this.walletProvider.setWalletBalance(ctx.envContext, balanceDTO);
        }
      }
    }
    for (let i = 0; i < tx.from.length; i++) {
      const from = tx.from[i];

      if (BywiseHelper.isContractAddress(from) && from !== BywiseHelper.ZERO_ADDRESS) {
        throw new Error(`Invalid from address`);
      }

      const balanceDTO = await this.walletProvider.getWalletBalance(ctx.envContext, from);

      if (balanceDTO.balance.minus(debit).isLessThan(new BigNumber(0))) {
        debit = debit.minus(balanceDTO.balance);
        balanceDTO.balance = (new BigNumber(0));
      } else {
        balanceDTO.balance = balanceDTO.balance.minus(debit);
        debit = new BigNumber(0);
      }
      this.walletProvider.setWalletBalance(ctx.envContext, balanceDTO);
    }
    if (ctx.checkWalletBalance === true && !debit.isEqualTo(new BigNumber(0))) {
      throw new Error('insufficient funds');
    }
    for (let i = 0; i < tx.to.length; i++) {
      const to = tx.to[i];
      const amount = new BigNumber(tx.amount[i]);

      const balanceDTO = await this.walletProvider.getWalletBalance(ctx.envContext, to);
      balanceDTO.balance = balanceDTO.balance.plus(new BigNumber(amount));
      this.walletProvider.setWalletBalance(ctx.envContext, balanceDTO);
    }

    ctx.output.fee = tx.fee;
    ctx.output.feeUsed = feeUsed;

    ctx.tx = undefined;
    ctx.nonce++;
    return ctx.output;
  }

  async checkAdminAddress(ctx: SimulateDTO) {
    if (ctx.tx && ctx.envContext.blockHeight > 0) {
      let isAdmin = await this.configsProvider.isAdmin(ctx.envContext, ctx.tx.from[0]);
      if (!isAdmin) {
        throw new Error(`setConfig forbidden`);
      }
    }
  }

  async blockchainCommand(ctx: SimulateDTO, cmd: CommandDTO): Promise<void> {
    if (!ctx.tx) throw new Error(`Blockchain Command Forbidden`);
    ctx.tx = new Tx(ctx.tx);

    if (cmd.name == 'vote-block') {
      if (cmd.input.length !== 2) throw new Error(`vote-block expected 2 inputs`);
      if (!/^[0-9]+$/.test(cmd.input[1])) throw new Error(`invalid height`);

      const from = ctx.tx.from[0];
      const hash = cmd.input[0];
      const height = parseInt(cmd.input[1]);
      const isValidator = await this.configsProvider.isValidator(ctx.envContext, from);

      const newVote: Votes = {
        chain: ctx.envContext.blockTree.chain,
        txHash: ctx.tx.hash,
        blockHash: hash,
        lastHash: '',
        height: height,
        from: from,
        add: false,
        processed: false,
        valid: isValidator,
      }

      const votes = await this.applicationContext.database.VotesRepository.findByChainAndHeightAndFrom(ctx.envContext.blockTree.chain, height, from);
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
      if (ctx.envContext.blockHeight !== height) throw new Error(`wrong start-slice - ${ctx.envContext.blockHeight}/${height}`);
    } else if (cmd.name == 'end-slice') {
      if (cmd.input.length !== 1) throw new Error(`end-slice expected 1 inputs`);
      if (!/^[0-9]+$/.test(cmd.input[0])) throw new Error(`invalid height`);
      const height = parseInt(cmd.input[0]);
      if (ctx.envContext.blockHeight !== height) throw new Error(`wrong end-slice - ${ctx.envContext.blockHeight}/${height}`);
    } else if (cmd.name == 'poi') {
      if (cmd.input.length !== 3) throw new Error(`start-slice expected 1 inputs`);
      if (!/^[0-9]+$/.test(cmd.input[0])) throw new Error(`invalid height`);
      if (!/^[a-f]+$/.test(cmd.input[1])) throw new Error(`invalid chain`);
      if (!/^[a-f0-9]+$/.test(cmd.input[2])) throw new Error(`invalid hash`);
      //const height = parseInt(cmd.input[0]);
      //const hash = cmd.input[1];

      const address = ctx.tx.from[0];
      const balanceDTO = await this.walletProvider.getWalletBalance(ctx.envContext, address);
      balanceDTO.balance = balanceDTO.balance.minus(new BigNumber("0.1"));
      if (balanceDTO.balance.isLessThan(new BigNumber(0))) {
        balanceDTO.balance = new BigNumber(0);
      }
      this.walletProvider.setWalletBalance(ctx.envContext, balanceDTO);
    } else {
      throw new Error("Method not implemented.");
    }
  }

  async setConfig(ctx: SimulateDTO, cmd: CommandDTO): Promise<void> {
    await this.checkAdminAddress(ctx);

    if (cmd.name == 'setConfig') {
      if (cmd.input.length !== 2) throw new Error(`setConfig expected 2 inputs`);
      const cfgName = cmd.input[0];
      const cfgValue = cmd.input[1];
      const cfg = await this.configsProvider.getByName(ctx.envContext, cfgName);
      cfg.setValue(cfgValue);
      await this.configsProvider.setConfig(ctx.envContext, cfg);

    } else if (cmd.name == 'addAdmin') {
      if (cmd.input.length !== 1) throw new Error(`addAdmin expected 1 inputs`);
      const address = cmd.input[0];
      const cfg = new ConfigDTO({
        chain: ctx.envContext.blockTree.chain,
        name: `admin-address-${address}`,
        value: 'true',
        type: 'boolean',
      })
      await this.configsProvider.setConfig(ctx.envContext, cfg);

    } else if (cmd.name == 'removeAdmin') {
      if (cmd.input.length !== 1) throw new Error(`removeAdmin expected 1 inputs`);
      const address = cmd.input[0];
      const cfg = new ConfigDTO({
        chain: ctx.envContext.blockTree.chain,
        name: `admin-address-${address}`,
        value: 'false',
        type: 'boolean',
      })
      await this.configsProvider.setConfig(ctx.envContext, cfg);

    } else if (cmd.name == 'addValidator') {
      if (cmd.input.length !== 1) throw new Error(`addValidator expected 1 inputs`);
      const address = cmd.input[0];
      const cfg = new ConfigDTO({
        chain: ctx.envContext.blockTree.chain,
        name: `validator-${address}`,
        value: 'true',
        type: 'boolean',
      })
      await this.configsProvider.setConfig(ctx.envContext, cfg);

    } else if (cmd.name == 'removeValidator') {
      if (cmd.input.length !== 1) throw new Error(`removeValidator expected 1 inputs`);
      const address = cmd.input[0];
      const cfg = new ConfigDTO({
        chain: ctx.envContext.blockTree.chain,
        name: `validator-${address}`,
        value: 'false',
        type: 'boolean',
      })
      await this.configsProvider.setConfig(ctx.envContext, cfg);

    } else if (cmd.name == 'setBalance') {
      if (cmd.input.length !== 2) throw new Error(`setBalance expected 2 inputs`);
      const address = cmd.input[0];
      const amount = cmd.input[1];
      if (!BywiseHelper.isValidAddress(address)) throw new Error(`invalid address ${address}`);
      if (!BywiseHelper.isValidAmount(amount)) throw new Error(`invalid amount ${amount}`);
      const balanceDTO = await this.walletProvider.getWalletBalance(ctx.envContext, address);
      balanceDTO.balance = new BigNumber(amount);
      this.walletProvider.setWalletBalance(ctx.envContext, balanceDTO);

    } else if (cmd.name == 'addBalance') {
      if (cmd.input.length !== 2) throw new Error(`addBalance expected 2 inputs`);
      const address = cmd.input[0];
      const amount = cmd.input[1];
      if (!BywiseHelper.isValidAddress(address)) throw new Error(`invalid address ${address}`);
      if (!BywiseHelper.isValidAmount(amount)) throw new Error(`invalid amount ${amount}`);
      const balanceDTO = await this.walletProvider.getWalletBalance(ctx.envContext, address);
      balanceDTO.balance = balanceDTO.balance.plus(new BigNumber(amount));
      this.walletProvider.setWalletBalance(ctx.envContext, balanceDTO);

    } else if (cmd.name == 'subBalance') {
      if (cmd.input.length !== 2) throw new Error(`subBalance expected 2 inputs`);
      const address = cmd.input[0];
      const amount = cmd.input[1];
      if (!BywiseHelper.isValidAddress(address)) throw new Error(`invalid address ${address}`);
      if (!BywiseHelper.isValidAmount(amount)) throw new Error(`invalid amount ${amount}`);
      const balanceDTO = await this.walletProvider.getWalletBalance(ctx.envContext, address);
      balanceDTO.balance = balanceDTO.balance.minus(new BigNumber(amount));
      if (balanceDTO.balance.isLessThan(new BigNumber(0))) {
        balanceDTO.balance = new BigNumber(0);
      }
      this.walletProvider.setWalletBalance(ctx.envContext, balanceDTO);

    } else {
      throw new Error("Method not implemented.");
    }
  }

  async setInfo(ctx: SimulateDTO, cmd: CommandDTO): Promise<void> {
    if ((!ctx.tx)) {
      throw new Error(`setInfo forbidden`);
    }
    if (cmd.name == 'setInfo' && cmd.input.length === 2) {
      const name = cmd.input[0];
      const value = cmd.input[1];
      if (value.length > 1024 * 1000) throw new Error("Value info too long");

      let info = await this.walletProvider.getWalletInfo(ctx.envContext, ctx.tx.from[0]);
      if (name === 'name') info.name = value;
      if (name === 'url') info.url = value;
      if (name === 'bio') info.bio = value;
      if (name === 'photo') info.photo = value;
      if (name === 'publicKey') info.publicKey = value;
      this.walletProvider.setWalletInfo(ctx.envContext, ctx.tx.from[0], info);
      return;
    }
    throw new Error("Method not implemented.");
  }
}
