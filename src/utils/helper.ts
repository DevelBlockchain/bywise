import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import fs from 'fs';
import randomstring from 'randomstring';
import { Block, Slice, Tx, TxType, Wallet, BlockPack } from '@bywise/web3';
import { SimulateDTO, ZeroBlockConfig } from '../types';
import { BlockTree, CompiledContext, EnvironmentContext } from '../types/environment.types';

const wait = async () => {
    await new Promise((resolve) => {
        setImmediate(resolve);
    });
}

const sleep = async function sleep(ms: number) {
    await new Promise((resolve) => {
        setTimeout(resolve, ms + 10);
    });
}

const getRandomString = () => randomstring.generate(40);

const getRandomHash = () => randomstring.generate({
    length: 64,
    charset: 'hex'
});

const createLogger = (name: string, debug: boolean): winston.Logger => {
    if (!fs.existsSync('./logs')) {
        fs.mkdirSync('./logs')
    }
    const cfgLogger = {
        format: winston.format.combine(
            winston.format.label({
                label: name
            }),
            winston.format.timestamp(),
            winston.format.colorize(),
            winston.format.simple(),
        ),
        transports: debug ?
            [
                new winston.transports.Console({ level: 'debug' }),
                new DailyRotateFile({
                    filename: './logs/combined-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    zippedArchive: true,
                    maxSize: '20m',
                    maxFiles: '14d'
                }),
                new DailyRotateFile({
                    filename: './logs/error-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    zippedArchive: true,
                    maxSize: '20m',
                    maxFiles: '14d',
                    level: 'error'
                }),
            ] : [
                new DailyRotateFile({
                    filename: './logs/combined-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    zippedArchive: true,
                    maxSize: '20m',
                    maxFiles: '14d'
                }),
                new DailyRotateFile({
                    filename: './logs/error-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    zippedArchive: true,
                    maxSize: '20m',
                    maxFiles: '14d',
                    level: 'error'
                }),
            ],
        exceptionHandlers: [
            new winston.transports.Console(),
            new DailyRotateFile({
                filename: './logs/error-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                zippedArchive: true,
                maxSize: '20m',
                maxFiles: '14d'
            })
        ],
        exitOnError: false,
    };
    return winston.createLogger(cfgLogger);
}

const createNewBlockZero = async (chain: string, wallet: Wallet = new Wallet(), configs: ZeroBlockConfig[] = []): Promise<BlockPack> => {
    const txs: Tx[] = [];
    const slices: Slice[] = [];

    const tx = new Tx();
    tx.version = '2';
    tx.chain = chain;
    tx.from = [wallet.address];
    tx.to = [wallet.address];
    tx.amount = ['0'];
    tx.fee = '0';
    tx.type = TxType.TX_BLOCKCHAIN_COMMAND;
    tx.data = { name: 'start-slice', input: [`0`] };
    tx.foreignKeys = [];
    tx.created = Math.floor(Date.now() / 1000);
    tx.hash = tx.toHash();
    tx.sign = [await wallet.signHash(tx.hash)];
    tx.isValid();
    txs.push(tx);

    for (let i = 0; i < configs.length; i++) {
        const cfg = configs[i];
        const tx = new Tx();
        tx.version = '2';
        tx.chain = chain;
        tx.from = [wallet.address];
        tx.to = [wallet.address];
        tx.amount = ['0'];
        tx.fee = '0';
        tx.type = TxType.TX_COMMAND;
        tx.data = cfg;
        tx.foreignKeys = [];
        tx.created = Math.floor(Date.now() / 1000);
        tx.hash = tx.toHash();
        tx.sign = [await wallet.signHash(tx.hash)];
        tx.isValid();
        txs.push(tx);
    }

    const slice = new Slice();
    slice.height = 0;
    slice.transactionsCount = txs.length;
    slice.blockHeight = 0;
    slice.transactions = txs.map(tx => tx.hash);
    slice.version = '2';
    slice.chain = chain;
    slice.from = wallet.address;
    slice.created = Math.floor(Date.now() / 1000);
    slice.end = true;
    slice.hash = slice.toHash();
    slice.sign = await wallet.signHash(slice.hash);
    slice.isValid();

    slices.push(slice);

    let block = new Block();
    block.height = 0;
    block.chain = chain;
    block.transactionsCount = txs.length;
    block.slices = slices.map(slice => slice.hash);
    block.version = '2';
    block.from = wallet.address;
    block.created = Math.floor(Date.now() / 1000) - 2;
    block.lastHash = BlockTree.ZERO_HASH;
    block.hash = block.toHash();
    block.sign = await wallet.signHash(block.hash);
    block.externalTxID = [];
    block.isValid();

    return { block, slices, txs };
}

const createSimulationContext = (chain: string) => {
    const simulationId = getRandomHash();

    const block = new Block();
    block.height = 0;
    block.chain = chain;
    block.slices = [];
    block.version = '';
    block.from = '';
    block.created = Math.floor(Date.now() / 1000);
    block.lastHash = BlockTree.ZERO_HASH;
    block.hash = simulationId;

    const blockTree = new BlockTree(chain);
    blockTree.addBlock(block);

    const envContext = new EnvironmentContext(blockTree, block.height, CompiledContext.MAIN_CONTEXT_HASH);
    return new SimulateDTO(envContext);
}

const numberToString = (n: number | string) => {
    let str = `${n}`;
    if (!/^[0-9]+$/.test(str)) throw new Error(`invalid number ${n}`);
    while (str.length < 20) {
        str = '0' + str;
    }
    return str;
}

const getNow = () => Math.floor(Date.now() / 1000);

const helper = {
    createSimulationContext,
    createNewBlockZero,
    getRandomHash,
    getRandomString,
    wait,
    sleep,
    createLogger,
    numberToString,
    getNow,
}

export default helper;