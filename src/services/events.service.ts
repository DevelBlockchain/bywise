import { TransactionEvent } from '../types';
import { EnvironmentContext } from '../types/environment.types';
import { ApplicationContext } from '../types/task.type';
import helper from '../utils/helper';
import { EnvironmentProvider } from './environment.service';

export class EventsProvider {

  private environmentProvider: EnvironmentProvider;

  constructor(applicationContext: ApplicationContext) {
    this.environmentProvider = new EnvironmentProvider(applicationContext);
  }

  async saveEvents(envContext: EnvironmentContext, event: TransactionEvent) {
    let eventIntexString = await this.environmentProvider.get(envContext, `events-index`);
    let index = BigInt(eventIntexString ? eventIntexString : '0');
    this.environmentProvider.set(envContext, `events-event-${event.contractAddress}-${event.eventName}-${helper.numberToString(index.toString())}`, JSON.stringify(event));
    index++;
    for (let j = 0; j < event.entries.length; j++) {
      const entry = event.entries[j];
      this.environmentProvider.set(envContext, `events-entries-${event.contractAddress}-${event.eventName}-${entry.key}-${entry.value}-${helper.numberToString(index.toString())}`, JSON.stringify(event));
      index++;
    }
    this.environmentProvider.set(envContext, `events-index`, index.toString());
  }

  async findByEventAndKey(envContext: EnvironmentContext, contractAddress: string, eventName: string, key: string, value: string, limit: number, offset: number): Promise<TransactionEvent[]> {
    const values = await this.environmentProvider.getList(envContext, `events-entries-${contractAddress}-${eventName}-${key}-${value}`, limit, offset);
    return values.map(env => env.value ? env.value : '').filter(json => json !== '').map(json => JSON.parse(json));
  }

  async findByEvent(envContext: EnvironmentContext, contractAddress: string, eventName: string, limit: number, offset: number): Promise<TransactionEvent[]> {
    const values = await this.environmentProvider.getList(envContext, `events-event-${contractAddress}-${eventName}`, limit, offset);
    return values.map(env => env.value ? env.value : '').filter(json => json !== '').map(json => JSON.parse(json));
  }

  async countEventsByKey(envContext: EnvironmentContext, contractAddress: string, eventName: string, key: string, value: string): Promise<number> {
    return await this.environmentProvider.getListSize(envContext, `events-entries-${contractAddress}-${eventName}-${key}-${value}`);
  }

  async countEvents(envContext: EnvironmentContext, contractAddress: string, eventName: string): Promise<number> {
    return await this.environmentProvider.getListSize(envContext, `events-event-${contractAddress}-${eventName}`);
  }
}