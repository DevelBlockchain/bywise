import { TxOutput } from '@bywise/web3';

export type Transaction = {
  chain: string,
  hash: string,
  status: string,
  isExecuted: boolean,
  output?: TxOutput,
  slicesHash: string,
  blockHash: string,
  received: number,
}