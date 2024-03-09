import Database from "../datasource/database";
import { Services } from "../models";

export class ServiceRepository {
    private db: Database;
    private readonly table = 'service';

    constructor(db: Database) {
        this.db = db;
    }

    async save(service: Services) {
        const query = [
            { key: `${this.table}-id-${service.id}`, data: service },
            { key: `${this.table}-address-${service.address}-${service.id}`, data: service.id },
        ];
        await this.db.saveMany(query);
    }

    async findById(id: string): Promise<Services | null> {
        return await this.db.get(`${this.table}-id-${id}`);
    }

    async findByAddress(address: string): Promise<Services[]> {
        const values = await this.db.find(`${this.table}-address-${address}`);
        return await this.db.getMany(values.map(hash => `${this.table}-id-${hash}`))
    }
}