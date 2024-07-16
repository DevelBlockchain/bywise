import { Block } from '@bywise/web3';
import { BlockchainStatus } from '../types';

export type Blocks = {
  block: Block,
  status: BlockchainStatus,
  distance: string,
  attempts: number,
};