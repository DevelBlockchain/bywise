import { Block } from "@bywise/web3";
import { BlockchainStatus, Task } from "../types";
import { Blocks, Votes } from "../models";
import helper from "../utils/helper";
import { CoreProvider } from "../services";

export default class ConsensusAlgorithm implements Task {
    public isRun = true;
    private coreProvider;
    private BlockRepository;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
        this.BlockRepository = coreProvider.applicationContext.database.BlockRepository;
    }

    async start() {
    }

    async stop() {
    }

    async run() {
        const blockTime = this.coreProvider.blockTime;
        const currentBlock = this.coreProvider.currentBlock;

        return await this.selectNewBlock(blockTime, currentBlock);
    }

    private async selectNewBlock(blockTime: number, currentBlock: Block): Promise<boolean> {
        let lastBlocks = await this.BlockRepository.findByChainAndGreaterHeight(currentBlock.chain, currentBlock.height);
        lastBlocks = lastBlocks.filter(blockInfo => blockInfo.status == BlockchainStatus.TX_CONFIRMED || blockInfo.status == BlockchainStatus.TX_MINED);

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
            if (bestBlock === null || this.coreProvider.minnerProvider.compareDistance(bestBlock.distance, blockInfo.distance) === 'b') {
                bestBlock = blockInfo;
            }
        }
        if (!bestBlock) throw new Error(`not found current block`)

        let oldHeight = currentBlock.height - 10;
        if (oldHeight < 0) {
            oldHeight = 0;
        }
        const lastVotes = await this.coreProvider.applicationContext.database.VotesRepository.findByChainAndGreaterHeight(currentBlock.chain, oldHeight);
        let bestBlockByVotesMax = this.countChainVotes(bestBlock.block.hash, lastVotes);
        for (let i = 0; i < currentBlocks.length; i++) {
            const blockInfo = currentBlocks[i];
            const votes = this.countChainVotes(blockInfo.block.hash, lastVotes);
            if (votes > bestBlockByVotesMax) {
                bestBlock = blockInfo;
                bestBlockByVotesMax = votes;
                changeReason = 'votes';
            } else if (votes === bestBlockByVotesMax && this.coreProvider.minnerProvider.compareDistance(bestBlock.distance, blockInfo.distance) === 'b') {
                bestBlock = blockInfo;
                bestBlockByVotesMax = votes;
                changeReason = 'votes';
            }
        }

        if (currentBlock.hash !== bestBlock.block.hash) {
            this.coreProvider.applicationContext.logger.info(`consensus - change current block ${bestBlock.block.height} - ${bestBlock.block.hash.substring(0, 10)}... by ${changeReason}`);
            await this.coreProvider.blockProvider.selectMinedBlock(this.coreProvider.chain, bestBlock.block.hash);
            this.coreProvider.currentBlock = bestBlock.block;
            return true;
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
                this.coreProvider.applicationContext.logger.info(`consensus - consolide block ${bestBlock.block.height} - ${bestBlock.block.lastHash.substring(0, 10)}... - votes: ${bestBlockByVotesMax} - options: ${currentBlocks.length} -> next block ${bestBlock.block.hash.substring(0, 10)}...`);
                await this.coreProvider.blockProvider.selectMinedBlock(this.coreProvider.chain, bestBlock.block.hash);
                this.coreProvider.currentBlock = bestBlock.block;
                return true;
            }
        }
        return false;
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
}