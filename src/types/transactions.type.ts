import { TxType, Tx } from '@bywise/web3';
import BigNumber from "bignumber.js";
import { EnvironmentChanges, EnvironmentContext } from './environment.types';

export enum BlockchainStatus {
  TX_MEMPOOL = 'mempool',
  TX_CONFIRMED = 'confirmed',
  TX_MINED = 'mined',
  TX_FAILED = 'failed',
}

export type TxSimpleModelDTO = {
  from: string;
  to: string;
  amount: string;
  type: TxType;
  foreignKeys?: string[];
  data: any;
}

export class TransactionsDTO {
  tx: Tx;
  status: string;
  output?: TransactionOutputDTO;
  slicesHash?: string;
  blockHash?: string;

  constructor(data: any) {
    this.tx = data.tx ?? new Tx();
    this.status = data.status ?? '';
    this.output = data.output;
    this.slicesHash = data.slicesHash;
    this.blockHash = data.blockHash;
  }
}

export type SliceModelDTO = {
  height: number;
  transactions: string[];
  version: string;
  lastBlockHash: string;
  created: string;
  from: string;
  next: string;
  hash: string;
  sign: string;
}

export type BlockModelDTO = {
  height: number;
  slices: string[];
  version: string;
  lastHash: string;
  from: string;
  nextSlice: string;
  nextBlock: string;
  created: string;
  hash: string;
  sign: string;
  externalTxID?: string[];
}

export type ValueDTO = {
  value: string;
}

export type ValueBooleanDTO = {
  value: boolean;
}

export type VariableDTO = {
  value: any;
}

export type TransactionEventEntry = {
  key: string;
  value: string;
}

export type TransactionEvent = {
  contractAddress: string;
  eventName: string;
  entries: TransactionEventEntry[];
  hash: string;
}

export type TransactionChanges = {
  get: string[];
  walletAddress: string[];
  walletAmount: string[];
  envOut: EnvironmentChanges
}

export class TransactionOutputDTO {
  cost: number;
  size: number;
  fee: string;
  feeUsed: string;
  debit: string;
  logs: string[];
  events: TransactionEvent[];
  error?: string;
  stack?: string;
  output: any;
  changes: TransactionChanges;

  constructor() {
    this.cost = 0;
    this.size = 0;
    this.fee = '';
    this.feeUsed = '';
    this.debit = '';
    this.logs = [];
    this.events = [];
    this.output = '';
    this.changes = {
      get: [],
      walletAddress: [],
      walletAmount: [],
      envOut: {
        keys: [],
        values: [],
      }
    };
  }
}

export class CommandDTO {
  name: string = ''
  input: string[] = []

  constructor(data: any) {
    this.name = data.name;
    this.input = data.input;
  }
}

export type TxBlockchainInfoDTO = {
  tx: any;
  slice?: SliceModelDTO;
  block?: BlockModelDTO;
}


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

export type WalletInfoDTO = {
  address: string;
  name?: string;
  photo?: string;
  url?: string;
  bio?: string;
  publicKey?: string;
}

export type WalletBalanceDTO = {
  address: string;
  balance: BigNumber;
}

export type WalletCodeDTO = {
  address: string;
  status: string;
  abi: ABIMethod[];
  code: string;
  calls: string[];
}

export type TransactionsToExecute = {
  id: string;
  error?: string;
  env: EnvironmentContext;
  txs: Tx[];
  outputs: TransactionOutputDTO[];
  envOut: EnvironmentChanges;
}
