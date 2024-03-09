import Database, { SaveRequest } from "../datasource/database";
import { Votes } from "../models";
import helper from "../utils/helper";

export class VotesRepository {
    private db: Database;
    private readonly table = 'votes';

    constructor(db: Database) {
        this.db = db;
    }

    async save(vote: Votes) {
        const query: SaveRequest[] = [
            { key: `${this.table}-hash-${vote.txHash}`, data: vote },
            { key: `${this.table}-${vote.chain}-height-${helper.numberToString(vote.height)}-${vote.from}-${vote.txHash}`, data: vote.txHash },
            { key: `${this.table}-${vote.chain}-processed-${vote.processed}-${vote.txHash}`, data: vote.txHash },
            { delete: true, key: `${this.table}-${vote.chain}-processed-${!vote.processed}-${vote.txHash}`, data: vote.txHash },
        ];
        await this.db.saveMany(query);
    }

    async saveMany(votes: Votes[]) {
        const query: SaveRequest[] = [];
        votes.forEach(vote => {
            query.push({ key: `${this.table}-hash-${vote.txHash}`, data: vote });
            query.push({ key: `${this.table}-${vote.chain}-height-${helper.numberToString(vote.height)}-${vote.from}-${vote.txHash}`, data: vote.txHash });
            query.push({ key: `${this.table}-${vote.chain}-processed-${vote.processed}-${vote.txHash}`, data: vote.txHash });
            query.push({ delete: true, key: `${this.table}-${vote.chain}-processed-${!vote.processed}-${vote.txHash}`, data: vote.txHash });
        })
        await this.db.saveMany(query);
    }

    async findByChainAndGreaterHeight(chain: string, height: number): Promise<Votes[]> {
        const values = await this.db.findGT(`${this.table}-${chain}-height`, helper.numberToString(height));
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndHeight(chain: string, height: number): Promise<Votes[]> {
        const values = await this.db.find(`${this.table}-${chain}-height-${helper.numberToString(height)}`, 1000000000);
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndHeightAndFrom(chain: string, height: number, from: string): Promise<Votes[]> {
        const values = await this.db.find(`${this.table}-${chain}-height-${helper.numberToString(height)}-${from}`, 1000000000);
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndProcessed(chain: string, processed: boolean): Promise<Votes[]> {
        const values = await this.db.find(`${this.table}-${chain}-processed-${processed}`, 1000000000);
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }
}