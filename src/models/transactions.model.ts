import { Tx, TxOutput } from '@bywise/web3';

export type Transaction = {
  tx: Tx,
  status: string,
  isExecuted: boolean,
  output?: TxOutput,
  slicesHash: string,
  blockHash: string,
  create: number,
}