import { Block, Wallet } from "@bywise/web3";
import winston from "winston";
import Database from "../datasource/database";
import MessageQueue from "../datasource/message-queue";

export type BywiseStartServices = 'api' | 'core' | 'network'

export type BywiseStartNodeConfig = {
    name: string;
    port: number;
    https?: { cert: string, key: string };
    myHost: string;
    keyJWT: string;
    initialNodes: string[];
    zeroBlocks: string[];
    mainWalletSeed: string;
    startServices: BywiseStartServices[];
    isLog: boolean;
    isReset?: boolean;
    urlMongo?: string;
    urlRabbitmq?: string;
}

export type ApplicationContext = {
    database: Database;
    mq: MessageQueue;
    name?: string;
    myHost: string;
    port: number;
    https?: { cert: string, key: string };
    initialNodes: string[];
    zeroBlocks: Block[];
    nodeLimit: number;
    keyJWT: string;
    mainWallet: Wallet;
    logger: winston.Logger
}

export interface Task {
    isRun: boolean,
    start: () => Promise<void>,
    stop: () => Promise<void>
}