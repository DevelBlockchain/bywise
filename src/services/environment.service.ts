import { Environment } from "../models";
import { SimulateDTO } from "../types";
import { BlockTree, EnvironmentContext } from "../types/environment.types";
import { ApplicationContext } from "../types/task.type";
import helper from "../utils/helper";

export class EnvironmentProvider {

    public static busy = false;

    private EnvironmentRepository;

    constructor(applicationContext: ApplicationContext) {
        this.EnvironmentRepository = applicationContext.database.EnvironmentRepository;
    }

    private async getFromContextEnv(envContext: EnvironmentContext, key: string): Promise<Environment> {
        let env: Environment | null = null;
        let getEnv = envContext.setStageKeys.get(key);
        if (env == null && getEnv !== undefined) {
            env = getEnv;
        }
        getEnv = envContext.setMainKeys.get(key);
        if (env == null && getEnv !== undefined) {
            env = getEnv;
        }
        getEnv = envContext.getStageKeys.get(key);
        if (env == null && getEnv !== undefined) {
            env = getEnv;
        }
        getEnv = envContext.getMainKeys.get(key);
        if (env == null && getEnv !== undefined) {
            env = getEnv;
        }
        getEnv = envContext.getMainKeys.get(key);
        if (env == null) {
            if (envContext.fromContextHash === EnvironmentContext.MAIN_CONTEXT_HASH) {
                const main_context_env = await this.EnvironmentRepository.get(envContext.blockTree.chain, key, EnvironmentContext.MAIN_CONTEXT_HASH);
                if (main_context_env) {
                    env = main_context_env;
                }
            } else {
                const slowEnvs = await this.EnvironmentRepository.findByChainAndKey(envContext.blockTree.chain, key);
                const slowEnv = this.findEnv(slowEnvs, envContext.blockTree, envContext.fromContextHash, key);
                if (slowEnv) {
                    env = slowEnv;
                }
            }
        }
        if (env == null) {
            env = {
                chain: envContext.blockTree.chain,
                key: key,
                hash: envContext.fromContextHash,
                value: null,
            }
        }
        envContext.getStageKeys.set(key, env);
        return env;
    }

    private findEnv(envs: Environment[], blockTree: BlockTree, contextHash: string, key: string): Environment | undefined {
        if (envs.length == 0) {
            return undefined;
        }
        for (let i = 0; i < envs.length; i++) {
            const env = envs[i];
            if (env.hash === contextHash) {
                return env;
            }
        }
        if (contextHash !== BlockTree.ZERO_HASH) {
            const lastHash = blockTree.getLastHash(contextHash);
            if (lastHash === contextHash) return undefined;
            return this.findEnv(envs, blockTree, lastHash, key);
        } else {
            return undefined;
        }
    }

    async getSlowList(blockTree: BlockTree, contextHash: string, key: string): Promise<Environment[]> {
        const envs = await this.EnvironmentRepository.findByChainAndKey(blockTree.chain, key);
        const added: string[] = [];
        const values: Environment[] = [];
        while (contextHash !== BlockTree.ZERO_HASH) {
            envs.forEach(env => {
                if (env.hash === contextHash) {
                    if (!added.includes(env.key)) {
                        values.push(env);
                        added.push(env.key);
                    }
                }
            })
            contextHash = blockTree.getLastHash(contextHash);
        }
        envs.forEach(env => {
            if (env.hash === BlockTree.ZERO_HASH) {
                if (!added.includes(env.key)) {
                    values.push(env);
                    added.push(env.key);
                }
            }
        })
        return values.map(env => {
            env.key = env.key.replace(key + '-', '');
            return env;
        });
    }

    async hasSlow(blockTree: BlockTree, contextHash: string, key: string): Promise<boolean> {
        const envs = await this.EnvironmentRepository.findByChainAndKey(blockTree.chain, key);
        const env = this.findEnv(envs, blockTree, contextHash, key);
        if (!env || env.value === null) {
            return false;
        } else {
            return true;
        }
    }

    async getSlow(blockTree: BlockTree, contextHash: string, key: string): Promise<string> {
        const envs = await this.EnvironmentRepository.findByChainAndKey(blockTree.chain, key);
        const env = this.findEnv(envs, blockTree, contextHash, key);
        if (env && env.value !== null) {
            return env.value;
        } else {
            return '';
        }
    }

    async getList(envContext: EnvironmentContext, key: string): Promise<Environment[]> {
        let envs: Environment[];
        if (envContext.fromContextHash === EnvironmentContext.MAIN_CONTEXT_HASH) {
            envs = await this.EnvironmentRepository.findByChainAndHashAndKey(envContext.blockTree.chain, BlockTree.ZERO_HASH, key);
            envs = envs.map(env => {
                env.key = env.key.replace(key + '-', '');
                return env;
            });
        } else {
            envs = await this.getSlowList(envContext.blockTree, envContext.fromContextHash, key);
        }
        return envs;
    }

