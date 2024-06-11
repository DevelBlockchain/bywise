import { Block } from "@bywise/web3";
import { RoutingKeys } from "../datasource/message-queue";
import { Blocks, Votes } from "../models";
import { CoreContext } from "../types";
import helper from "../utils/helper";
import PipelineChain from "./pipeline-chain.core";

export default class ConsensusAlgorithm {
    public isRun = true;
    private coreContext;
    private pipelineChain;
    private BlockRepository;

    constructor(coreContext: CoreContext, pipelineChain: PipelineChain) {
        this.coreContext = coreContext;
        this.pipelineChain = pipelineChain;
        this.BlockRepository = coreContext.applicationContext.database.BlockRepository;
    }

    async run() {
        const blockTime = this.coreContext.blockTime;
        const currentBlock = this.coreContext.blockTree.currentMinnedBlock;

        await this.selectNewBlock(blockTime, currentBlock);
    }

    private async selectNewBlock(blockTime: number, currentBlock: Block) {
        let lastBlocks = await this.BlockRepository.findByChainAndGreaterHeight(currentBlock.chain, currentBlock.height);
        lastBlocks = lastBlocks.filter(info => (info.isExecuted));

        let currentBlocks: Blocks[] = [];
        let nextBlocks: Blocks[] = [];
        lastBlocks.forEach(blockInfo => {
            if (blockInfo.block.height == currentBlock.height) {
                currentBlocks.push(blockInfo);
            } else {
                nextBlocks.push(blockInfo);
            }
        })
        let changeReason = 'distance';
        let bestBlock: Blocks | null = null;
        for (let i = 0; i < currentBlocks.length; i++) {
            const blockInfo = currentBlocks[i];
            if (bestBlock === null || this.coreContext.minnerProvider.compareDistance(bestBlock.distance, blockInfo.distance) === 'b') {
                bestBlock = blockInfo;
            }
        }
        if (!bestBlock) throw new Error(`not found current block`)

        let oldHeight = currentBlock.height - 10;
        if (oldHeight < 0) {
            oldHeight = 0;
        }
        const lastVotes = await this.coreContext.applicationContext.database.VotesRepository.findByChainAndGreaterHeight(currentBlock.chain, oldHeight);
        let bestBlockByVotesMax = this.countChainVotes(bestBlock.block.hash, lastVotes);
        for (let i = 0; i < currentBlocks.length; i++) {
            const blockInfo = currentBlocks[i];
            const votes = this.countChainVotes(blockInfo.block.hash, lastVotes);
            if (votes > bestBlockByVotesMax) {
                bestBlock = blockInfo;
                bestBlockByVotesMax = votes;
                changeReason = 'votes';
            } else if (votes === bestBlockByVotesMax && this.coreContext.minnerProvider.compareDistance(bestBlock.distance, blockInfo.distance) === 'b') {
                bestBlock = blockInfo;
                bestBlockByVotesMax = votes;
                changeReason = 'votes';
            }
        }

        if (currentBlock.hash !== bestBlock.block.hash) {
            this.coreContext.applicationContext.logger.info(`consensus - change current block ${bestBlock.block.height} - ${bestBlock.block.hash.substring(0, 10)}... by ${changeReason}`);
            await this.selectNewMinedBlock(bestBlock);
        } else {
            if (nextBlocks.length > 0) {
                if (helper.getNow() < currentBlock.created + blockTime) {
                    //return;
                }
                bestBlock = nextBlocks[0];
                for (let i = 0; i < nextBlocks.length; i++) {
                    const blockInfo = nextBlocks[i];
                    if (blockInfo.block.lastHash === currentBlock.hash) {
                        bestBlock = blockInfo;
                    }
                }
                this.coreContext.applicationContext.logger.info(`consensus - consolide block ${bestBlock.block.height} - ${bestBlock.block.lastHash.substring(0, 10)}... - votes: ${bestBlockByVotesMax} - options: ${currentBlocks.length} -> next block ${bestBlock.block.hash.substring(0, 10)}...`);
                await this.selectNewMinedBlock(bestBlock);
            }
        }
    }

    private countChainVotes(hash: string, votes: Votes[]): number {
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

    private async selectNewMinedBlock(bestBlock: Blocks) {
        await this.coreContext.blockProvider.selectMinedBlock(this.coreContext.blockTree, bestBlock.block.hash);
        await this.coreContext.environmentProvider.consolide(this.coreContext.blockTree, bestBlock.block.hash);
        const config = await this.coreContext.configsProvider.getSlowConfigByName(this.coreContext.blockTree, bestBlock.block.hash, bestBlock.block.height, 'blockTime');
        this.coreContext.blockTime = parseInt(config.value);
        await this.coreContext.applicationContext.mq.send(RoutingKeys.selected_new_block, this.coreContext.chain);
    }
}