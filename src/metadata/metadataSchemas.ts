import swaggerDocument from "./metadataDocument";

const SCHEMA_TYPES = {
    SimpleToken: "#/components/schemas/SimpleToken",
    SuccessResponse: "#/components/schemas/SuccessResponse",
    NodeDTO: "#/components/schemas/NodeDTO",
    NodeInfoDTO: "#/components/schemas/NodeInfoDTO",
    TxDTO: "#/components/schemas/TxDTO",
    TransactionDTO: "#/components/schemas/TransactionDTO",
    TransactionWithStatusDTO: "#/components/schemas/TransactionWithStatusDTO",
    TransactionOutputDTO: "#/components/schemas/TransactionOutputDTO",
    SliceDTO: "#/components/schemas/SliceDTO",
    BlockDTO: "#/components/schemas/BlockDTO",
    BlockWithStatusDTO: "#/components/schemas/BlockWithStatusDTO",
    TXWhereQuery: "#/components/schemas/TXWhereQuery",
    SliceWhereQuery: "#/components/schemas/SliceWhereQuery",
    BlockWhereQuery: "#/components/schemas/BlockWhereQuery",
    TXWhereCount: "#/components/schemas/TXWhereCount",
    SliceWhereCount: "#/components/schemas/SliceWhereCount",
    BlockWhereCount: "#/components/schemas/BlockWhereCount",
}

swaggerDocument.addSchema({
    name: 'BlockWhereCount',
    type: 'object',
    example: '{\n  "offset": 0,\n  "limit": 100,\n  "order": "desc",\n  "status": "mined",\n  "block.height": 0,\n  "block.slices": {\n    "$in": [\n      "0000000000000000000000000000000000000000000000000000000000000000"\n    ]\n  },\n  "block.chain": "mainnet",\n  "block.from": "BWS000000000000000000000000000000000000000000000",\n  "block.lastHash": "0000000000000000000000000000000000000000000000000000000000000000",\n  "block.hash": "0000000000000000000000000000000000000000000000000000000000000000"\n}',
});

swaggerDocument.addSchema({
    name: 'SliceWhereCount',
    type: 'object',
    example: '{\n  "offset": 0,\n  "limit": 100,\n  "order": "desc",\n  "status": "mined",\n  "slice.height": 0,\n  "slice.chain": "mainnet",\n  "slice.transactions": {\n    "$in": [\n      "0000000000000000000000000000000000000000000000000000000000000000"\n    ]\n  },\n  "slice.from": "BWS000000000000000000000000000000000000000000000",\n  "slice.lastBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",\n  "slice.hash": "0000000000000000000000000000000000000000000000000000000000000000"\n}'
});

swaggerDocument.addSchema({
    name: 'TXWhereCount',
    type: 'object',
    example: '{\n  "offset": 0,\n  "limit": 100,\n  "order": "desc",\n  "status": "mined",\n  "tx.chain": "mainnet",\n  "tx.from": {\n    "$in": [\n      "BWS000000000000000000000000000000000000000000000"\n    ]\n  },\n  "tx.to": {\n    "$in": [\n      "BWS000000000000000000000000000000000000000000000"\n    ]\n  },\n  "tx.tag": "",\n  "tx.data": {},\n  "tx.type": "json",\n  "tx.foreignKeys": {\n    "$in": [\n      "key1"\n    ]\n  },\n  "slice.hash": "string"\n}'
});

swaggerDocument.addSchema({
    name: 'BlockWhereQuery',
    type: 'object',
    example: '{\n  "offset": 0,\n  "limit": 100,\n  "order": "desc",\n  "status": "mined",\n  "block.height": 0,\n  "block.slices": {\n    "$in": [\n      "0000000000000000000000000000000000000000000000000000000000000000"\n    ]\n  },\n  "block.chain": "mainnet",\n  "block.from": "BWS000000000000000000000000000000000000000000000",\n  "block.lastHash": "0000000000000000000000000000000000000000000000000000000000000000",\n  "block.hash": "0000000000000000000000000000000000000000000000000000000000000000"\n}',
});

swaggerDocument.addSchema({
    name: 'SliceWhereQuery',
    type: 'object',
    example: '{\n  "offset": 0,\n  "limit": 100,\n  "order": "desc",\n  "status": "mined",\n  "slice.height": 0,\n  "slice.chain": "mainnet",\n  "slice.transactions": {\n    "$in": [\n      "0000000000000000000000000000000000000000000000000000000000000000"\n    ]\n  },\n  "slice.from": "BWS000000000000000000000000000000000000000000000",\n  "slice.lastBlockHash": "0000000000000000000000000000000000000000000000000000000000000000",\n  "slice.hash": "0000000000000000000000000000000000000000000000000000000000000000"\n}'
});

