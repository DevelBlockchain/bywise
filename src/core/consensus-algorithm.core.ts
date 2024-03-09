import { RequestKeys, RoutingKeys } from "../datasource/message-queue";
import { Blocks, Slices, Votes } from "../models";
import { BlockchainStatus, CoreContext } from "../types";
import helper from "../utils/helper";
import PipelineChain from "./pipeline-chain.core";

export default class ConsensusAlgorithm {
    public isRun = true;
    private coreContext;
    private pipelineChain;

    constructor(coreContext: CoreContext, pipelineChain: PipelineChain) {
        this.coreContext = coreContext;
        this.pipelineChain = pipelineChain;
    }

    async run() {
        const lastBlock = this.coreContext.lastBlock;
        const blockTime = this.coreContext.blockTime;
        if (!lastBlock) throw new Error(`lastBlock block not found`);

        const now = helper.getNow();

        if (now < lastBlock.block.created + blockTime) {
            if (now < lastBlock.block.created + blockTime / 2) {
                await this.selectBlocksByDistance(lastBlock);
            } else {
                await this.selectBlocksByVotes(lastBlock);
            }
        } else {
            await this.selectNewBlockHeight(lastBlock);
        }
    }

    async selectNewBlockHeight(lastBlockInfo: Blocks) {
        const newBlocks = this.coreContext.blockTree.blockInfoList.filter(info => (
            info.isExecuted &&
            info.status === BlockchainStatus.TX_MEMPOOL &&
            info.block.lastHash === lastBlockInfo.block.hash &&
            info.block.height === lastBlockInfo.block.height + 1
        ));
        let bestBlock = null;
        for (let i = 0; i < newBlocks.length; i++) {
            const newBlock = newBlocks[i];
            if (bestBlock === null || this.coreContext.minnerProvider.compareDistance(bestBlock.distance, newBlock.distance) === 'b') {
                bestBlock = newBlock;
            }
        }
        if (bestBlock) {
            let oldHeight = lastBlockInfo.block.height - 10;
            if (oldHeight < 0) {
                oldHeight = 0;
            }
            const lastVotes = await this.coreContext.applicationContext.database.VotesRepository.findByChainAndGreaterHeight(lastBlockInfo.block.chain, oldHeight);

            const votes = this.countChainVotes(lastBlockInfo.block.hash, lastVotes);
            let countBlockVotes = 0;
            let maxVotes = 0;
            for (let i = 0; i < lastVotes.length; i++) {
                const vote = lastVotes[i];
                if (vote.add && vote.height === lastBlockInfo.block.height) {
                    maxVotes++;
                    if (lastBlockInfo.block.hash === vote.blockHash) {
                        countBlockVotes++;
                    }
                }
            }

            const isConnected = await this.coreContext.applicationContext.mq.request(RequestKeys.test_connection, {
                chain: this.coreContext.chain
            })
            if(!isConnected) {
                this.coreContext.applicationContext.logger.info(`ConsensusAlgorithm: Node has disconnected!`)
                this.pipelineChain.stop().then(() => {
                    this.pipelineChain.start();
                });
                return;
            }

            const mainWallet = await this.coreContext.walletProvider.getMainWallet();
            this.coreContext.applicationContext.logger.info(`ConsensusAlgorithm: consolide - ${lastBlockInfo.block.from === mainWallet.address ? 'my' : 'other'} wallet - height: ${lastBlockInfo.block.height} - votes: ${votes}/${lastVotes.length} - ${countBlockVotes}/${maxVotes} - ${(100 * countBlockVotes / maxVotes).toFixed(2)}% - hash: ${lastBlockInfo.block.hash.substring(0, 10)}`)
            this.coreContext.applicationContext.logger.info(`ConsensusAlgorithm: selected new block by height ${bestBlock.block.height} - ${newBlocks.length} choices`)
            await this.selectNewMinedBlock(bestBlock);
            await this.coreContext.blockProvider.updateConsolidatedBlockTree(this.coreContext.blockTree, 10);
        }
    }

