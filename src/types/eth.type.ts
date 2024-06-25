import { ContractAbi } from "web3";
import { ETHChain } from "../models"

/**
 * const bywiseContractAddress = "BWS1MUf3fE542466114436c184ad1936CD72D3baeEA06c366";
 * TESTNET
 * Proxy: 0xD81fceB62Ab1EbF24a60CFE874C375958AaDDD70
 * Book: 0x75E7325B5609ecf5872898d42f50d0c8a2fA4f6D
 * Bridge: 0x05E13F64c93Ce35ceB157b1dC4b3c0d5C5EeA95e
 * MAINNET
 * Proxy: 0xb725Ecf61d9D41f22D56724907325bCe3c996184
 * Book: 0x5390d28fF5Fbd7F9F2fd02A2f9a62E77580436d6
 * Bridge: 0xdffB099A3E24747655A0b00B03CF652240Da633b
 */

export const ETHChains: ETHChain[] = [
	{ proxy: '0x0000000000000000000000000000000000000000', cost: 100, name: 'Ethereum', symbol: 'ETH', chainID: 1, provider: 'https://mainnet.infura.io/v3/' },
	{ proxy: '0x0000000000000000000000000000000000000000', cost: 100, name: 'Ethereum - Ropsten', symbol: 'tETH', chainID: 3, provider: 'https://ropsten.infura.io' },
	{ proxy: '0x0000000000000000000000000000000000000000', cost: 100, name: 'RSK Mainnet', symbol: 'RBTC', chainID: 30, provider: 'https://public-node.rsk.co' },
	{ proxy: '0x0000000000000000000000000000000000000000', cost: 100, name: 'RSK Testnet', symbol: 'tRBTC', chainID: 31, provider: 'https://public-node.testnet.rsk.co' },
	{ proxy: '0xb725Ecf61d9D41f22D56724907325bCe3c996184', cost: 100, name: 'Binance Smart Chain', symbol: 'BNB', chainID: 56, provider: 'https://bsc-dataseed.binance.org' },
	{ proxy: '0xD81fceB62Ab1EbF24a60CFE874C375958AaDDD70', cost: 100, name: 'Binance Smart Chain - Testnet', symbol: 'tBNB', chainID: 97, provider: 'https://data-seed-prebsc-1-s1.binance.org:8545' },
	{ proxy: '0x0000000000000000000000000000000000000000', cost: 100, name: 'Polygon', symbol: 'MATIC', chainID: 137, provider: 'https://polygon-rpc.com' },
	{ proxy: '0x0000000000000000000000000000000000000000', cost: 100, name: 'Polygon - Mumbai', symbol: 'tMATIC', chainID: 80001, provider: 'https://polygon-mumbai.infura.io/v3/4458cf4d1689497b9a38b1d6bbf05e78' },
	{ proxy: '0x0000000000000000000000000000000000000000', cost: 100, name: 'KCC-MAINNET', symbol: 'KCS', chainID: 321, provider: 'https://rpc-mainnet.kcc.network' },
	{ proxy: '0x0000000000000000000000000000000000000000', cost: 100, name: 'KCC-TESTNET', symbol: 'tKCS', chainID: 322, provider: 'https://rpc-testnet.kcc.network' },
	{ proxy: '0x0000000000000000000000000000000000000000', cost: 100, name: 'Celo Mainnet', symbol: 'CELO', chainID: 42220, provider: 'https://celo-mainnet.infura.io' },
	{ proxy: '0x0000000000000000000000000000000000000000', cost: 100, name: 'Celo Testnet', symbol: 'tCELO', chainID: 44787, provider: 'https://alfajores-forno.celo-testnet.org' },
]

