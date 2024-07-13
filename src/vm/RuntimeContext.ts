import { BywiseHelper, TransactionChanges, TransactionEvent, Tx } from "@bywise/web3";
import { Environment } from "../models";
import { EnvironmentContext } from "../types";
import { EnvironmentProvider } from "../services";

export class RuntimeContext {
    public env: EnvironmentContext;
    public tx: Tx;
    public contractAddress: string;
    public sender: string;
    public amount: string;
    public setMainKeys: Map<string, Environment> = new Map();
    public getMainKeys: Map<string, Environment> = new Map();
    public setStageKeys: Map<string, Environment> = new Map();
    public getStageKeys: Map<string, Environment> = new Map();
    public balances: Map<string, bigint> = new Map();
    public logs: string[] = [];
    public events: TransactionEvent[] = [];
    public virtualMachineStack: number = 0;
    public cost: number = 0;
    public size: number = 0;
    public output: any = 0;
    public environmentProvider: EnvironmentProvider;

    constructor(environmentProvider: EnvironmentProvider, env: EnvironmentContext) {
        this.environmentProvider = environmentProvider;
        this.env = env;
        this.tx = new Tx();
        this.contractAddress = '';
        this.sender = '';
        this.amount = '';
        for (let i = 0; i < env.changes.keys.length; i++) {
            const key = env.changes.keys[i];
            const value = env.changes.values[i];
            this.setMainKeys.set(key, {
                chain: env.chain,
                hash: env.fromContextHash,
                key: key,
                value: value
            });
        }
    }

    private async getFromContextEnv(key: string): Promise<Environment> {
        let env = this.setStageKeys.get(key);
        if (!env) {
            env = this.setMainKeys.get(key);
        }
        if (!env) {
            env = this.getStageKeys.get(key);
        }
        if (!env) {
            env = this.getMainKeys.get(key);
        }
        if (!env) {
            const context_env = await this.environmentProvider.get(this.env, key);
            if (context_env) {
                env = context_env;
            }
        }
        if (!env) {
            env = {
                chain: this.env.chain,
                key: key,
                hash: this.env.fromContextHash,
                value: null,
            }
        }
        this.getStageKeys.set(key, env);
        return env;
    }

    async has(key: string): Promise<boolean> {
        const env = await this.getFromContextEnv(key);
        if (env.value !== null) {
            return true;
        }
        return false;
    }

    async get(key: string): Promise<string> {
        const env = await this.getFromContextEnv(key);
        if (env.value !== null) {
            return env.value;
        }
        return '';
    }

    async set(key: string, value: string): Promise<void> {
        const newEnv: Environment = {
            chain: this.env.chain,
            key: key,
            hash: this.env.fromContextHash,
            value: value,
        };
        this.setStageKeys.set(newEnv.key, newEnv);
    }

    delete(key: string): void {
        const newEnv: Environment = {
            chain: this.env.chain,
            key: key,
            hash: this.env.fromContextHash,
            value: null,
        };
        this.setStageKeys.set(newEnv.key, newEnv);
    }

    balanceAdd = (address: string, amount: string): void => {
        if (!BywiseHelper.isValidAddress(address)) throw new Error('Invalid address');
        if (!BywiseHelper.isValidAmount(amount)) throw new Error('Invalid amount');

        const amoutBN = BigInt(amount);
        let balance = this.balances.get(address);
        if (!balance) {
            balance = 0n;
        }
        balance = balance + amoutBN;
        this.balances.set(address, balance);
    }

    balanceSub = (address: string, amount: string): void => {
        if (!BywiseHelper.isValidAddress(address)) throw new Error('Invalid address');
        if (!BywiseHelper.isValidAmount(amount)) throw new Error('Invalid amount');

        const amoutBN = BigInt(amount);
        let balance = this.balances.get(address);
        if (!balance) {
            balance = 0n;
        }
        balance = balance - amoutBN;
        this.balances.set(address, balance);
    }

    deleteCommit() {
        this.setStageKeys.clear();
        this.getStageKeys.clear();
    }

    commit() {
        for (let [key, env] of this.setStageKeys) {
            this.setMainKeys.set(key, env);
        }
        for (let [key, env] of this.getStageKeys) {
            this.getMainKeys.set(key, env);
        }
        this.setStageKeys.clear();
        this.getStageKeys.clear();
    }

    setChanges(changes: TransactionChanges) {
        changes.get = [];
        changes.envs.keys = [];
        changes.envs.values = [];
        changes.walletAddress = [];
        changes.walletAmount = [];
        for (let [key, valueEnv] of this.getStageKeys) {
            if (!key.startsWith("config-")) {
                changes.get.push(key);
            }
        }
        for (let [key, valueEnv] of this.setStageKeys) {
            changes.envs.keys.push(key);
            changes.envs.values.push(valueEnv.value);
        }
        for (let [address, balance] of this.balances) {
            if (balance !== 0n) {
                changes.walletAddress.push(address);
                changes.walletAmount.push(balance.toString());
            }
        }
    }
}