import { Slice, TxOutput } from '@bywise/web3';

export type Slices = {
  slice: Slice,
  isComplete: boolean,
  isExecuted: boolean,
  status: string,
  blockHash: string,
  outputs: TxOutput[],
};