export const PROXY_API: ContractAbi = [
	{
		"inputs": [
			{
				"internalType": "address[]",
				"name": "accounts_",
				"type": "address[]"
			}
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "account",
				"type": "address"
			}
		],
		"name": "AddAccount",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			}
		],
		"name": "ExecuteAction",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "action",
				"type": "address"
			}
		],
		"name": "NewProposal",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "account",
				"type": "address"
			}
		],
		"name": "RemoveAccount",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "action",
				"type": "address"
			},
			{
				"internalType": "string",
				"name": "from",
				"type": "string"
			}
		],
		"name": "actionIsValidFrom",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "action",
				"type": "address"
			},
			{
				"internalType": "address[]",
				"name": "addresses",
				"type": "address[]"
			},
			{
				"internalType": "uint256[]",
				"name": "values",
				"type": "uint256[]"
			},
			{
				"internalType": "string[]",
				"name": "strings",
				"type": "string[]"
			},
			{
				"internalType": "bytes32[]",
				"name": "data",
				"type": "bytes32[]"
			}
		],
		"name": "actionRead",
		"outputs": [
			{
				"internalType": "string",
				"name": "",
				"type": "string"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			}
		],
		"name": "getProposal",
		"outputs": [
			{
				"components": [
					{
						"internalType": "uint256",
						"name": "votes",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "requireVotes",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "timeout",
						"type": "uint256"
					},
					{
						"internalType": "address",
						"name": "action",
						"type": "address"
					}
				],
				"internalType": "struct Proxy.Proposal",
				"name": "",
				"type": "tuple"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			}
		],
		"name": "getProposalAddresses",
		"outputs": [
			{
				"internalType": "address[]",
				"name": "",
				"type": "address[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			}
		],
		"name": "getProposalData",
		"outputs": [
			{
				"internalType": "bytes32[]",
				"name": "",
				"type": "bytes32[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			}
		],
		"name": "getProposalString",
		"outputs": [
			{
				"internalType": "string[]",
				"name": "",
				"type": "string[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			}
		],
		"name": "getProposalValues",
		"outputs": [
			{
				"internalType": "uint256[]",
				"name": "",
				"type": "uint256[]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "account",
				"type": "address"
			}
		],
		"name": "hasPrivilege",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			}
		],
		"name": "hasProposal",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "account",
				"type": "address"
			},
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			}
		],
		"name": "isVoteProposal",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "action",
				"type": "address"
			},
			{
				"internalType": "address[]",
				"name": "addresses",
				"type": "address[]"
			}
		],
		"name": "proposalAddresses",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "action",
				"type": "address"
			},
			{
				"internalType": "address[]",
				"name": "addresses",
				"type": "address[]"
			},
			{
				"internalType": "bytes32[]",
				"name": "data",
				"type": "bytes32[]"
			}
		],
		"name": "proposalAddressesAndData",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "action",
				"type": "address"
			},
			{
				"internalType": "address[]",
				"name": "addresses",
				"type": "address[]"
			},
			{
				"internalType": "string[]",
				"name": "strings",
				"type": "string[]"
			}
		],
		"name": "proposalAddressesAndString",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "action",
				"type": "address"
			},
			{
				"internalType": "address[]",
				"name": "addresses",
				"type": "address[]"
			},
			{
				"internalType": "uint256[]",
				"name": "values",
				"type": "uint256[]"
			}
		],
		"name": "proposalAddressesAndValues",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "action",
				"type": "address"
			},
			{
				"internalType": "address[]",
				"name": "addresses",
				"type": "address[]"
			},
			{
				"internalType": "uint256[]",
				"name": "values",
				"type": "uint256[]"
			},
			{
				"internalType": "bytes32[]",
				"name": "data",
				"type": "bytes32[]"
			}
		],
		"name": "proposalAddressesAndValuesAndData",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "action",
				"type": "address"
			},
			{
				"internalType": "address[]",
				"name": "addresses",
				"type": "address[]"
			},
			{
				"internalType": "uint256[]",
				"name": "values",
				"type": "uint256[]"
			},
			{
				"internalType": "string[]",
				"name": "strings",
				"type": "string[]"
			}
		],
		"name": "proposalAddressesAndValuesAndStrings",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "action",
				"type": "address"
			},
			{
				"internalType": "address[]",
				"name": "addresses",
				"type": "address[]"
			},
			{
				"internalType": "uint256[]",
				"name": "values",
				"type": "uint256[]"
			},
			{
				"internalType": "string[]",
				"name": "strings",
				"type": "string[]"
			},
			{
				"internalType": "bytes32[]",
				"name": "data",
				"type": "bytes32[]"
			}
		],
		"name": "proposalAddressesAndValuesAndStringsAndData",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "action",
				"type": "address"
			},
			{
				"internalType": "bytes32[]",
				"name": "data",
				"type": "bytes32[]"
			}
		],
		"name": "proposalData",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "action",
				"type": "address"
			},
			{
				"internalType": "bytes32[]",
				"name": "data",
				"type": "bytes32[]"
			},
			{
				"internalType": "string[]",
				"name": "strings",
				"type": "string[]"
			}
		],
		"name": "proposalDataAndString",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "action",
				"type": "address"
			},
			{
				"internalType": "string[]",
				"name": "strings",
				"type": "string[]"
			}
		],
		"name": "proposalString",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "action",
				"type": "address"
			},
			{
				"internalType": "uint256[]",
				"name": "values",
				"type": "uint256[]"
			}
		],
		"name": "proposalValues",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "action",
				"type": "address"
			},
			{
				"internalType": "uint256[]",
				"name": "values",
				"type": "uint256[]"
			},
			{
				"internalType": "bytes32[]",
				"name": "data",
				"type": "bytes32[]"
			}
		],
		"name": "proposalValuesAndData",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "action",
				"type": "address"
			},
			{
				"internalType": "uint256[]",
				"name": "values",
				"type": "uint256[]"
			},
			{
				"internalType": "string[]",
				"name": "strings",
				"type": "string[]"
			}
		],
		"name": "proposalValuesAndString",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			},
			{
				"internalType": "address",
				"name": "action",
				"type": "address"
			},
			{
				"internalType": "uint256[]",
				"name": "values",
				"type": "uint256[]"
			},
			{
				"internalType": "string[]",
				"name": "strings",
				"type": "string[]"
			},
			{
				"internalType": "bytes32[]",
				"name": "data",
				"type": "bytes32[]"
			}
		],
		"name": "proposalValuesAndStringAndData",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "totalAccounts",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "proposalId",
				"type": "bytes32"
			}
		],
		"name": "vote",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	}
] as any;