import Database, { SaveRequest } from "../datasource/database";
import { Environment } from "../models";

export class EnvironmentRepository {
    private db: Database;
    private readonly table = 'environment';

    constructor(db: Database) {
        this.db = db;
    }

    async saveMany(env: Environment[]) {
        let batch: SaveRequest[] = [];
        env.forEach(env => {
            batch.push({ key: `${this.table}-${env.chain}-key-${env.key}-${env.hash}`, data: env });
            batch.push({ key: `${this.table}-${env.chain}-hash-${env.hash}-${env.key}`, data: env });
        })
        await this.db.saveMany(batch);
    }

    async save(env: Environment) {
        await this.db.saveMany([
            { key: `${this.table}-${env.chain}-key-${env.key}-${env.hash}`, data: env },
            { key: `${this.table}-${env.chain}-hash-${env.hash}-${env.key}`, data: env },
        ])
    }

    async findByChainAndKey(chain: string, key: string, limit: number = 1000000000): Promise<Environment[]> {
        return await this.db.find(`${this.table}-${chain}-key-${key}`, limit);
    }

    async findByChainAndHash(chain: string, hash: string, limit: number = 1000000000): Promise<Environment[]> {
        return await this.db.find(`${this.table}-${chain}-hash-${hash}`, limit);
    }
    
    async findByChainAndHashAndKey(chain: string, hash: string, key: string, limit: number = 1000000000, offset: number = 0): Promise<Environment[]> {
        return await this.db.find(`${this.table}-${chain}-hash-${hash}-${key}`, limit, offset);
    }

    async countByChainAndHashAndKey(chain: string, hash: string, key: string): Promise<number> {
        return await this.db.count(`${this.table}-${chain}-hash-${hash}-${key}`);
    }

    async get(chain: string, key: string, hash: string): Promise<Environment | null> {
        return await this.db.get(`${this.table}-${chain}-key-${key}-${hash}`);
    }

    async delMany(envs: Environment[]): Promise<void> {
        const keys: string[] = [];
        envs.forEach(env => {
            keys.push(`${this.table}-${env.chain}-key-${env.key}-${env.hash}`);
            keys.push(`${this.table}-${env.chain}-hash-${env.hash}-${env.key}`);
        })
        return await this.db.del(keys);
    }
}