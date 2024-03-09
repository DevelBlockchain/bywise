import { Slice } from '@bywise/web3';
import { TransactionOutputDTO } from '../types';

export type Slices = {
  slice: Slice,
  isComplete: boolean,
  isExecuted: boolean,
  status: string,
  blockHash: string,
  outputs: TransactionOutputDTO[],
};