import { Slice, Tx, Block } from '@bywise/web3';

export type ZeroBlockConfig = {
    name: string;
    input: string[];
}

export class ChainConfig {
    static setConfig(name: string, value: string): ZeroBlockConfig {
        return {
            name: 'setConfig',
            input: [name, value]
        }
    }

    static addAdmin(address: string): ZeroBlockConfig {
        return {
            name: 'addAdmin',
            input: [address]
        }
    }

    static removeAdmin(address: string): ZeroBlockConfig {
        return {
            name: 'removeAdmin',
            input: [address]
        }
    }

    static addValidator(address: string): ZeroBlockConfig {
        return {
            name: 'addValidator',
            input: [address]
        }
    }
    
    static removeValidator(address: string): ZeroBlockConfig {
        return {
            name: 'removeValidator',
            input: [address]
        }
    }

    static setBalance(address: string, balance: string): ZeroBlockConfig {
        return {
            name: 'setBalance',
            input: [address, balance]
        }
    }
    
    static addBalance(address: string, balance: string): ZeroBlockConfig {
        return {
            name: 'addBalance',
            input: [address, balance]
        }
    }
    
    static subBalance(address: string, balance: string): ZeroBlockConfig {
        return {
            name: 'subBalance',
            input: [address, balance]
        }
    }
}