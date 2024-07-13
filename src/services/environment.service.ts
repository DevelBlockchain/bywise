import { EnvironmentChanges } from "@bywise/web3";
import { Environment } from "../models";
import { ApplicationContext, CompiledContext, EnvironmentContext, ZERO_HASH } from "../types";

export class EnvironmentProvider {

    private EnvironmentRepository;
    private logger;

    constructor(applicationContext: ApplicationContext) {
        this.EnvironmentRepository = applicationContext.database.EnvironmentRepository;
        this.logger = applicationContext.logger;
    }

    async getInContext(chain: string, contextHash: string, key: string): Promise<Environment | null> {
        return await this.EnvironmentRepository.get(chain, contextHash, key);
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
        return await this.EnvironmentRepository.count(envContext.chain, envContext.fromContextHash, key);
    }

    async get(envContext: EnvironmentContext, key: string): Promise<Environment | null> {
        return await this.EnvironmentRepository.get(envContext.chain, envContext.fromContextHash, key);
    }

    async set(envContext: EnvironmentContext, key: string, value: string): Promise<void> {
        await this.EnvironmentRepository.saveMany([{
            key: key,
            value: value,
            chain: envContext.chain,
            hash: envContext.fromContextHash,
        }]);
    }

    async push(changes: EnvironmentChanges, chain: string, toContextHash: string, lastHash: string, currentHash: string) {
        const envs: Environment[] = [];
        for (let i = 0; i < changes.keys.length; i++) {
            const key = changes.keys[i];
            const value = changes.values[i];
            envs.push({
                key: key,
                value: value,
                chain: chain,
                hash: toContextHash,
            });
        }
        envs.push({
            chain: chain,
            key: `config-context`,
            hash: toContextHash,
            value: JSON.stringify({
                lastHash: lastHash,
                currentHash: currentHash,
            }),
        })
        await this.EnvironmentRepository.saveMany(envs);
    }

    async mergeContext(chain: string, fromContextHash: string, toContextHash: string, lastHash: string, currentHash: string) {
        const envs = await this.EnvironmentRepository.getByChainAndHash(chain, fromContextHash);
        for (let i = 0; i < envs.length; i++) {
            const env = envs[i];
            env.chain = chain;
            env.hash = toContextHash;
        }
        envs.push({
            chain: chain,
            key: `config-context`,
            hash: toContextHash,
            value: JSON.stringify({
                lastHash: lastHash,
                currentHash: currentHash,
            }),
        })
        await this.EnvironmentRepository.saveMany(envs);
    }

    async getContext(chain: string, contextHash: string): Promise<{ lastHash: string, currentHash: string } | null> {
        const context_env = await this.EnvironmentRepository.get(chain, contextHash, `config-context`);
        if (context_env && context_env.value) {
            return JSON.parse(context_env.value);
        }
        return null;

    }

    async compile(chain: string, contextTargetHash: string, compiledContext: CompiledContext, currentCompiledHash?: string) {
        if (contextTargetHash === ZERO_HASH) {
            await this.clearContext(chain, compiledContext);
            return;
        }
        if (!currentCompiledHash) {
            const context = await this.getContext(chain, compiledContext);
            if (!context) {
                currentCompiledHash = ZERO_HASH;
            } else {
                currentCompiledHash = context.currentHash;
            }
        }
        let contextTarget = await this.getContext(chain, contextTargetHash);
        if (!contextTarget) throw new Error(`context "${contextTargetHash}" not found!`);

        if (contextTarget.currentHash == currentCompiledHash) {
            return;
        }
        if (contextTarget.lastHash === ZERO_HASH) {
            await this.clearContext(chain, compiledContext);
        } else {
            await this.compile(chain, contextTarget.lastHash, compiledContext, currentCompiledHash);
        }
        await this.mergeContext(chain, contextTarget.currentHash, compiledContext, contextTarget.lastHash, contextTarget.currentHash);
    }

    public async clearContext(chain: string, compiledContext: CompiledContext) {
        this.logger.warn(`EnvironmentProvider.clearContext`);
        await this.EnvironmentRepository.delAll(chain, compiledContext);
    }
}