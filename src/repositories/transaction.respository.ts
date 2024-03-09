import Database, { SaveRequest } from "../datasource/database";
import { Transaction } from "../models";
import { BlockchainStatus } from "../types";

export class TransactionRepository {
    private db: Database;
    private readonly table = 'transaction';

    constructor(db: Database) {
        this.db = db;
    }

    async save(tx: Transaction) {
        const query: SaveRequest[] = [
            { key: `${this.table}-hash-${tx.tx.hash}`, data: tx },
            { key: `${this.table}-chain-${tx.tx.chain}-${tx.tx.created}-${tx.tx.hash}`, data: tx.tx.hash },
        ];
        Object.values(BlockchainStatus).forEach(status => {
            if (status === tx.status) {
                query.push({ key: `${this.table}-status-${status}-${tx.tx.chain}-${tx.tx.created}-${tx.tx.hash}`, data: tx.tx.hash });
            } else {
                query.push({ delete: true, key: `${this.table}-status-${status}-${tx.tx.chain}-${tx.tx.created}-${tx.tx.hash}`, data: tx.tx.hash });
            }
        })
        const addresses: string[] = []
        tx.tx.from.forEach(address => {
            if (!addresses.includes(address)) {
                addresses.push(address)
            }
            query.push({ key: `${this.table}-from-${tx.tx.chain}-${address}-${tx.tx.created}-${tx.tx.hash}`, data: tx.tx.hash });
        });
        tx.tx.to.forEach(address => {
            if (!addresses.includes(address)) {
                addresses.push(address)
            }
            query.push({ key: `${this.table}-to-${tx.tx.chain}-${address}-${tx.tx.created}-${tx.tx.hash}`, data: tx.tx.hash });
        });
        addresses.forEach(address => {
            query.push({ key: `${this.table}-address-${tx.tx.chain}-${address}-${tx.tx.created}-${tx.tx.hash}`, data: tx.tx.hash });
        });
        if (tx.tx.foreignKeys) {
            tx.tx.foreignKeys.forEach(key => {
                query.push({ key: `${this.table}-key-${tx.tx.chain}-${key}-${tx.tx.created}-${tx.tx.hash}`, data: tx.tx.hash });
            });
        }
        await this.db.saveMany(query);
    }

    async findByHash(hash: string): Promise<Transaction | null> {
        return await this.db.get(`${this.table}-hash-${hash}`);
    }

    async findByHashs(hashs: string[]): Promise<Transaction[]> {
        return await this.db.getMany(hashs.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChain(chain: string, limit?: number, offset?: number, order: 'asc' | 'desc' = 'asc'): Promise<Transaction[]> {
        const values = await this.db.find(`${this.table}-chain-${chain}`, limit, offset, order === 'desc');
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndStatus(chain: string, status: BlockchainStatus, limit?: number, offset?: number, order: 'asc' | 'desc' = 'asc'): Promise<Transaction[]> {
        const values = await this.db.find(`${this.table}-status-${status}-${chain}`, limit, offset, order === 'desc');
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndFrom(chain: string, address: string, limit: number, offset: number, order: 'asc' | 'desc'): Promise<Transaction[]> {
        const values = await this.db.find(`${this.table}-from-${chain}-${address}`, limit, offset, order === 'desc');
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndTo(chain: string, address: string, limit: number, offset: number, order: 'asc' | 'desc'): Promise<Transaction[]> {
        const values = await this.db.find(`${this.table}-to-${chain}-${address}`, limit, offset, order === 'desc');
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndAddress(chain: string, address: string, limit: number, offset: number, order: 'asc' | 'desc'): Promise<Transaction[]> {
        const values = await this.db.find(`${this.table}-address-${chain}-${address}`, limit, offset, order === 'desc');
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndKey(chain: string, key: string, limit: number, offset: number, order: 'asc' | 'desc'): Promise<Transaction[]> {
        const values = await this.db.find(`${this.table}-key-${chain}-${key}`, limit, offset, order === 'desc');
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async count(): Promise<number> {
        return await this.db.count(`${this.table}-hash`);
    }

    async countByChain(chain: string): Promise<number> {
        return await this.db.count(`${this.table}-chain-${chain}`);
    }

    async countByStatus(status: BlockchainStatus): Promise<number> {
        return await this.db.count(`${this.table}-status-${status}`);
    }

    async countByChainAndStatus(chain: string, status: BlockchainStatus): Promise<number> {
        return await this.db.count(`${this.table}-status-${status}-${chain}`);
    }

    async countByChainAndFrom(chain: string, address: string): Promise<number> {
        return await this.db.count(`${this.table}-from-${chain}-${address}`);
    }

    async countByChainAndTo(chain: string, address: string): Promise<number> {
        return await this.db.count(`${this.table}-to-${chain}-${address}`);
    }

    async countByChainAndAddress(chain: string, address: string): Promise<number> {
        return await this.db.count(`${this.table}-address-${chain}-${address}`);
    }

    async countByChainAndKey(chain: string, key: string): Promise<number> {
        return await this.db.count(`${this.table}-key-${chain}-${key}`);
    }
}