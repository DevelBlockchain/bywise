import { ConfigDTO } from '../types';
import { BlockTree, EnvironmentContext } from '../types/environment.types';
import { ApplicationContext } from '../types/task.type';
import { EnvironmentProvider } from './environment.service';

type ConfigMeta = {
  lastValue: string,
  value: string,
  lastUpdate: number,
  type: 'number' | 'boolean',
}

export class ConfigProvider {

  static MIN_BWS_VALUE = '10000';

  private environmentProvider: EnvironmentProvider;

  constructor(applicationContext: ApplicationContext) {
    this.environmentProvider = new EnvironmentProvider(applicationContext);
  }

  private getDefaultConfigs(): ConfigDTO[] {
    let configs: ConfigDTO[] = [];
    configs.push(new ConfigDTO({
      chain: '',
      name: "sizeLimit",
      value: "10000000",
      type: "number"
    }))
    configs.push(new ConfigDTO({
      chain: '',
      name: "executeLimit",
      value: "100000",
      type: "number"
    }))
    configs.push(new ConfigDTO({
      chain: '',
      name: "blockTime",
      value: "60",
      type: "number"
    }))
    configs.push(new ConfigDTO({
      chain: '',
      name: "min-bws-block",
      value: ConfigProvider.MIN_BWS_VALUE,
      type: "number"
    }))
    configs.push(new ConfigDTO({
      chain: '',
      name: "min-bws-slice",
      value: ConfigProvider.MIN_BWS_VALUE,
      type: "number"
    }))
    configs.push(new ConfigDTO({
      chain: '',
      name: "poi",
      value: "-1",
      type: "number"
    }))
    configs.push(new ConfigDTO({
      chain: '',
      name: "feeBasic",
      value: "0",
      type: "number"
    }))
    configs.push(new ConfigDTO({
      chain: '',
      name: "feeCoefSize",
      value: "0",
      type: "number"
    }))
    configs.push(new ConfigDTO({
      chain: '',
      name: "feeCoefAmount",
      value: "0",
      type: "number"
    }))
    configs.push(new ConfigDTO({
      chain: '',
      name: "feeCoefCost",
      value: "0",
      type: "number"
    }))
    return configs;
  }

  private findByName(name: string): ConfigDTO | null {
    let cfgs: ConfigDTO[] = this.getDefaultConfigs();
    for (let i = 0; i < cfgs.length; i++) {
      let cfg = cfgs[i];
      if (cfg.name === name) {
        return cfg;
      }
    }
    return null;
  }

  async getSlowConfigByName(blockTree: BlockTree, blockHash: string, blockHeight: number, name: string): Promise<ConfigDTO> {
    let cfg = new ConfigDTO({
      chain: blockTree.chain,
      name: name,
      value: 'false',
      type: 'boolean',
    });
    let configEnv = await this.environmentProvider.getSlow(blockTree, blockHash, `config-${name}`);
    if (configEnv) {
      let cfgMeta: ConfigMeta = JSON.parse(configEnv);
      cfg.type = cfgMeta.type;
      if (blockHeight - cfgMeta.lastUpdate > 60 || cfgMeta.lastUpdate === 0) {
        cfg.setValue(cfgMeta.value);
      } else {
        cfg.setValue(cfgMeta.lastValue);
      }
    } else {
      let defaultCfg = this.findByName(name);
      if (defaultCfg === null) throw new Error(`config ${name} not found`);
      cfg.type = defaultCfg.type;
      cfg.setValue(defaultCfg.value);
    }
    return new ConfigDTO(cfg);
  }

  async isSlowValidator(blockTree: BlockTree, blockHash: string, blockHeight: number, address: string): Promise<boolean> {
    try {
      const isValidatorAddress = await this.getSlowConfigByName(blockTree, blockHash, blockHeight, `validator-${address}`);
      return isValidatorAddress.toBoolean();
    } catch (err) {
      return false;
    }
  }