swaggerDocument.addSchema({
    name: 'TXWhereQuery',
    type: 'object',
    example: '{\n  "offset": 0,\n  "limit": 100,\n  "order": "desc",\n  "status": "mined",\n  "tx.chain": "mainnet",\n  "tx.from": {\n    "$in": [\n      "BWS000000000000000000000000000000000000000000000"\n    ]\n  },\n  "tx.to": {\n    "$in": [\n      "BWS000000000000000000000000000000000000000000000"\n    ]\n  },\n  "tx.tag": "",\n  "tx.data": {},\n  "tx.type": "json",\n  "tx.foreignKeys": {\n    "$in": [\n      "key1"\n    ]\n  },\n  "slice.hash": "string"\n}'
});

swaggerDocument.addSchema({
    name: 'TransactionOutputDTO',
    type: 'object',
    properties: [
        { name: 'cost', type: 'number' },
        { name: 'size', type: 'number' },
        { name: 'fee', type: 'string', example: '0' },
        { name: 'feeUsed', type: 'string', example: '0' },
        { name: 'logs', type: 'array', items: { type: 'string' } },
        { name: 'events', type: 'array', items: { type: 'object', properties: [
            { name: 'contractAddress', type: 'string', example: 'BWS1MC328A63061f8CCC10a593fa2fE79d7A05F7C6a810d73' },
            { name: 'eventName', type: 'string', example: 'Mint' },
            { name: 'entries', type: 'array', items: { type: 'object', properties: [
                { name: 'key', type: 'string', example: 'recipient' },
                { name: 'value', type: 'string', example: 'BWS1MUF89C3a7E49fA2601aDF93171090292C92158eec6afc' },
            ]}},
            { name: 'hash', type: 'string', example: 'e2b77904a118ea06a9ae2b2eebb977d974d856b53bde32bcae1ddbc7e7777e81' },

        ] } },
        { name: 'error', type: 'string' },
        { name: 'output', type: 'object' },
        { name: 'payableContracts', type: 'object' },
    ]
});

swaggerDocument.addSchema({
    name: 'TransactionDTO',
    type: 'object',
    properties: [
        { name: 'tx', type: 'object', $ref: SCHEMA_TYPES.TxDTO },
        { name: 'status', type: 'string' },
        { name: 'output', type: 'object' },
        { name: 'slicesHash', type: 'string' },
        { name: 'blockHash', type: 'string' },
    ]
});

swaggerDocument.addSchema({
    name: 'SliceDTO',
    type: 'object',
    properties: [
        { name: 'height', type: 'number', example: '0' },
        { name: 'transactionsCount', type: 'number', example: '9' },
        { name: 'blockHeight', type: 'number', example: '0' },
        { name: 'transactions', type: 'array', items: { type: 'string' , example: '299ad5865ab35f852fd3fec8a715f7235acf8631ff96305927ecf6ad779c230a'} },
        { name: 'version', type: 'string', example: '2' },
        { name: 'chain', type: 'string', example: 'local' },
        { name: 'from', type: 'string', example: 'BWS1MUF89C3a7E49fA2601aDF93171090292C92158eec6afc' },
        { name: 'created', type: 'number', example: '1719152363' },
        { name: 'end', type: 'boolean', example: 'true' },
        { name: 'hash', type: 'string', example: 'f0580ad8feb6d69a6818e26f8bf59cdf71526d3271a9ababaae67231605b173e' },
        { name: 'sign', type: 'string', example: '0x406802187c88feac20984d9acb5aa632cff53278c0eb351b30a190bd3097990671a5d54da053eb3402154f1e9884e5bf9eaed36061563e93c929c9bb44c19d9c1b' },
    ]
});

