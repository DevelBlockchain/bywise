import { ConfigDTO } from '../types';
import { RuntimeContext } from '../vm/RuntimeContext';

type ConfigMeta = {
  lastValue: string,
  value: string,
  lastUpdate: number,
  type: 'number' | 'boolean',
}

export class ConfigProvider {

  static MIN_BWS_VALUE = '10000';

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
    configs.push(new ConfigDTO({
      chain: '',
      name: "feeCostType",
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

  async isValidator(ctx: RuntimeContext, address: string): Promise<boolean> {
    try {
      const isValidatorAddress = await this.getByName(ctx, `validator-${address}`);
      return isValidatorAddress.toBoolean();
    } catch (err) {
      return false;
    }
  }

  async isAdmin(ctx: RuntimeContext, address: string): Promise<boolean> {
    try {
      const isAdminAddress = await this.getByName(ctx, `admin-address-${address}`);
      return isAdminAddress.toBoolean();
    } catch (err) {
      return false;
    }
  }

  async getByName(ctx: RuntimeContext, name: string): Promise<ConfigDTO> {
    let cfg = new ConfigDTO({
      chain: ctx.env.chain,
      name: name,
      value: 'false',
      type: 'boolean',
    });
    let configEnv = await ctx.get(`config-${name}`);
    if (configEnv) {
      let cfgMeta: ConfigMeta = JSON.parse(configEnv);
      cfg.type = cfgMeta.type;
      if (ctx.env.blockHeight - cfgMeta.lastUpdate > 60 || cfgMeta.lastUpdate === 0) {
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

  async setConfig(ctx: RuntimeContext, cfg: ConfigDTO) {
    let defaultCfg = this.findByName(cfg.name);
    const newConfigValue: ConfigMeta = {
      lastValue: defaultCfg !== null ? defaultCfg.value : (cfg.type === 'boolean' ? 'false' : '0'),
      value: cfg.value,
      lastUpdate: ctx.env.blockHeight,
      type: cfg.type
    }

    let configEnv = await ctx.get(`config-${cfg.name}`);
    if (configEnv) {
      let cfgMeta: ConfigMeta = JSON.parse(configEnv);
      newConfigValue.lastValue = cfgMeta.value;
    }
    await ctx.set(`config-${cfg.name}`, JSON.stringify(newConfigValue));
  }
}