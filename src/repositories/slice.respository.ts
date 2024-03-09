import Database, { SaveRequest } from "../datasource/database";
import { Slices } from "../models";
import { BlockchainStatus } from "../types";
import helper from "../utils/helper";

export class SliceRepository {
    private db: Database;
    private readonly table = 'slice';

    constructor(db: Database) {
        this.db = db;
    }

    async save(slice: Slices) {
        const query: SaveRequest[] = [
            { key: `${this.table}-hash-${slice.slice.hash}`, data: slice },
            { key: `${this.table}-blockHeight-${slice.slice.chain}-${helper.numberToString(slice.slice.blockHeight)}-${slice.slice.created}-${slice.slice.hash}`, data: slice.slice.hash },
        ];
        Object.values(BlockchainStatus).forEach(status => {
            if (status === slice.status) {
                query.push({ key: `${this.table}-status-${slice.slice.chain}-${status}-${slice.slice.created}-${slice.slice.hash}`, data: slice.slice.hash });
            } else {
                query.push({ delete: true, key: `${this.table}-status-${slice.slice.chain}-${status}-${slice.slice.created}-${slice.slice.hash}`, data: slice.slice.hash });
            }
        })
        await this.db.saveMany(query);
    }

    async findByHash(hash: string): Promise<Slices | null> {
        return await this.db.get(`${this.table}-hash-${hash}`);
    }
    
    async findByHashs(hashs: string[]): Promise<Slices[]> {
        return await this.db.getMany(hashs.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndBlockHeight(chain: string, blockHeight: number): Promise<Slices[]> {
        const values = await this.db.find(`${this.table}-blockHeight-${chain}-${helper.numberToString(blockHeight)}`);
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndStatus(chain: string, status: string): Promise<Slices[]> {
        const values = await this.db.find(`${this.table}-status-${chain}-${status}`);
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async find(chain: string, status: string, limit: number, offset: number, order: 'asc' | 'desc'): Promise<Slices[]> {
        const values = await this.db.find(`${this.table}-status-${chain}-${status}`, limit, offset, order === 'desc');
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async count(chain: string, status: string): Promise<number> {
        return await this.db.count(`${this.table}-status-${chain}-${status}`);
    }
}