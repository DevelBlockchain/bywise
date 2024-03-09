import { Block } from '@bywise/web3';
import { ApplicationContext } from '../types/task.type';
import helper from '../utils/helper';

export class ChainsProvider {

  private lastUpdate: number = 0;
  private zeroBlocks: Block[] = [];
  private BlockRepository;

  constructor(applicationContext: ApplicationContext) {
    this.BlockRepository = applicationContext.database.BlockRepository;
  }

  getZeroBlocks = async (forceUpdate?: boolean): Promise<Block[]> => {
    const now = helper.getNow();
    if(now > this.lastUpdate + 60 || forceUpdate) {
      const blocks = await this.BlockRepository.findZeroBlocks();
      this.zeroBlocks = blocks.map(block => new Block(block.block));
      this.lastUpdate = now;
    }
    return this.zeroBlocks;
  }

  getChains = async(forceUpdate: boolean = false): Promise<string[]> => {
    return (await this.getZeroBlocks(forceUpdate)).map(b => b.chain);
  }
}