swaggerDocument.addSchema({
    name: 'BlockWithStatusDTO',
    type: 'object',
    properties: [
        { name: 'height', type: 'number', example: '0' },
        { name: 'transactionsCount', type: 'number', example: '9' },
        { name: 'slices', type: 'array', items: { type: 'string',  example: '6307b4222fb6d7b9eb612ee3e1c1bef3d6f001f7f4df3d0814d4c545a30c35c6' },},
        { name: 'version', type: 'string', example: '2' },
        { name: 'chain', type: 'string', example: 'local' },
        { name: 'from', type: 'string', example: 'BWS1MUF89C3a7E49fA2601aDF93171090292C92158eec6afc' },
        { name: 'created', type: 'number', example: '1719152363' },
        { name: 'lastHash', type: 'string', example: '0000000000000000000000000000000000000000000000000000000000000000' },
        { name: 'hash', type: 'string', example: 'f0580ad8feb6d69a6818e26f8bf59cdf71526d3271a9ababaae67231605b173e' },
        { name: 'sign', type: 'string', example: '0x406802187c88feac20984d9acb5aa632cff53278c0eb351b30a190bd3097990671a5d54da053eb3402154f1e9884e5bf9eaed36061563e93c929c9bb44c19d9c1b' },
        { name: 'status', type: 'string', example: 'mined' },
        { name: 'externalTxID', type: 'array', items: { type: 'string', example: 'f0580ad8feb6d69a6818e26f8bf59cdf71526d3271a9ababaae67231605b173e' }},
    ]
});

swaggerDocument.addSchema({
    name: 'BlockDTO',
    type: 'object',
    properties: [
        { name: 'height', type: 'number', example: '0' },
        { name: 'transactionsCount', type: 'number', example: '9' },
        { name: 'slices', type: 'array', items: { type: 'string',  example: '6307b4222fb6d7b9eb612ee3e1c1bef3d6f001f7f4df3d0814d4c545a30c35c6' },},
        { name: 'version', type: 'string', example: '2' },
        { name: 'chain', type: 'string', example: 'local' },
        { name: 'from', type: 'string', example: 'BWS1MUF89C3a7E49fA2601aDF93171090292C92158eec6afc' },
        { name: 'created', type: 'number' },
        { name: 'lastHash', type: 'string' },
        { name: 'hash', type: 'string', example: 'f0580ad8feb6d69a6818e26f8bf59cdf71526d3271a9ababaae67231605b173e' },
        { name: 'sign', type: 'string', example: '0x406802187c88feac20984d9acb5aa632cff53278c0eb351b30a190bd3097990671a5d54da053eb3402154f1e9884e5bf9eaed36061563e93c929c9bb44c19d9c1b' },
        { name: 'externalTxID', type: 'array', items: { type: 'string', example: 'f0580ad8feb6d69a6818e26f8bf59cdf71526d3271a9ababaae67231605b173e' }},
    ]
});

swaggerDocument.addSchema({
    name: 'TxDTO',
    type: 'object',
    properties: [
        { name: 'version', type: 'string' },
        { name: 'chain', type: 'string' },
        { name: 'validator', type: 'string' },
        { name: 'from', type: 'array', items: { type: 'string' } },
        { name: 'to', type: 'array', items: { type: 'string' } },
        { name: 'amount', type: 'array', items: { type: 'string' } },
        { name: 'tag', type: 'string' },
        { name: 'fee', type: 'string' },
        { name: 'type', type: 'string' },
        { name: 'foreignKeys', type: 'array', items: { type: 'string' } },
        { name: 'data', type: 'object' },
        { name: 'created', type: 'number' },
        { name: 'hash', type: 'string' },
        { name: 'validatorSign', type: 'string' },
        { name: 'sign', type: 'array', items: { type: 'string' } },
    ]
});

swaggerDocument.addSchema({
    name: 'TransactionDTO',
    type: 'object',
    properties: [
        { name: 'version', type: 'string', example: '2' },
        { name: 'chain', type: 'string', example: 'local' },
        { name: 'from', type: 'array', items: { type: 'string', example: 'BWS1MUF89C3a7E49fA2601aDF93171090292C92158eec6afc'} },
        { name: 'to', type: 'array', items: { type: 'string',  example: 'BWSaDF93012178eec6afc58eec6afc171090292C91MUF89C3a'} },
        { name: 'amount', type: 'array', items: { type: 'string' }, example: '0' },
        { name: 'tag', type: 'string', example: '' },
        { name: 'fee', type: 'string', example: '0' },
        { name: 'type', type: 'string', example: 'blockchain-command' },
        { name: 'foreignKeys', type: 'array', items: { type: 'string', example: 'b6e865e357738ae530c4074dc3bc6a9aa9b6173177dc40f13d4fbe094c3faab9'} },
        { name: 'data', type: 'object'},
        { name: 'created', type: 'number', example: '1719152363' },
        { name: 'hash', type: 'string', example: '40f13d4fbe094c3faab9b6e865e357738ae530c4074dc3bc6a9aa9b6173177dc' },
        { name: 'sign', type: 'array', items: { type: 'string', example: '0x3c2682e52e906c32551b0d22c4ca57bdb7fac231af8d9993c693c7a39a922d6f6c51f9a7d007687677bbcef18a036a2f0c5b027ae044d75da4028a5898e2d6421c'} },
    ]
});

