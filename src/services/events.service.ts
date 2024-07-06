import { ApplicationContext, TransactionEvent, EnvironmentContext } from '../types';
import helper from '../utils/helper';
import { EnvironmentProvider } from './environment.service';

export class EventsProvider {

  private environmentProvider: EnvironmentProvider;

  constructor(applicationContext: ApplicationContext) {
    this.environmentProvider = new EnvironmentProvider(applicationContext);
  }

  async saveEvents(envContext: EnvironmentContext, event: TransactionEvent) {
    let indexStr = '0';
    let eventIntexString = await this.environmentProvider.get(envContext, `events-CI`);
    if(eventIntexString && eventIntexString.value) {
      indexStr = eventIntexString.value;
    }
    let index = BigInt(indexStr);
    index++;
    await this.environmentProvider.set(envContext, `events-${event.contractAddress}-EE-${helper.stringToHash(event.eventName)}-${helper.numberToString(index.toString())}`, event.hash);
    for (let j = 0; j < event.entries.length; j++) {
      const entry = event.entries[j];
      const key = helper.stringToHash(helper.stringToHash(entry.key)+helper.stringToHash(entry.value));
      await this.environmentProvider.set(envContext, `events-${event.contractAddress}-EK-${helper.stringToHash(event.eventName)}-${key}-${helper.numberToString(index.toString())}`, event.hash);
      index++;
    }
    await this.environmentProvider.set(envContext, `events-CI`, index.toString());
  }

  async findByEventAndKey(envContext: EnvironmentContext, contractAddress: string, eventName: string, key: string, value: string, limit: number, offset: number): Promise<string[]> {
    const keyHash = helper.stringToHash(helper.stringToHash(key)+helper.stringToHash(value));
    const values = await this.environmentProvider.getList(envContext, `events-${contractAddress}-EK-${helper.stringToHash(eventName)}-${keyHash}`, limit, offset);
    return values.map(env => env.value ? env.value : '').filter(hash => hash !== '');
  }

  async findByEvent(envContext: EnvironmentContext, contractAddress: string, eventName: string, limit: number, offset: number): Promise<string[]> {
    const values = await this.environmentProvider.getList(envContext, `events-${contractAddress}-EE-${helper.stringToHash(eventName)}`, limit, offset);
    return values.map(env => env.value ? env.value : '').filter(hash => hash !== '');
  }

  async countEventsByKey(envContext: EnvironmentContext, contractAddress: string, eventName: string, key: string, value: string): Promise<number> {
    const keyHash = helper.stringToHash(helper.stringToHash(key)+helper.stringToHash(value));
    return await this.environmentProvider.getListSize(envContext, `events-${contractAddress}-EK-${helper.stringToHash(eventName)}-${keyHash}`);
  }

  async countEvents(envContext: EnvironmentContext, contractAddress: string, eventName: string): Promise<number> {
    return await this.environmentProvider.getListSize(envContext, `events-${contractAddress}-EE-${helper.stringToHash(eventName)}`);
  }
}