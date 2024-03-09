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
        { name: 'fee', type: 'string' },
        { name: 'logs', type: 'array', items: { type: 'string' } },
        { name: 'error', type: 'string' },
        { name: 'output', type: 'object' },
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
        { name: 'height', type: 'number' },
        { name: 'transactionsCount', type: 'number' },
        { name: 'blockHeight', type: 'number' },
        { name: 'transactions', type: 'array', items: { type: 'string' } },
        { name: 'version', type: 'string' },
        { name: 'chain', type: 'string' },
        { name: 'from', type: 'string' },
        { name: 'created', type: 'number' },
        { name: 'end', type: 'boolean' },
        { name: 'lastBlockHash', type: 'string' },
        { name: 'hash', type: 'string' },
        { name: 'sign', type: 'string' },
    ]
});

swaggerDocument.addSchema({
    name: 'BlockWithStatusDTO',
    type: 'object',
    properties: [
        { name: 'height', type: 'number' },
        { name: 'transactionsCount', type: 'number' },
        { name: 'slices', type: 'array', items: { type: 'string' } },
        { name: 'version', type: 'string' },
        { name: 'chain', type: 'string' },
        { name: 'from', type: 'string' },
        { name: 'created', type: 'number' },
        { name: 'lastHash', type: 'string' },
        { name: 'hash', type: 'string' },
        { name: 'sign', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'externalTxID', type: 'array', items: { type: 'string' } },
    ]
});

swaggerDocument.addSchema({
    name: 'BlockDTO',
    type: 'object',
    properties: [
        { name: 'height', type: 'number' },
        { name: 'transactionsCount', type: 'number' },
        { name: 'slices', type: 'array', items: { type: 'string' } },
        { name: 'version', type: 'string' },
        { name: 'chain', type: 'string' },
        { name: 'from', type: 'string' },
        { name: 'created', type: 'number' },
        { name: 'lastHash', type: 'string' },
        { name: 'hash', type: 'string' },
        { name: 'sign', type: 'string' },
        { name: 'externalTxID', type: 'array', items: { type: 'string' } },
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
    name: 'TransactionWithStatusDTO',
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
        { name: 'status', type: 'string' },
        { name: 'validatorSign', type: 'string' },
        { name: 'sign', type: 'array', items: { type: 'string' } },
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
        { name: 'address', type: 'string' },
        { name: 'host', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'timestamp', type: 'number' },
        { name: 'chains', type: 'array', items: { type: 'string' } },
        { name: 'explorers', type: 'array', items: { type: 'string' } },
        {
            name: 'nodes', type: 'array', items: {
                type: 'object', properties: [
                    { name: 'chains', type: 'array', items: { type: 'string' } },
                    { name: 'address', type: 'string' },
                    { name: 'host', type: 'string' },
                    { name: 'version', type: 'string' }
                ]
            }
        },
    ]
});

swaggerDocument.addSchema({
    name: 'NodeDTO',
    type: 'object',
    properties: [
        { name: 'chains', type: 'array', items: { type: 'string' } },
        { name: 'address', type: 'string' },
        { name: 'host', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'expire', type: 'number' },
        { name: 'token', type: 'string' },
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