import { Environment } from "../models";
import { BlockTree } from "../types/environment.types";
import { ApplicationContext } from "../types/task.type";

type EnvType = {
    chain: string
    hash: string
    key: string
    value: string
}

export class EnvironmentProvider {

    private EnvironmentRepository;

    constructor(applicationContext: ApplicationContext) {
        this.EnvironmentRepository = applicationContext.database.EnvironmentRepository;
    }

    private findEnv(envs: EnvType[], blockTree: BlockTree, blockHash: string, key: string): EnvType | undefined {
        for (let i = 0; i < envs.length; i++) {
            const env = envs[i];
            if (env.hash === blockHash && env.key === key) {
                return env;
            }
        }
        if (blockHash !== BlockTree.ZERO_HASH) {
            const lastHash = blockTree.getLastHash(blockHash);
            if (blockHash === lastHash) return undefined;
            return this.findEnv(envs, blockTree, lastHash, key);
        } else {
            return undefined
        }
    }

    async has(blockTree: BlockTree, blockHash: string, key: string): Promise<boolean> {
        const envs = await this.EnvironmentRepository.findByChainAndKey(blockTree.chain, key);
        const env = this.findEnv(envs, blockTree, blockHash, key);
        if (!env || env.value === '') {
            return false;
        } else {
            return true;
        }
    }

    async getList(blockTree: BlockTree, blockHash: string, key: string): Promise<Environment[]> {
        const envs = await this.EnvironmentRepository.findByChainAndKey(blockTree.chain, key);
        const added: string[] = [];
        const values: Environment[] = [];
        while (blockHash !== BlockTree.ZERO_HASH) {
            envs.forEach(env => {
                if (env.hash === blockHash) {
                    if (!added.includes(env.key)) {
                        values.push(env);
                        added.push(env.key);
                    }
                }
            })
            blockHash = blockTree.getLastHash(blockHash);
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

    async get(blockTree: BlockTree, blockHash: string, key: string): Promise<string> {
        const envs = await this.EnvironmentRepository.findByChainAndKey(blockTree.chain, key);
        for (let i = 0; i < envs.length; i++) {
            if (envs[i].key !== key) console.log(`invalid search ${key} / ${envs[i].key}`);
        }
        const env = this.findEnv(envs, blockTree, blockHash, key);
        if (env) {
            return env.value;
        } else {
            return '';
        }
    }

    async set(blockTree: BlockTree, blockHash: string, key: string, value: string): Promise<void> {
        const newEnv: Environment = {
            chain: blockTree.chain,
            key: key,
            hash: blockHash,
            value: value,
        };
        await this.EnvironmentRepository.save(newEnv);
    }

    async delete(blockTree: BlockTree, blockHash: string, key: string): Promise<void> {
        const newEnv: Environment = {
            chain: blockTree.chain,
            key: key,
            hash: blockHash,
            value: '',
        };
        await this.EnvironmentRepository.save(newEnv);
    }

    async consolideBlock(blockTree: BlockTree, blockHash: string) {
        const envs = await this.EnvironmentRepository.findByChainAndHash(blockTree.chain, blockHash);
        for (let i = 0; i < envs.length; i++) {
            const env = envs[i];
            await this.set(blockTree, BlockTree.ZERO_HASH, env.key, env.value);
        }
        this.deleteSimulation(blockTree, blockHash);
    }

    async deleteSimulation(blockTree: BlockTree, blockHash: string) {
        blockTree.delHash(blockHash);
        const envs = await this.EnvironmentRepository.findByChainAndHash(blockTree.chain, blockHash);
        await this.EnvironmentRepository.delMany(envs);
    }
}