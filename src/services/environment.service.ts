import { Environment } from "../models";
import { BlockTree, CompiledContext, EnvironmentContext } from "../types/environment.types";
import { ApplicationContext } from "../types/task.type";

export class EnvironmentProvider {

    private EnvironmentRepository;
    private logger;

    constructor(applicationContext: ApplicationContext) {
        this.EnvironmentRepository = applicationContext.database.EnvironmentRepository;
        this.logger = applicationContext.logger;
    }

    private findEnv(envs: Environment[], blockTree: BlockTree, contextHash: string, key: string): Environment | null {
        if (envs.length == 0) {
            return null;
        }
        for (let i = 0; i < envs.length; i++) {
            const env = envs[i];
            if (env.hash === contextHash) {
                return env;
            }
        }
        if (contextHash !== BlockTree.ZERO_HASH) {
            const lastHash = blockTree.getLastHash(contextHash);
            if (lastHash === contextHash) return null;
            return this.findEnv(envs, blockTree, lastHash, key);
        } else {
            return null;
        }
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

    private async getFromContextEnv(envContext: EnvironmentContext, key: string): Promise<Environment> {
        let env: Environment | null = null;
        let getEnv = envContext.setStageKeys.get(key);
        if (getEnv !== undefined) {
            env = getEnv;
        }
        if (env == null) {
            getEnv = envContext.setMainKeys.get(key);
            if (getEnv !== undefined) {
                env = getEnv;
            }
        }
        if (env == null) {
            getEnv = envContext.getStageKeys.get(key);
            if (getEnv !== undefined) {
                env = getEnv;
            }
        }
        if (env == null) {
            getEnv = envContext.getMainKeys.get(key);
            if (getEnv !== undefined) {
                env = getEnv;
            }
        }
        if (env == null) {
            if (envContext.fromContextHash === CompiledContext.MAIN_CONTEXT_HASH) {
                const main_context_env = await this.EnvironmentRepository.get(envContext.blockTree.chain, key, CompiledContext.MAIN_CONTEXT_HASH);
                if (main_context_env) {
                    env = main_context_env;
                }
            } else if (envContext.fromContextHash === CompiledContext.SLICE_CONTEXT_HASH) {
                const main_context_env = await this.EnvironmentRepository.get(envContext.blockTree.chain, key, CompiledContext.SLICE_CONTEXT_HASH);
                if (main_context_env) {
                    env = main_context_env;
                }
            } else {
                throw new Error(`invalid context`);
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

    async hasFromMainContext(blockTree: BlockTree, key: string): Promise<boolean> {
        const env = await this.EnvironmentRepository.get(blockTree.chain, key, CompiledContext.MAIN_CONTEXT_HASH);
        if (!env || env.value === null) {
            return false;
        } else {
            return true;
        }
    }

    async getFromMainContext(blockTree: BlockTree, key: string): Promise<string> {
        const env = await this.EnvironmentRepository.get(blockTree.chain, key, CompiledContext.MAIN_CONTEXT_HASH);
        if (env && env.value !== null) {
            return env.value;
        } else {
            return '';
        }
    }

    async getList(envContext: EnvironmentContext, key: string, limit: number, offset: number): Promise<Environment[]> {
        let envs: Environment[];
        if (envContext.fromContextHash === CompiledContext.MAIN_CONTEXT_HASH) {
            envs = await this.EnvironmentRepository.findByChainAndHashAndKey(envContext.blockTree.chain, CompiledContext.MAIN_CONTEXT_HASH, key, limit, offset);
            envs = envs.map(env => {
                env.key = env.key.replace(key + '-', '');
                return env;
            });
        } else {
            throw new Error(`getList only work on MAIN_CONTEXT`);
        }
        return envs;
    }

    async getListSize(envContext: EnvironmentContext, key: string): Promise<number> {
        if (envContext.fromContextHash === CompiledContext.MAIN_CONTEXT_HASH) {
            return await this.EnvironmentRepository.countByChainAndHashAndKey(envContext.blockTree.chain, CompiledContext.MAIN_CONTEXT_HASH, key);
        } else {
            throw new Error(`getList only work on MAIN_CONTEXT`);
        }
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
            hash: CompiledContext.MAIN_CONTEXT_HASH,
            value: value,
        };
        envContext.setStageKeys.set(newEnv.key, newEnv);
    }

    delete(envContext: EnvironmentContext, key: string): void {
        const newEnv: Environment = {
            chain: envContext.blockTree.chain,
            key: key,
            hash: CompiledContext.MAIN_CONTEXT_HASH,
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
        for (let [key, env] of envContext.getStageKeys) {
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
        const main_context_last_hash_env = await this.EnvironmentRepository.get(blockTree.chain, `config-last_hash`, CompiledContext.MAIN_CONTEXT_HASH);
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
            hash: CompiledContext.MAIN_CONTEXT_HASH,
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
        await this.mergeContext(blockTree.chain, toContextHash, CompiledContext.MAIN_CONTEXT_HASH);
    }

    public async clearMainContext(chain: string) {
        this.logger.warn(`EnvironmentProvider.clearMainContext`);
        let delEnvs: Environment[] = [];
        do {
            delEnvs = await this.EnvironmentRepository.findByChainAndHash(chain, CompiledContext.MAIN_CONTEXT_HASH, 10000);
            await this.EnvironmentRepository.delMany(delEnvs);
        } while (delEnvs.length > 0);
    }
}