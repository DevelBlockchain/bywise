export type MetadataValueWithoutNameType = {
    type?: 'string' | 'number' | 'boolean' | 'object' | 'array',
    enum?: string[],
    example?: string,
    pattern?: RegExp,
    properties?: MetadataValueType[],
    items?: MetadataValueWithoutNameType,
    $ref?: string,
    required?: boolean
}

export type MetadataValueType = {
    name: string,
    type: 'string' | 'number' | 'boolean' | 'object' | 'array',
    enum?: string[],
    example?: string,
    pattern?: RegExp,
    properties?: MetadataValueType[],
    items?: MetadataValueWithoutNameType,
    $ref?: string,
    required?: boolean
}

export type MetadataParanType = {
    name: string,
    description?: string,
    in: 'path' | 'query',
    required?: boolean,
    pattern?: RegExp,
    example?: string,
    $ref?: string
}

export type MetadataResponseType = {
    code: string | number,
    description: string,
    body?: MetadataValueWithoutNameType,
}

type SecurityType = 'user' | 'node' | 'token';

export type MetadataPathType = {
    path: string,
    security?: boolean,
    securityType?: SecurityType[],
    type: 'delete' | 'get' | 'post' | 'patch',
    controller: string,
    description: string,
    body?: MetadataValueWithoutNameType,
    parameters?: MetadataParanType[],
    responses: MetadataResponseType[]
}