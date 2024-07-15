import { Tx } from "@bywise/web3";
import Database, { SaveRequest } from "../datasource/database";

export class TransactionRepository {
    private db: Database;
    public mempool: Map<string, Tx> = new Map();
    private readonly table = 'transaction';

    constructor(db: Database) {
        this.db = db;
    }

    addMempool(tx: Tx) {
        let mempoolTx: Tx | undefined = this.mempool.get(tx.hash);
        if (!mempoolTx) {
            tx.isValid();
            this.mempool.set(tx.hash, tx);
        }
        return mempoolTx;
    }

    getMempoolArray(size: number): Tx[] {
        const txs: Tx[] = [];
        for (let [hash, mempoolTx] of this.mempool) {
            if(txs.length < size) {
                txs.push(mempoolTx);
            } else {
                break;
            }
        }
        for (let i = 0; i < txs.length; i++) {
            this.mempool.delete(txs[i].hash);
        }
        return txs;
    }

    async saveTxMany(txs: Tx[]) {
        const query: SaveRequest[] = [];
        for (let i = 0; i < txs.length; i++) {
            const tx = txs[i];

            query.push({ key: `${this.table}-hash-${tx.hash}`, data: tx });
            query.push({ key: `${this.table}-chain-${tx.chain}-${tx.created}-${tx.hash}`, data: tx.hash });

            const addresses: string[] = []
            tx.from.forEach(address => {
                if (!addresses.includes(address)) {
                    addresses.push(address)
                }
                query.push({ key: `${this.table}-from-${tx.chain}-${address}-${tx.created}-${tx.hash}`, data: tx.hash });
            });
            tx.to.forEach(address => {
                if (!addresses.includes(address)) {
                    addresses.push(address)
                }
                query.push({ key: `${this.table}-to-${tx.chain}-${address}-${tx.created}-${tx.hash}`, data: tx.hash });
            });
            addresses.forEach(address => {
                query.push({ key: `${this.table}-address-${tx.chain}-${address}-${tx.created}-${tx.hash}`, data: tx.hash });
            });
            if (tx.foreignKeys) {
                tx.foreignKeys.forEach(key => {
                    query.push({ key: `${this.table}-key-${tx.chain}-${key}-${tx.created}-${tx.hash}`, data: tx.hash });
                });
            }

        }
        await this.db.saveMany(query);
    }

    async getFromMempool(hash: string): Promise<Tx | null> {
        const mempoolTx = this.mempool.get(hash);
        if(mempoolTx) {
            this.mempool.delete(hash);
            return mempoolTx;
        }
        return null;
    }

    async findTxByHash(hash: string): Promise<Tx | null> {
        return await this.db.get(`${this.table}-hash-${hash}`);
    }

    async findTxByHashs(hashs: string[]): Promise<Tx[]> {
        return await this.db.getMany(hashs.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChain(chain: string, limit?: number, offset?: number, order: 'asc' | 'desc' = 'asc'): Promise<Tx[]> {
        const values = await this.db.find(`${this.table}-chain-${chain}`, limit, offset, order === 'desc');
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndFrom(chain: string, address: string, limit: number, offset: number, order: 'asc' | 'desc'): Promise<Tx[]> {
        const values = await this.db.find(`${this.table}-from-${chain}-${address}`, limit, offset, order === 'desc');
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndTo(chain: string, address: string, limit: number, offset: number, order: 'asc' | 'desc'): Promise<Tx[]> {
        const values = await this.db.find(`${this.table}-to-${chain}-${address}`, limit, offset, order === 'desc');
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndAddress(chain: string, address: string, limit: number, offset: number, order: 'asc' | 'desc'): Promise<Tx[]> {
        const values = await this.db.find(`${this.table}-address-${chain}-${address}`, limit, offset, order === 'desc');
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async findByChainAndKey(chain: string, key: string, limit: number, offset: number, order: 'asc' | 'desc'): Promise<Tx[]> {
        const values = await this.db.find(`${this.table}-key-${chain}-${key}`, limit, offset, order === 'desc');
        return await this.db.getMany(values.map(hash => `${this.table}-hash-${hash}`))
    }

    async count(): Promise<number> {
        return await this.db.count(`${this.table}-hash`);
    }

    async countByChain(chain: string): Promise<number> {
        return await this.db.count(`${this.table}-chain-${chain}`);
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