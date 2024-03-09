export type Votes = {
  chain: string;
  txHash: string;
  blockHash: string;
  lastHash: string;
  height: number,
  from: string,
  add: boolean,
  processed: boolean,
  valid: boolean,
};