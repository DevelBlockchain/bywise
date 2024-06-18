import helper from "../utils/helper";
import worker_threads from 'worker_threads';
import { EventEmitter } from 'node:events';

export enum RoutingKeys {
    know_nodes = 'know_nodes',
    new_node = 'new_node',
    new_tx = 'new_tx',
    new_slice = 'new_slice',
    new_block = 'new_block',
    new_block_vote = 'new_block_vote',
    find_tx = 'find_tx',
    find_slice = 'find_slice',
    find_block = 'find_block',
    selected_new_block = 'selected_new_block',
    started_api = 'started_api',
}

export enum RequestKeys {
    test_connection = 'test_connection',
    get_contract = 'get_contract',
    get_info_wallet = 'get_info_wallet',
    get_confirmed_slices = 'get_confirmed_slices',
    simulate_tx = 'simulate_tx',
    db_save = 'db_save',
    db_save_many = 'db_save_many',
    db_has = 'db_has',
    db_get = 'db_get',
    db_get_many = 'db_get_many',
    db_find = 'db_find',
    db_count = 'db_count',
    db_del = 'db_del',
    db_del_many = 'db_del_many',
}

export type Message = {
    threadId: number,
    isResponse: boolean,
    error: string,
    request?: number,
    key: string,
    data: any,
}

export type MessageListener = (data: any) => Promise<any>

export default class MessageQueue {
    private static postMethod: (value: any) => void;
    private static eventEmitter: EventEmitter;
    private responsesIds: number[] = [];
    private responses: Message[] = [];
    private actions: { key: string, action: MessageListener }[] = [];
    private requestActions: { key: string, action: MessageListener }[] = [];
    private path: string;

    constructor(path: string) {
        this.path = path;
        if (!MessageQueue.eventEmitter) {
            if (worker_threads.parentPort) {
                MessageQueue.eventEmitter = worker_threads.parentPort;
                MessageQueue.postMethod = (value: any) => {
                    if (!worker_threads.parentPort) throw new Error(`O.o`);
                    worker_threads.parentPort.postMessage(value);
                };
            } else {
                MessageQueue.eventEmitter = new EventEmitter();
                MessageQueue.postMethod = (value: any) => {
                    MessageQueue.eventEmitter.emit('message', value);
                };
            }
        }
        MessageQueue.eventEmitter.addListener('message', (msg: Message) => {
            if (msg.isResponse && msg.request) {
                if (this.responsesIds.includes(msg.request)) {
                    this.responses.push(msg);
                }
            } else if (msg.request) {
                for (let i = 0; i < this.requestActions.length; i++) {
                    const action = this.requestActions[i];
                    if (action.key === msg.key) {
                        action.action(msg.data).then(response => {
                            const responseMsg: Message = {
                                threadId: worker_threads.threadId,
                                isResponse: true,
                                error: '',
                                request: msg.request,
                                key: msg.key,
                                data: response,
                            }
                            MessageQueue.postMethod(responseMsg);
                        }).catch(err => {
                            const responseMsg: Message = {
                                threadId: worker_threads.threadId,
                                isResponse: true,
                                error: err.message,
                                request: msg.request,
                                key: msg.key,
                                data: err,
                            }
                            MessageQueue.postMethod(responseMsg);
                        })
                    }
                }
            } else {
                for (let i = 0; i < this.actions.length; i++) {
                    const action = this.actions[i];
                    if (action.key === msg.key) {
                        action.action(msg.data);
                    }
                }
            }
        });
    }

    getThreadId() {
        return worker_threads.threadId;
    }

    send(key: RoutingKeys, data: any = {}, request?: number) {
        const msg: Message = {
            threadId: worker_threads.threadId,
            isResponse: false,
            request,
            error: '',
            key: `${this.path}-${key}`,
            data,
        }
        MessageQueue.postMethod(msg);
        return msg;
    }

    async request(key: RequestKeys, data: any = {}): Promise<any> {
        const keyString = `${this.path}-${key}`;
        for (let i = 0; i < this.requestActions.length; i++) {
            const action = this.requestActions[i];
            if (action.key === keyString) {
                return action.action(data);
            }
        }
        const request = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
        this.responsesIds.push(request);
        const msg: Message = {
            threadId: worker_threads.threadId,
            isResponse: false,
            error: '',
            request,
            key: keyString,
            data,
        }
        MessageQueue.postMethod(msg);
        const uptime = Date.now() + 30000;
        while (uptime > Date.now()) {
            for (let i = 0; i < this.responses.length; i++) {
                const rsp = this.responses[i];
                if (rsp.request === request && rsp.isResponse) {
                    this.responses = this.responses.filter(rsp => !(rsp.request === request && rsp.isResponse));
                    this.responsesIds = this.responsesIds.filter(id => id !== request);
                    if (rsp.error) {
                        throw new Error(rsp.error);
                    }
                    return rsp.data;
                }
            }
            await helper.wait();
        }
        throw new Error(`timeout message request ${key}`);
    }

    stop() {
        if (worker_threads.parentPort) {
            worker_threads.parentPort.close()
        }
        MessageQueue.postMethod = (value: any) => {};
        const nullVar: any = null;
        MessageQueue.eventEmitter = nullVar;
    }

    addMessageListener(key: RoutingKeys, action: MessageListener) {
        this.actions.push({ key: `${this.path}-${key}`, action })
    }

    addRequestListener(key: RequestKeys, action: MessageListener) {
        this.requestActions.push({ key: `${this.path}-${key}`, action })
    }
}