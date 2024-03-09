import { Logger } from 'winston';
import fs from 'fs';
import { Level } from 'level';
import * as repositories from '../repositories';
import MessageQueue, { RequestKeys } from './message-queue';
import helper from '../utils/helper';
import { Transaction } from '../models';

export type SaveRequest = {
    key: string,
    data: any,
    delete?: boolean
}

type FindRequest = {
    key: string,
    gt?: string,
    lt?: string,
    offset: number,
    limit: number,
    reverse: boolean
}

export type FindTransactionsRequest = {
    status: string,
    chain?: string,
    from?: string,
    to?: string,
    tag?: string,
    foreignKey?: string,
    offset: number,
    limit: number,
    reverse: boolean
}

class DatabaseWorker {
    public db: Level;
    private path: string;

    constructor(path: string, mq: MessageQueue) {
        this.path = path;
        if (!fs.existsSync('data')) {
            fs.mkdirSync('data')
        }
        this.db = new Level(`data/${path}`, { valueEncoding: 'json' });

        mq.addRequestListener(RequestKeys.db_save, async (sr: SaveRequest) => {
            return await this.save(sr);
        });
        mq.addRequestListener(RequestKeys.db_save_many, async (sr: SaveRequest[]) => {
            return await this.saveMany(sr);
        });
        mq.addRequestListener(RequestKeys.db_has, async (key: string) => {
            return await this.has(key);
        });
        mq.addRequestListener(RequestKeys.db_get, async (key: string) => {
            return await this.get(key);
        });
        mq.addRequestListener(RequestKeys.db_get_many, async (keys: string[]) => {
            return await this.getMany(keys);
        });
        mq.addRequestListener(RequestKeys.db_find, async (fr: FindRequest) => {
            return await this.find(fr);
        });
        mq.addRequestListener(RequestKeys.db_count, async (key: string) => {
            return await this.count(key);
        });
        mq.addRequestListener(RequestKeys.db_del, async (key: string[]) => {
            return await this.del(key);
        });
        mq.addRequestListener(RequestKeys.db_del_many, async (key: string) => {
            return await this.delMany(key);
        });
    }

    async saveMany(arr: SaveRequest[]): Promise<void> {
        await this.db.batch(arr.map(item => ({
            type: item.delete ? 'del' : 'put',
            key: item.key,
            value: item.data,
        })));
    }

    async save(sr: SaveRequest): Promise<void> {
        if (sr.delete) {
            await this.db.del(sr.key);
        } else {
            await this.db.put(sr.key, sr.data);
        }
    }

    async has(key: string): Promise<boolean> {
        try {
            await this.db.get(key);
            return true;
        } catch (err) {
        }
        return false;
    }

    async find(fr: FindRequest): Promise<any[]> {
        const values = [];
        let count = 0;
        if (fr.gt) {
            for await (const [key, value] of this.db.iterator({ gt: `${fr.key}-${fr.gt}`, lt: `${fr.key}.`, keys: false, limit: fr.offset + fr.limit, reverse: fr.reverse })) {
                if (count >= fr.offset) {
                    values.push(value);
                }
                count++;
            }
        } else if (fr.lt) {
            for await (const [key, value] of this.db.iterator({ gt: `${fr.key}-`, lt: `${fr.key}-${fr.lt}`, keys: false, limit: fr.offset + fr.limit, reverse: fr.reverse })) {
                if (count >= fr.offset) {
                    values.push(value);
                }
                count++;
            }
        } else {
            for await (const [key, value] of this.db.iterator({ gt: `${fr.key}-`, lt: `${fr.key}.`, keys: false, limit: fr.offset + fr.limit, reverse: fr.reverse })) {
                if (count >= fr.offset) {
                    values.push(value);
                }
                count++;
            }
        }
        return values
    }

    async count(key: string): Promise<number> {
        return (await (await this.db.iterator({ gte: `${key}-`, lt: `${key}.`, values: false })).all()).length
    }

