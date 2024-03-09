import BigNumber from "bignumber.js";

export class ConfigDTO {
  chain: string;
  name: string;
  value: string;
  type: 'number' | 'boolean';

  constructor(data: Partial<ConfigDTO>) {
    this.chain = data.chain ?? '';
    this.name = data.name ?? '';
    this.value = data.value ?? '0';
    this.type = data.type ?? 'number';

    this.setValue(this.value);
  }

  setValue(value: string) {
    this.value = value;
    if (this.type === 'number') {
      if (new BigNumber(this.value).isNaN()) throw new Error('invalid config value ' + this.value);
    } else if (this.type === 'boolean') {
      if (this.value !== 'true' && this.value !== 'false') throw new Error('invalid config value ' + this.value);
    } else {
      throw new Error('invalid config type ' + this.type);
    }
  }

  toBoolean() {
    return this.value === 'true';
  }

  toNumber() {
    return new BigNumber(this.value);
  }
}

export type NodeDTOType = {
  address?: string;
  isFullNode: boolean;
  host: string;
  version: string;
  updated: string;
  token?: string;
}

export type InfoDTO = {

  address: string;
  host?: string;
  version: string;
  timestamp: string;
  isFullNode: boolean;
  nodesLimit: number;
  explorer: string;
  nodes: NodeDTOType[];
  configs: ConfigDTO[];
}