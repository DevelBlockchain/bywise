export type ETHChain = {
  name: string;
  proxy: string;
  symbol: string;
  chainID: number;
  provider: string;
  cost: number;
}

export type ETHProxyData = {
  addresses?: string[];
  values?: string[];
  strings?: string[];
  data?: string[];
};

export type ETHAction = {
  proposalId: string;
  from: string;
  proxyChain: string;
  proxyAction: string;
  proxyAddresses?: string[];
  proxyValues?: string[];
  proxyStrings?: string[];
  proxyData?: string[];
  ethHash?: string;
  voteHash?: string;
  error: string[];
  done: boolean;
};