    async get(key: string): Promise<any | null> {
        try {
            const data = await this.db.get(key);
            return data;
        } catch (err) {
        }
        return null;
    }

    async getMany(keys: string[]): Promise<any[]> {
        const data = await this.db.getMany(keys);
        return data;
    }

    async del(keys: string[]): Promise<void> {
        await this.db.batch(keys.map(key => ({
            type: 'del',
            key: key,
        })));
    }

    async delMany(key: string): Promise<void> {
        await this.db.clear({ gte: `${key}-`, lt: `${key}.` });
    }

    async drop() {
        await this.db.clear();
    }

    async stop() {
        await this.db.close();
    }
}

class Database {

    static async newDatabase(path: string, mq: MessageQueue, logger: Logger) {
        const database = new Database(path, mq, logger);
        if (database.dw) {
            while (database.dw.db.status !== 'open') {
                await helper.sleep(100);
            }
        }
        return database;
    }

    public dw?: DatabaseWorker;
    public mq;
    public logger;
    public path;
    public EnvironmentRepository;
    public TransactionRepository;
    public SliceRepository;
    public BlockRepository;
    public ServiceRepository;
    public VotesRepository;
    public ETHRepository;
    public EventsRepository;

    private constructor(path: string, mq: MessageQueue, logger: Logger) {
        this.mq = mq;
        this.logger = logger;
        this.path = path;
        if (mq.getThreadId() <= 1) {
            this.dw = new DatabaseWorker(path, mq);
        }
        if (!fs.existsSync('data')) {
            fs.mkdirSync('data')
        }

        this.EnvironmentRepository = new repositories.EnvironmentRepository(this);
        this.TransactionRepository = new repositories.TransactionRepository(this);
        this.SliceRepository = new repositories.SliceRepository(this);
        this.BlockRepository = new repositories.BlockRepository(this);
        this.ServiceRepository = new repositories.ServiceRepository(this);
        this.VotesRepository = new repositories.VotesRepository(this);
        this.ETHRepository = new repositories.ETHRepository(this);
        this.EventsRepository = new repositories.EventsRepository(this);
    }

    async saveMany(arr: SaveRequest[]): Promise<void> {
        return await this.mq.request(RequestKeys.db_save_many, arr);
    }

    async save(sr: SaveRequest): Promise<void> {
        return await this.mq.request(RequestKeys.db_save, sr);
    }

    async has(key: string): Promise<boolean> {
        return await this.mq.request(RequestKeys.db_has, key);
    }

    async find(key: string, limit = 100000, offset = 0, reverse = false): Promise<any[]> {
        return await this.mq.request(RequestKeys.db_find, {
            key,
            limit,
            offset,
            reverse
        });
    }

    async findGT(key: string, value: string, limit = 100000, offset = 0, reverse = false): Promise<any[]> {
        return await this.mq.request(RequestKeys.db_find, {
            key,
            limit,
            offset,
            reverse,
            gt: value
        });
    }

    async findLT(key: string, value: string, limit = 100000, offset = 0, reverse = false): Promise<any[]> {
        return await this.mq.request(RequestKeys.db_find, {
            key,
            limit,
            offset,
            reverse,
            lt: value
        });
    }

    async count(key: string): Promise<number> {
        return await this.mq.request(RequestKeys.db_count, key);
    }

    async get(key: string): Promise<any> {
        return await this.mq.request(RequestKeys.db_get, key);
    }

    async getMany(keys: string[]): Promise<any[]> {
        return await this.mq.request(RequestKeys.db_get_many, keys);
    }

    async del(keys: string[]): Promise<void> {
        return await this.mq.request(RequestKeys.db_del, keys);
    }

    async delMany(key: string): Promise<void> {
        return await this.mq.request(RequestKeys.db_del_many, key);
    }

    async drop() {
        if (this.dw) {
            await this.dw.drop();
        }
    }

    async stop() {
        if (this.dw) {
            await this.dw.stop();
        }
    }
}

export default Database;