  async isSlowAdmin(blockTree: BlockTree, blockHash: string, blockHeight: number, address: string): Promise<boolean> {
    try {
      const isAdminAddress = await this.getSlowConfigByName(blockTree, blockHash, blockHeight, `admin-address-${address}`);
      return isAdminAddress.toBoolean();
    } catch (err) {
      return false;
    }
  }

  async getSlowValidators(blockTree: BlockTree, blockHash: string, blockHeight: number) {
    const addresses: string[] = [];
    let envs = await this.environmentProvider.getSlowList(blockTree, blockHash, `config-validator`);
    for (let i = 0; i < envs.length; i++) {
      const env = envs[i];

      if (env.value) {
        let cfgMeta: ConfigMeta = JSON.parse(env.value);
        let value;
        if (blockHeight - cfgMeta.lastUpdate > 60 || cfgMeta.lastUpdate === 0) {
          value = cfgMeta.value;
        } else {
          value = cfgMeta.lastValue;
        }
        if (value === 'true') {
          addresses.push(env.key);
        }
      }
    }
    return addresses;
  }

  async getValidators(envContext: EnvironmentContext) {
    const addresses: string[] = [];
    let envs = await this.environmentProvider.getList(envContext, `config-validator`);
    for (let i = 0; i < envs.length; i++) {
      const env = envs[i];

      if (env.value) {
        let cfgMeta: ConfigMeta = JSON.parse(env.value);
        let value;
        if (envContext.blockHeight - cfgMeta.lastUpdate > 60 || cfgMeta.lastUpdate === 0) {
          value = cfgMeta.value;
        } else {
          value = cfgMeta.lastValue;
        }
        if (value === 'true') {
          addresses.push(env.key);
        }
      }
    }
    return addresses;
  }

  async isValidator(envContext: EnvironmentContext, address: string): Promise<boolean> {
    try {
      const isValidatorAddress = await this.getByName(envContext, `validator-${address}`);
      return isValidatorAddress.toBoolean();
    } catch (err) {
      return false;
    }
  }

  async isAdmin(envContext: EnvironmentContext, address: string): Promise<boolean> {
    try {
      const isAdminAddress = await this.getByName(envContext, `admin-address-${address}`);
      return isAdminAddress.toBoolean();
    } catch (err) {
      return false;
    }
  }

  async getByName(envContext: EnvironmentContext, name: string): Promise<ConfigDTO> {
    let cfg = new ConfigDTO({
      chain: envContext.blockTree.chain,
      name: name,
      value: 'false',
      type: 'boolean',
    });
    let configEnv = await this.environmentProvider.get(envContext, `config-${name}`);
    if (configEnv) {
      let cfgMeta: ConfigMeta = JSON.parse(configEnv);
      cfg.type = cfgMeta.type;
      if (envContext.blockHeight - cfgMeta.lastUpdate > 60 || cfgMeta.lastUpdate === 0) {
        cfg.setValue(cfgMeta.value);
      } else {
        cfg.setValue(cfgMeta.lastValue);
      }
    } else {
      let defaultCfg = this.findByName(name);
      if (defaultCfg === null) throw new Error(`config ${name} not found`);
      cfg.type = defaultCfg.type;
      cfg.setValue(defaultCfg.value);
    }
    return new ConfigDTO(cfg);
  }

  async setConfig(envContext: EnvironmentContext, cfg: ConfigDTO) {
    let defaultCfg = this.findByName(cfg.name);
    const newConfigValue: ConfigMeta = {
      lastValue: defaultCfg !== null ? defaultCfg.value : (cfg.type === 'boolean' ? 'false' : '0'),
      value: cfg.value,
      lastUpdate: envContext.blockHeight,
      type: cfg.type
    }

    let configEnv = await this.environmentProvider.get(envContext, `config-${cfg.name}`);
    if (configEnv) {
      let cfgMeta: ConfigMeta = JSON.parse(configEnv);
      newConfigValue.lastValue = cfgMeta.value;
    }
    await this.environmentProvider.set(envContext, `config-${cfg.name}`, JSON.stringify(newConfigValue));
  }
}