    async has(envContext: EnvironmentContext, key: string): Promise<boolean> {
        const env = await this.getFromContextEnv(envContext, key);
        if (env.value !== null) {
            return true;
        }
        return false;
    }

    async get(envContext: EnvironmentContext, key: string): Promise<string> {
        const env = await this.getFromContextEnv(envContext, key);
        if (env.value !== null) {
            return env.value;
        }
        return '';
    }

    set(envContext: EnvironmentContext, key: string, value: string): void {
        const newEnv: Environment = {
            chain: envContext.blockTree.chain,
            key: key,
            hash: EnvironmentContext.MAIN_CONTEXT_HASH,
            value: value,
        };
        envContext.setStageKeys.set(newEnv.key, newEnv);
    }

    delete(envContext: EnvironmentContext, key: string): void {
        const newEnv: Environment = {
            chain: envContext.blockTree.chain,
            key: key,
            hash: EnvironmentContext.MAIN_CONTEXT_HASH,
            value: null,
        };
        envContext.setStageKeys.set(newEnv.key, newEnv);
    }

    deleteCommit(envContext: EnvironmentContext) {
        envContext.setStageKeys.clear();
        envContext.getStageKeys.clear();
    }

    commit(envContext: EnvironmentContext) {
        for (let [key, env] of envContext.setStageKeys) {
            envContext.setMainKeys.set(key, env);
        }
        for (let [key, env] of envContext.getMainKeys) {
            envContext.getMainKeys.set(key, env);
        }
        envContext.setStageKeys.clear();
        envContext.getStageKeys.clear();
    }

    async push(envContext: EnvironmentContext, toContextHash: string) {
        if (envContext.setStageKeys.size > 0) throw new Error(`Environment context not commited`);
        const saveEnvs: Environment[] = [];
        for (let [key, env] of envContext.setMainKeys) {
            saveEnvs.push({
                chain: env.chain,
                key: env.key,
                value: env.value,
                hash: toContextHash,
            });
        }
        await this.EnvironmentRepository.saveMany(saveEnvs);
    }

    async mergeContext(chain: string, fromContextHash: string, toContextHash: string) {
        const saveEnvs: Environment[] = [];
        const envs = await this.EnvironmentRepository.findByChainAndHash(chain, fromContextHash);
        for (let i = 0; i < envs.length; i++) {
            const env = envs[i];
            saveEnvs.push({
                chain: chain,
                key: env.key,
                hash: toContextHash,
                value: env.value,
            });
        }
        await this.EnvironmentRepository.saveMany(saveEnvs);
    }

    async getLastConsolidatedContextHash(blockTree: BlockTree) {
        const main_context_last_hash_env = await this.EnvironmentRepository.get(blockTree.chain, `config-last_hash`, EnvironmentContext.MAIN_CONTEXT_HASH);
        let lastHash: string = BlockTree.ZERO_HASH;
        if (main_context_last_hash_env && main_context_last_hash_env.value) {
            lastHash = main_context_last_hash_env.value;
        }
        return lastHash;
    }

    async setLastConsolidatedContextHash(blockTree: BlockTree, contextHash: string) {
        await this.EnvironmentRepository.save({
            chain: blockTree.chain,
            key: `config-last_hash`,
            hash: EnvironmentContext.MAIN_CONTEXT_HASH,
            value: contextHash,
        });
    }

    async consolide(blockTree: BlockTree, contextHash: string) {
        let lastConsolidatedContextHash: string = await this.getLastConsolidatedContextHash(blockTree);
        if (contextHash == lastConsolidatedContextHash) {
            return;
        }
        await this.consolideFromHash(blockTree, lastConsolidatedContextHash, contextHash);
        await this.setLastConsolidatedContextHash(blockTree, contextHash);
    }

    private async consolideFromHash(blockTree: BlockTree, fromContextHash: string, toContextHash: string) {
        if (toContextHash === BlockTree.ZERO_HASH) {
            await this.clearMainContext(blockTree.chain);
        } else if (fromContextHash !== toContextHash) {
            const lastHash = blockTree.getLastHash(toContextHash);
            await this.consolideFromHash(blockTree, fromContextHash, lastHash);
        }
        await this.mergeContext(blockTree.chain, toContextHash, EnvironmentContext.MAIN_CONTEXT_HASH);
    }

    public async clearMainContext(chain: string) {
        console.log('######## clearMainContext')
        let delEnvs: Environment[] = [];
        do {
            delEnvs = await this.EnvironmentRepository.findByChainAndHash(chain, EnvironmentContext.MAIN_CONTEXT_HASH, 10000);
            await this.EnvironmentRepository.delMany(delEnvs);
        } while (delEnvs.length > 0);
    }
}