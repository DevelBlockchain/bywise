import { EnvironmentChanges } from "@bywise/web3";
import { Environment } from "../models";
import { ApplicationContext, BlockTree, CompiledContext, EnvironmentContext } from "../types";

const ENV_BATCH = 1000;

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
        const envs = await this.EnvironmentRepository.findByChainAndKey(blockTree.chain, key, 1000, 0);
        const env = this.findEnv(envs, blockTree, contextHash, key);
        if (!env || env.value === null) {
            return false;
        } else {
            return true;
        }
    }

    async getSlow(blockTree: BlockTree, contextHash: string, key: string): Promise<string> {
        const envs = await this.EnvironmentRepository.findByChainAndKey(blockTree.chain, key, 1000, 0);
        const env = this.findEnv(envs, blockTree, contextHash, key);
        if (env && env.value !== null) {
            return env.value;
        } else {
            return '';
        }
    }

    async getList(envContext: EnvironmentContext, key: string, limit: number, offset: number): Promise<Environment[]> {
        let envs: Environment[];
        envs = await this.EnvironmentRepository.findByChainAndHashAndKey(envContext.chain, envContext.fromContextHash, key, limit, offset);
        envs = envs.map(env => {
            env.key = env.key.replace(key + '-', '');
            return env;
        });
        return envs;
    }

    async getListSize(envContext: EnvironmentContext, key: string): Promise<number> {
        return await this.EnvironmentRepository.countByChainAndHashAndKey(envContext.chain, envContext.fromContextHash, key);
    }

    async get(envContext: EnvironmentContext, key: string): Promise<Environment | null> {
        const from_context_env = await this.EnvironmentRepository.get(envContext.chain, key, envContext.fromContextHash);
        if (from_context_env) {
            return from_context_env;
        }
        return null;
    }

    async set(envContext: EnvironmentContext, key: string, value: string): Promise<void> {
        await this.EnvironmentRepository.saveMany([{
            key: key,
            value: value,
            chain: envContext.chain,
            hash: envContext.fromContextHash,
        }]);
    }

    async push(changes: EnvironmentChanges, chain: string, toContextHash: string) {
        const saveEnvs: Environment[] = [];
        for (let i = 0; i < changes.keys.length; i++) {
            const key = changes.keys[i];
            const value = changes.values[i];
            saveEnvs.push({
                key: key,
                value: value,
                chain: chain,
                hash: toContextHash,
            });
        }
        await this.EnvironmentRepository.saveMany(saveEnvs);
    }

    async mergeContext(chain: string, fromContextHash: string, toContextHash: string) {
        let offset = 0;
        let saveEnvs: Environment[];
        do {
            saveEnvs = [];
            const envs = await this.EnvironmentRepository.findByChainAndHash(chain, fromContextHash, ENV_BATCH, offset);
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
            offset += ENV_BATCH;
        } while (saveEnvs.length > 0);
    }

    async getLastConsolidatedContextHash(blockTree: BlockTree, compiledContext: CompiledContext) {
        const main_context_last_hash_env = await this.EnvironmentRepository.get(blockTree.chain, `config-last_hash`, compiledContext);
        let lastHash: string = BlockTree.ZERO_HASH;
        if (main_context_last_hash_env && main_context_last_hash_env.value) {
            lastHash = main_context_last_hash_env.value;
        }
        return lastHash;
    }

    async setLastConsolidatedContextHash(blockTree: BlockTree, contextHash: string, compiledContext: CompiledContext) {
        await this.EnvironmentRepository.save({
            chain: blockTree.chain,
            key: `config-last_hash`,
            hash: compiledContext,
            value: contextHash,
        });
    }

    async consolide(blockTree: BlockTree, contextHash: string, compiledContext: CompiledContext) {
        let lastConsolidatedContextHash: string = await this.getLastConsolidatedContextHash(blockTree, compiledContext);
        if (contextHash == lastConsolidatedContextHash) {
            return;
        }
        await this.consolideFromHash(blockTree, lastConsolidatedContextHash, contextHash, compiledContext);
        await this.setLastConsolidatedContextHash(blockTree, contextHash, compiledContext);
    }

    private async consolideFromHash(blockTree: BlockTree, fromContextHash: string, toContextHash: string, compiledContext: CompiledContext) {
        if (toContextHash === BlockTree.ZERO_HASH) {
            await this.clearContext(blockTree.chain, compiledContext);
        } else if (fromContextHash !== toContextHash) {
            const lastHash = blockTree.getLastHash(toContextHash);
            await this.consolideFromHash(blockTree, fromContextHash, lastHash, compiledContext);
        }
        await this.mergeContext(blockTree.chain, toContextHash, compiledContext);
    }

    public async clearContext(chain: string, compiledContext: CompiledContext) {
        this.logger.warn(`EnvironmentProvider.clearContext`);
        let delEnvs: Environment[] = [];
        do {
            delEnvs = await this.EnvironmentRepository.findByChainAndHash(chain, compiledContext, ENV_BATCH, 0);
            await this.EnvironmentRepository.delMany(delEnvs);
        } while (delEnvs.length > 0);
    }
}