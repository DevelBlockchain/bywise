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

  async getConfigByNameFromMainContext(blockTree: BlockTree, blockHeight: number, name: string): Promise<ConfigDTO> {
    let cfg = new ConfigDTO({
      chain: blockTree.chain,
      name: name,
      value: 'false',
      type: 'boolean',
    });
    let configEnv = await this.environmentProvider.getFromMainContext(blockTree, `config-${name}`);
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

  async isValidatorFromMainContext(blockTree: BlockTree, blockHeight: number, address: string): Promise<boolean> {
    try {
      const isValidatorAddress = await this.getConfigByNameFromMainContext(blockTree, blockHeight, `validator-${address}`);
      return isValidatorAddress.toBoolean();
    } catch (err) {
      return false;
    }
  }

  async isAdminFromMainContext(blockTree: BlockTree, blockHeight: number, address: string): Promise<boolean> {
    try {
      const isAdminAddress = await this.getConfigByNameFromMainContext(blockTree, blockHeight, `admin-address-${address}`);
      return isAdminAddress.toBoolean();
    } catch (err) {
      return false;
    }
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
    this.environmentProvider.set(envContext, `config-${cfg.name}`, JSON.stringify(newConfigValue));
  }
}