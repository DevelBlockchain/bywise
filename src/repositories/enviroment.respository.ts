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
            batch.push({ key: `${this.table}-${env.chain}-hash-${env.hash}-${env.key}`, data: env });
        })
        await this.db.saveMany(batch);
    }

    async getByChainAndHash(chain: string, hash: string): Promise<Environment[]> {
        return await this.db.getAll(`${this.table}-${chain}-hash-${hash}`);
    }

    async findByChainAndHashAndKey(chain: string, hash: string, key: string , limit: number, offset: number): Promise<Environment[]> {
        return await this.db.find(`${this.table}-${chain}-hash-${hash}-${key}`, limit, offset);
    }

    async countByChainAndHash(chain: string, hash: string): Promise<number> {
        return await this.db.count(`${this.table}-${chain}-hash-${hash}`);
    }

    async count(chain: string, hash: string, key: string): Promise<number> {
        return await this.db.count(`${this.table}-${chain}-hash-${hash}-${key}`);
    }

    async get(chain: string, hash: string, key: string): Promise<Environment | null> {
        return await this.db.get(`${this.table}-${chain}-hash-${hash}-${key}`);
    }

    async delAll(chain: string, hash: string): Promise<void> {
        return await this.db.delMany(`${this.table}-${chain}-hash-${hash}`);
    }
}