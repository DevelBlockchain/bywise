import Database, { SaveRequest } from "../datasource/database";
import { Blocks } from "../models";
import { BlockchainStatus } from "../types";
import helper from "../utils/helper";

export class BlockRepository {
    private db: Database;
    private readonly table = 'blocks';

    constructor(db: Database) {
        this.db = db;
    }

    async save(block: Blocks) {
        const query: SaveRequest[] = [
            { key: `${this.table}-hash-${block.block.hash}`, data: block },
            { key: `${this.table}-height-${block.block.chain}-${helper.numberToString(block.block.height)}-${block.block.hash}`, data: block.block.hash },
        ];
        query.push({ key: `${this.table}-imutable-${block.block.chain}-${block.isImmutable}-${helper.numberToString(block.block.height)}-${block.block.hash}`, data: block.block.hash });
        query.push({ delete: true, key: `${this.table}-imutable-${block.block.chain}-${!block.isImmutable}-${helper.numberToString(block.block.height)}-${block.block.hash}`, data: block.block.hash });
        Object.values(BlockchainStatus).forEach(status => {
            if (status === block.status) {
                query.push({ key: `${this.table}-status-${status}-${block.block.chain}-${helper.numberToString(block.block.height)}-${block.block.hash}`, data: block.block.hash });
            } else {
                query.push({ delete: true, key: `${this.table}-status-${status}-${block.block.chain}-${helper.numberToString(block.block.height)}-${block.block.hash}`, data: block.block.hash });
            }
        })
        if(block.block.height === 0) {
            query.push({ key: `${this.table}-zero-${block.block.chain}`, data: block.block.hash });
        }
        await this.db.saveMany(query);
    }

    async findByHash(hash: string): Promise<Blocks | null> {
        return await this.db.get(`${this.table}-hash-${hash}`);
    }

    async findZeroBlocks(): Promise<Blocks[]> {
        const values = await this.db.find(`${this.table}-zero`);
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndStatus(chain: string, status: string): Promise<Blocks[]> {
        const values = await this.db.find(`${this.table}-status-${status}-${chain}`);
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndStatusAndHeight(chain: string, status: string, height: number): Promise<Blocks[]> {
        const values = await this.db.find(`${this.table}-status-${status}-${chain}-${helper.numberToString(height)}`);
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndGreaterHeight(chain: string, height: number): Promise<Blocks[]> {
        const values = await this.db.findGT(`${this.table}-height-${chain}`, helper.numberToString(height));
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndHeight(chain: string, height: number): Promise<Blocks[]> {
        const values = await this.db.find(`${this.table}-height-${chain}-${helper.numberToString(height)}`);
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findFirstImutableBlockByChain(chain: string): Promise<Blocks | null> {
        const values = await this.db.find(`${this.table}-imutable-${chain}-${true}`, 1, 0, true);
        const blocks = await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
        if (blocks.length > 0) {
            return blocks[0];
        }
        return null;
    }

    async findBlocksLastsByStatus(status: string, chain: string, limit: number, offset: number, order: 'asc' | 'desc'): Promise<Blocks[]> {
        const values = await this.db.find(`${this.table}-status-${status}-${chain}`, limit, offset, order === 'desc');
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async countBlocksByStatus(status: string, chain: string): Promise<number> {
        return await this.db.count(`${this.table}-status-${status}-${chain}`);
    }
}