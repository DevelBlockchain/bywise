import Database, { SaveRequest } from "../datasource/database";
import { Events } from "../models";
import helper from "../utils/helper";

export class EventsRepository {
    private db: Database;

    private readonly table = 'events';

    constructor(db: Database) {
        this.db = db;
    }

    formatEvent(event: string) {
        return event.trim().replace(/ /g, '_');
    }

    async save(events: Events[]) {
        const query: SaveRequest[] = [];
        for (let i = 0; i < events.length; i++) {
            const event = events[i];

            
            query.push({ key: `${this.table}-${event.chain}-id-${event.id}`, data: event });
            query.push({ key: `${this.table}-${event.chain}-event-${event.from}-${this.formatEvent(event.event)}-${event.create}-${event.id}`, data: event.id });
            
            const entries = Object.entries(JSON.parse(event.data));
            for (let j = 0; j < entries.length; j++) {
                const [entryKey, entryValue] = entries[j];

                query.push({ key: `${this.table}-${event.chain}-entries-${event.from}-${this.formatEvent(event.event)}-${this.formatEvent(entryKey)}-${this.formatEvent(`${entryValue}`)}-${event.id}-${helper.numberToString(j)}`, data: event.id });
            }
        }
        await this.db.saveMany(query);
    }

    async findByEventAndKey(chain: string, from: string, event: string, key: string, value: string, limit: number, offset: number): Promise<Events[]> {
        const values = await this.db.find(`${this.table}-${chain}-entries-${from}-${this.formatEvent(event)}-${this.formatEvent(key)}-${this.formatEvent(value)}`, limit, offset, true);
        return await this.db.getMany(values.map(id => `${this.table}-${chain}-id-${id}`));
    }

    async findByEvent(chain: string, from: string, event: string, limit: number, offset: number): Promise<Events[]> {
        const values = await this.db.find(`${this.table}-${chain}-event-${from}-${this.formatEvent(event)}`, limit, offset, true);
        return await this.db.getMany(values.map(id => `${this.table}-${chain}-id-${id}`));
    }

    async count(chain: string, from: string, event: string): Promise<number> {
        return await this.db.count(`${this.table}-${chain}-${from}-${this.formatEvent(event)}`);
    }
}