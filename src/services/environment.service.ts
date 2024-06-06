import { Environment } from "../models";
import { BlockTree } from "../types/environment.types";
import { ApplicationContext } from "../types/task.type";

export class EnvironmentProvider {

    private EnvironmentRepository;

    constructor(applicationContext: ApplicationContext) {
        this.EnvironmentRepository = applicationContext.database.EnvironmentRepository;
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

    async has(blockTree: BlockTree, contextHash: string, key: string): Promise<boolean> {
        const envs = await this.EnvironmentRepository.findByChainAndKey(blockTree.chain, key);
        const env = this.findEnv(envs, blockTree, contextHash, key);
        if (!env || env.value === null) {
            return false;
        } else {
            return true;
        }
    }

    async getList(blockTree: BlockTree, contextHash: string, key: string): Promise<Environment[]> {
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

    async get(blockTree: BlockTree, contextHash: string, key: string): Promise<string> {
        const envs = await this.EnvironmentRepository.findByChainAndKey(blockTree.chain, key);
        const env = this.findEnv(envs, blockTree, contextHash, key);
        if (env && env.value !== null) {
            return env.value;
        } else {
            return '';
        }
    }

    async set(blockTree: BlockTree, contextHash: string, key: string, value: string): Promise<void> {
        const newEnv: Environment = {
            chain: blockTree.chain,
            key: key,
            hash: contextHash,
            value: value,
        };
        await this.EnvironmentRepository.save(newEnv);
    }

    async delete(blockTree: BlockTree, contextHash: string, key: string): Promise<void> {
        const newEnv: Environment = {
            chain: blockTree.chain,
            key: key,
            hash: contextHash,
            value: null,
        };
        await this.EnvironmentRepository.save(newEnv);
    }

    async mergeContext(chain: string, fromContextHash: string, toContextHash: string) {
        const envs = await this.EnvironmentRepository.findByChainAndHash(chain, fromContextHash);
        const saveEnvs: Environment[] = [];
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

    async deleteSimulation(blockTree: BlockTree, contextHash: string) {
        const envs = await this.EnvironmentRepository.findByChainAndHash(blockTree.chain, contextHash);
        await this.EnvironmentRepository.delMany(envs);
        blockTree.delBlock(contextHash);
    }
}