swaggerDocument.addSchema({
    name: 'TransactionWithStatusDTO',
    type: 'object',
    properties: [
        { name: 'version', type: 'string', example: '2' },
        { name: 'chain', type: 'string', example: 'local' },
        { name: 'from', type: 'array', items: { type: 'string', example: 'BWS1MUF89C3a7E49fA2601aDF93171090292C92158eec6afc'} },
        { name: 'to', type: 'array', items: { type: 'string',  example: 'BWSaDF93012178eec6afc58eec6afc171090292C91MUF89C3a'} },
        { name: 'amount', type: 'array', items: { type: 'string' }, example: '0' },
        { name: 'tag', type: 'string', example: '' },
        { name: 'fee', type: 'string', example: '0' },
        { name: 'type', type: 'string', example: 'blockchain-command' },
        { name: 'foreignKeys', type: 'array', items: { type: 'string', example: 'b6e865e357738ae530c4074dc3bc6a9aa9b6173177dc40f13d4fbe094c3faab9'} },
        { name: 'data', type: 'object'},
        { name: 'created', type: 'number', example: '1719152363' },
        { name: 'hash', type: 'string', example: '40f13d4fbe094c3faab9b6e865e357738ae530c4074dc3bc6a9aa9b6173177dc' },
        { name: 'sign', type: 'array', items: { type: 'string', example: '0x3c2682e52e906c32551b0d22c4ca57bdb7fac231af8d9993c693c7a39a922d6f6c51f9a7d007687677bbcef18a036a2f0c5b027ae044d75da4028a5898e2d6421c'} },
        { name: 'status', type: 'string', example: 'mined' },
    ]
});

swaggerDocument.addSchema({
    name: 'SimpleToken',
    type: 'object',
    properties: [
        { name: 'token', type: 'string' },
    ]
});

swaggerDocument.addSchema({
    name: 'NodeInfoDTO',
    type: 'object', 
    properties: [
        { name: 'address', type: 'string', example: 'BWS1MUF89C3a7E49fA2601aDF93171090292C92158eec6afc' },
        { name: 'host', type: 'string', example: 'http://localhost:8080' },
        { name: 'version', type: 'string', example: '2.3.6' },
        { name: 'timestamp', type: 'number', example: '1719176681' },
        { name: 'chains', type: 'array', items: { type: 'string', example: 'local' } },
        { name: 'explorers', type: 'array', items: { type: 'string', example: 'https://explorer.bywise.org' } },
        {
            name: 'nodes', type: 'array', items: {
                type: 'object', properties: [
                    { name: 'chains', type: 'array', items: { type: 'string', example: 'mainnet' } },
                    { name: 'address', type: 'string', example: 'BWS1MU48C31B34a87B6F2F00Af19e616d3BCDF70311a2ec46' },
                    { name: 'host', type: 'string', example: 'https://node1.bywise.org' },
                    { name: 'version', type: 'string', example: '2.1.8' }
                ]
            }
        },
    ]
});

swaggerDocument.addSchema({
    name: 'NodeDTO',
    type: 'object',
    properties: [
        { name: 'chains', type: 'array', items: { type: 'string', example: 'mainnet' } },
        { name: 'address', type: 'string', example: 'BWS1MU48C31B34a87B6F2F00Af19e616d3BCDF70311a2ec46' },
        { name: 'host', type: 'string', example: 'https://node1.bywise.org' },
        { name: 'version', type: 'string', example: '2.1.8' },
        { name: 'expire', type: 'number', example: '1719176681' },
        { name: 'token', type: 'string', example: 'ey9JhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ.eyJ0eXBlIjoibm9kZSIsImlkIjoiIiwiaWF0IjoxNzE5MTc2NTk2LCJleHAiOjE3MTkxNzY4MzZ9.mwZFODL4Fv_Voyjn1uGH7QPP_IszSk8WLAZIo3ADtjE' },
    ]
});

swaggerDocument.addSchema({
    name: 'SuccessResponse',
    type: 'object',
    properties: [
        { name: 'message', type: 'string', example: 'OK' },
    ]
});

export default SCHEMA_TYPES;