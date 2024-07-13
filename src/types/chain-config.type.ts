import { TxOutput } from "@bywise/web3";

export type ZeroBlockConfig = {
    name: string;
    input: string[];
    output: TxOutput;
}

export class ChainConfig {
    static setConfigFee(name: string, value: string): ZeroBlockConfig {
        return {
            name: 'setConfig',
            input: [name, value],
            output: {
                feeUsed: "0",
                cost: 0,
                size: 0,
                ctx: "0000000000000000000000000000000000000000000000000000000000000000",
                debit: "0",
                logs: [],
                events: [],
                get: [],
                walletAddress: [],
                walletAmount: [],
                envs: {
                    keys: [
                        `config-${name}`,
                    ], values: [
                        `{\"lastValue\":\"0\",\"value\":\"${value}\",\"lastUpdate\":0,\"type\":\"number\"}`,
                    ]
                },
                output: ''
            }
        }
    }
    
    static setBlockTime(value: string): ZeroBlockConfig {
        return {
            name: 'setConfig',
            input: ["blockTime", value],
            output: {
                feeUsed: "0",
                cost: 0,
                size: 0,
                ctx: "0000000000000000000000000000000000000000000000000000000000000000",
                debit: "0",
                logs: [],
                events: [],
                get: [],
                walletAddress: [],
                walletAmount: [],
                envs: {
                    keys: [
                        "config-blockTime",
                    ], values: [
                        `{\"lastValue\":\"60\",\"value\":\"${value}\",\"lastUpdate\":0,\"type\":\"number\"}`,
                    ]
                },
                output: ''
            }
        }
    }

    static addAdmin(address: string): ZeroBlockConfig {
        return {
            name: 'addAdmin',
            input: [address],
            output: {
                feeUsed: "0",
                cost: 0,
                size: 0,
                ctx: "0000000000000000000000000000000000000000000000000000000000000000",
                debit: "0",
                logs: [],
                events: [],
                get: [],
                walletAddress: [],
                walletAmount: [],
                envs: {
                    keys: [`config-admin-address-${address}`],
                    values: [
                        `{\"lastValue\":\"false\",\"value\":\"true\",\"lastUpdate\":0,\"type\":\"boolean\"}`,
                    ]
                },
                output: ''
            }
        }
    }

    static removeAdmin(address: string): ZeroBlockConfig {
        return {
            name: 'removeAdmin',
            input: [address],
            output: {
                feeUsed: "0",
                cost: 0,
                size: 0,
                ctx: "0000000000000000000000000000000000000000000000000000000000000000",
                debit: "0",
                logs: [],
                events: [],
                get: [],
                walletAddress: [],
                walletAmount: [],
                envs: {
                    keys: [`config-admin-address-${address}`],
                    values: [
                        `{\"lastValue\":\"false\",\"value\":\"false\",\"lastUpdate\":0,\"type\":\"boolean\"}`,
                    ]
                },
                output: ''
            }
        }
    }

    static addValidator(address: string): ZeroBlockConfig {
        return {
            name: 'addValidator',
            input: [address],
            output: {
                feeUsed: "0",
                cost: 0,
                size: 0,
                ctx: "0000000000000000000000000000000000000000000000000000000000000000",
                debit: "0",
                logs: [],
                events: [],
                get: [],
                walletAddress: [],
                walletAmount: [],
                envs: {
                    keys: [`config-validator-${address}`],
                    values: [
                        `{\"lastValue\":\"false\",\"value\":\"true\",\"lastUpdate\":0,\"type\":\"boolean\"}`,
                    ]
                },
                output: ''
            }
        }
    }

    static removeValidator(address: string): ZeroBlockConfig {
        return {
            name: 'removeValidator',
            input: [address],
            output: {
                feeUsed: "0",
                cost: 0,
                size: 0,
                ctx: "0000000000000000000000000000000000000000000000000000000000000000",
                debit: "0",
                logs: [],
                events: [],
                get: [],
                walletAddress: [],
                walletAmount: [],
                envs: {
                    keys: [`config-validator-${address}`],
                    values: [
                        `{\"lastValue\":\"false\",\"value\":\"false\",\"lastUpdate\":0,\"type\":\"boolean\"}`,
                    ]
                },
                output: ''
            }
        }
    }

    static addBalance(address: string, balance: string): ZeroBlockConfig {
        return {
            name: 'addBalance',
            input: [address, balance],
            output: {
                feeUsed: "0",
                cost: 0,
                size: 0,
                ctx: "0000000000000000000000000000000000000000000000000000000000000000",
                debit: "0",
                logs: [],
                events: [],
                get: [],
                walletAddress: [address],
                walletAmount: [balance],
                envs: {
                    keys: [],
                    values: []
                },
                output: ''
            }
        }
    }

    static subBalance(address: string, balance: string): ZeroBlockConfig {
        return {
            name: 'subBalance',
            input: [address, balance],
            output: {
                feeUsed: "0",
                cost: 0,
                size: 0,
                ctx: "0000000000000000000000000000000000000000000000000000000000000000",
                debit: "0",
                logs: [],
                events: [],
                get: [],
                walletAddress: [address],
                walletAmount: ["-"+balance],
                envs: {
                    keys: [],
                    values: []
                },
                output: ''
            }
        }
    }
}