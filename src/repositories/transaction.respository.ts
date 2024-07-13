import { Tx } from "@bywise/web3";
import Database, { SaveRequest } from "../datasource/database";
import { Transaction } from "../models";
import { BlockchainStatus, MempoolTx } from "../types";
import helper from "../utils/helper";

export class TransactionRepository {
    private db: Database;
    public mempool: Map<string, MempoolTx> = new Map();
    private readonly table = 'transaction';

    constructor(db: Database) {
        this.db = db;
    }

    addMempool(tx: Tx) {
        let mempoolTx: MempoolTx | undefined = this.mempool.get(tx.hash);
        if (!mempoolTx) {
            //tx.isValid();
            mempoolTx = {
                tx: tx,
                status: BlockchainStatus.TX_MEMPOOL,
                output: tx.output,
                isExecuted: false,
                slicesHash: '',
                blockHash: '',
                received: helper.getNow(),
            }
            this.mempool.set(tx.hash, mempoolTx);
        }
        return mempoolTx;
    }

    getMempoolArray(size: number): MempoolTx[] {
        const txs: MempoolTx[] = [];
        for (let [hash, mempoolTx] of this.mempool) {
            if(txs.length < size) {
                txs.push(mempoolTx);
            } else {
                break;
            }
        }
        for (let i = 0; i < txs.length; i++) {
            this.mempool.delete(txs[i].tx.hash);
        }
        return txs;
    }

    async save(txInfo: Transaction) {
        await this.saveMany([txInfo]);
    }

    async saveMany(txs: Transaction[]) {
        const query: SaveRequest[] = [];
        for (let i = 0; i < txs.length; i++) {
            const txInfo = txs[i];

            query.push({ key: `${this.table}-hash-${txInfo.hash}`, data: txInfo });
            query.push({ key: `${this.table}-chain-${txInfo.chain}-${txInfo.received}-${txInfo.hash}`, data: txInfo.hash });
            Object.values(BlockchainStatus).forEach(status => {
                if (status === txInfo.status) {
                    query.push({ key: `${this.table}-status-${status}-${txInfo.chain}-${txInfo.received}-${txInfo.hash}`, data: txInfo.hash });
                } else {
                    query.push({ delete: true, key: `${this.table}-status-${status}-${txInfo.chain}-${txInfo.received}-${txInfo.hash}`, data: txInfo.hash });
                }
            })
        }
        await this.db.saveMany(query);
    }

    async saveTxMany(txs: Tx[]) {
        const query: SaveRequest[] = [];
        for (let i = 0; i < txs.length; i++) {
            const tx = txs[i];

            query.push({ key: `${this.table}-tx-${tx.hash}`, data: tx });

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

    async getFromMempool(hash: string): Promise<MempoolTx | null> {
        const mempoolTx = this.mempool.get(hash);
        if(mempoolTx) {
            this.mempool.delete(hash);
            return mempoolTx;
        }
        return null;
    }

    async findByHash(hash: string): Promise<Transaction | null> {
        return await this.db.get(`${this.table}-hash-${hash}`);
    }

    async findByHashs(hashs: string[]): Promise<Transaction[]> {
        return await this.db.getMany(hashs.map(hash => `${this.table}-hash-${hash}`))
    }

    async findTxByHash(hash: string): Promise<Tx | null> {
        return await this.db.get(`${this.table}-tx-${hash}`);
    }

    async findTxByHashs(hashs: string[]): Promise<Tx[]> {
        return await this.db.getMany(hashs.map(hash => `${this.table}-tx-${hash}`))
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