    async selectBlocksByDistance(lastBlockInfo: Blocks) {
        const currentBlocks = this.coreContext.blockTree.blockInfoList.filter(info => (
            info.isExecuted &&
            (info.status === BlockchainStatus.TX_MEMPOOL || info.status === BlockchainStatus.TX_MINED) &&
            info.block.lastHash === lastBlockInfo.block.lastHash &&
            info.block.height === lastBlockInfo.block.height
        ));
        let bestBlock: Blocks | null = null;
        for (let i = 0; i < currentBlocks.length; i++) {
            const currentBlock = currentBlocks[i];
            if (bestBlock === null || this.coreContext.minnerProvider.compareDistance(bestBlock.distance, currentBlock.distance) === 'b') {
                bestBlock = currentBlock;
            }
        }
        if (bestBlock) {
            if (lastBlockInfo.block.hash !== bestBlock.block.hash) {
                this.coreContext.applicationContext.logger.info(`ConsensusAlgorithm: selected block by distance ${bestBlock.block.height} - ${currentBlocks.length} choices`)
                await this.selectNewMinedBlock(bestBlock);
            }
        }
    }

    countChainVotes(hash: string, votes: Votes[]): number {
        let count = 0;
        let lastHash = '';
        for (let i = 0; i < votes.length; i++) {
            const vote = votes[i];
            if (vote.add && vote.blockHash === hash) {
                lastHash = vote.lastHash;
                count++;
            }
        }
        if (lastHash !== '') {
            count += this.countChainVotes(lastHash, votes);
        }
        return count;
    }

    async selectBlocksByVotes(lastBlockInfo: Blocks) {
        let oldHeight = lastBlockInfo.block.height - 10;
        if (oldHeight < 0) {
            oldHeight = 0;
        }
        const lastVotes = await this.coreContext.applicationContext.database.VotesRepository.findByChainAndGreaterHeight(lastBlockInfo.block.chain, oldHeight);

        let bestHash = '';
        let bestHashVotes = -1;
        const counter = new Map<string, number>();
        for (let i = 0; i < lastVotes.length; i++) {
            const vote = lastVotes[i];
            if (vote.add && vote.height === lastBlockInfo.block.height) {
                let count = counter.get(vote.blockHash);
                if (count === undefined) {
                    count = this.countChainVotes(vote.blockHash, lastVotes);
                    counter.set(vote.blockHash, count);
                }
                if (count > bestHashVotes) {
                    bestHash = vote.blockHash;
                    bestHashVotes = count;
                }
            }
        }
        if (bestHashVotes > 0) {
            const bestBlock = this.coreContext.blockTree.getBlockInfo(bestHash);
            if (bestBlock && bestBlock.isExecuted) {
                let countBlockVotes = 0;
                let maxVotes = 0;
                for (let i = 0; i < lastVotes.length; i++) {
                    const vote = lastVotes[i];
                    if (vote.add && vote.height === lastBlockInfo.block.height) {
                        maxVotes++;
                        if (bestHash === vote.blockHash) {
                            countBlockVotes++;
                        }
                    }
                }
                if (lastBlockInfo.block.hash !== bestBlock.block.hash) {
                    this.coreContext.applicationContext.logger.info(`ConsensusAlgorithm: selected block by votes - ${bestHashVotes} votes - ${countBlockVotes}/${maxVotes} - ${(100 * countBlockVotes / maxVotes).toFixed(2)}%`)
                    await this.selectNewMinedBlock(bestBlock);
                }
            }
        }
    }

    async selectNewMinedBlock(bestBlock: Blocks) {
        await this.coreContext.blockProvider.selectMinedBlock(this.coreContext.blockTree, bestBlock.block.hash);
        this.coreContext.blockTime = parseInt((await this.coreContext.configsProvider.getByName(this.coreContext.blockTree, bestBlock.block.hash, bestBlock.block.height, 'blockTime')).value);
        this.coreContext.lastBlock = bestBlock;
        await this.coreContext.applicationContext.mq.send(RoutingKeys.selected_new_block, this.coreContext.chain);
    }
}