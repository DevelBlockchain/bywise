import Database, { SaveRequest } from "../datasource/database";
import { ETHAction } from "../models/eth.model";

export class ETHRepository {
    private db: Database;
    private readonly table = 'eth';

    constructor(db: Database) {
        this.db = db;
    }

    async save(action: ETHAction) {
        const query: SaveRequest[] = [
            { key: `${this.table}-proposal-${action.proposalId}`, data: action },
            { key: `${this.table}-done-${action.done}-${action.proposalId}`, data: action.proposalId },
            { delete: true, key: `${this.table}-done-${!action.done}-${action.proposalId}`, data: action.proposalId },
        ];
        await this.db.saveMany(query);
    }

    async findByHash(proposalId: string): Promise<ETHAction | null> {
        return await this.db.get(`${this.table}-proposal-${proposalId}`);
    }

    async findByDone(done: boolean, limit: number): Promise<ETHAction[]> {
        const values = await this.db.find(`${this.table}-done-${done}`, limit);
        return await this.db.getMany(values.map(hash => `${this.table}-proposal-${hash}`))
    }
}