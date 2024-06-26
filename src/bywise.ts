import helper from "./utils/helper";
import Database from "./datasource/database";
import { ApplicationContext, BywiseStartNodeConfig } from "./types/task.type";
import Api from './tasks/api';
import Core from "./tasks/core";
import { BlocksProvider } from "./services";
import { Block, BlockPack, Slice, Tx, Wallet } from "@bywise/web3";
import MessageQueue from "./datasource/message-queue";

export default class Bywise {
    static async newBywiseInstance(bywiseStartNodeConfig: BywiseStartNodeConfig) {
        const nodeLimit = 20;
        const logger = helper.createLogger(bywiseStartNodeConfig.name, bywiseStartNodeConfig.isLog);
        const mq = new MessageQueue(bywiseStartNodeConfig.name);
        const database = await Database.newDatabase(bywiseStartNodeConfig.name, mq, logger);
        const mainWallet = new Wallet({ seed: bywiseStartNodeConfig.mainWalletSeed })

        const applicationContext: ApplicationContext = {
            mq,
            database,
            port: bywiseStartNodeConfig.port,
            https: bywiseStartNodeConfig.https,
            nodeLimit,
            zeroBlocks: [],
            keyJWT: bywiseStartNodeConfig.keyJWT,
            mainWallet: mainWallet,
            myHost: bywiseStartNodeConfig.myHost,
            initialNodes: bywiseStartNodeConfig.initialNodes,
            logger
        };

        if (bywiseStartNodeConfig.isReset === true) {
            logger.info(`#### RESET DATABASE`)
            await database.drop();
        }

        const blockProvider = new BlocksProvider(applicationContext);
        for (let i = 0; i < bywiseStartNodeConfig.zeroBlocks.length; i++) {
            const zeroBlockJson: any = JSON.parse(bywiseStartNodeConfig.zeroBlocks[i]);
            const zeroBlock: BlockPack = {
                block: new Block(zeroBlockJson.block),
                slices: zeroBlockJson.slices.map((slice: any) => new Slice(slice)),
                txs: zeroBlockJson.txs.map((tx: any) => new Tx(tx)),
            }
            logger.info(`#### CONFIGURE CHAIN "${zeroBlock.block.chain}"`)
            await blockProvider.setNewZeroBlock(zeroBlock);
        }
        const zeroBlocks = await database.BlockRepository.findZeroBlocks();
        applicationContext.zeroBlocks = zeroBlocks.map(block => block.block);

        const api = new Api(applicationContext);
        const core = new Core(applicationContext);

        if (bywiseStartNodeConfig.startServices.includes('core')) {
            logger.info(`#### START CORE - ADDRESS ${mainWallet.address}`)
            await core.start();
        }
        if (bywiseStartNodeConfig.startServices.includes('api')) {
            logger.info(`#### START API`)
            await api.start();
        }
        if (bywiseStartNodeConfig.startServices.includes('network')) {
            logger.info(`#### START NETWORK`)
            await core.network.start();
        }
        logger.info(`#### DONE`)
        return new Bywise(applicationContext, api, core);
    }

    private constructor(applicationContext: ApplicationContext, api: Api, core: Core) {
        this.applicationContext = applicationContext;
        this.api = api;
        this.core = core;
    }

    applicationContext: ApplicationContext;
    api: Api;
    core: Core;

    stop = async () => {
        await this.api.stop();
        await this.core.stop();
        await this.core.network.stop();
        await this.applicationContext.mq.stop();
        await helper.sleep(300);
        await this.applicationContext.database.stop();
    }
}