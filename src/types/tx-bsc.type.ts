
export interface TxDTO {
  txId: string;
  fee: string;
}

export type TokenTransactionsDTO = {

  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  from: string;
  to: string;
  contractAddress: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  input: string;
  confirmations: string;

}

export type BscScanDTO = {

  status: string;
  message: string;
  result: TokenTransactionsDTO[];
  
}
