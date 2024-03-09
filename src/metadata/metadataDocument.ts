import express from 'express';
const pjson = require('./../../package.json');
import { MetadataResponseType, MetadataValueWithoutNameType, MetadataValueType, MetadataPathType, MetadataParanType } from "../types";

export const DEFAULT_ERROR_RESPONSE: MetadataResponseType[] = [
    {
        code: 400,
        description: 'Error: Bad Request',
    },
    {
        code: 401,
        description: 'Error: Unauthorized',
    },
    {
        code: 422,
        description: 'Error: Unprocessable Entity',
    },
]

function paranToJsonWithoutName(schema: MetadataValueWithoutNameType) {
    const obj: any = {}
    if (schema.$ref !== undefined) obj.$ref = schema.$ref;
    if (schema.example !== undefined) obj.example = schema.example;
    if (schema.enum !== undefined) obj.enum = schema.enum;
    if (schema.required !== undefined) obj.required = schema.required;
    if (schema.items) {
        obj.items = paranToJsonWithoutName(schema.items);
    }
    if (schema.properties) {
        obj.properties = {};
        schema.properties.forEach(item => paranToJson(obj.properties, item))
    }
    obj.type = schema.type;
    return obj;
}

function paranToJson(father: any, schema: MetadataValueType) {
    const obj: any = paranToJsonWithoutName(schema);
    father[schema.name] = obj;
}

class MetadataDocument {
    paths: MetadataPathType[] = [];
    schemas: MetadataValueType[] = [];

    validateInput(path: MetadataPathType, req: express.Request) {
        if (path.body) {
            this.validateValueWithoutName('body', req.body, path.body)
        }
        if (path.parameters) {
            path.parameters.forEach(p => {
                if (p.in === 'path') {
                    req.params[p.name] = this.validatePathParan(req.params[p.name], p);
                } else {
                    req.query[p.name] = this.validatePathParan(req.query[p.name], p);
                }
            });
        }
    }

    private validatePathParan(value: any, schema: MetadataParanType) {
        if (schema.required) {
            if (value === undefined || value === null) throw new Error(`The '${schema.name}' field is required.`)
        }
        if (value !== undefined && value !== null) {
            if (schema.$ref) {
                value = JSON.parse(decodeURI(value))
                this.validateValueWithoutName(schema.name, value, this.findScheme(schema.$ref));
                return value;
            } else {
                if (schema.pattern) {
                    if (!schema.pattern.test(`${value}`)) {
                        throw new Error(`The '${schema.name}' field is invalid. Value received '${value}' it must be in the following ${schema.pattern} standard.`)
                    }
                }
                return value;
            }
        }
        return undefined;
    }

    private validateValueWithoutName(name: string, value: any, schema: MetadataValueWithoutNameType) {
        if (schema.required) {
            if (value === undefined || value === null)
                throw new Error(`The '${name}' field is required.`)
        }
        if (value !== undefined && value !== null) {
            if (schema.$ref) {
                this.validateValueWithoutName(name, value, this.findScheme(schema.$ref));
            } else if (schema.type) {
                if (schema.enum) {
                    if (!schema.enum.includes(`${value}`))
                        throw new Error(`The '${name}' field can only be the following values: [${schema.enum.map(e => "'" + e + "'").join(", ")}]. Was received: '${value}'`);
                }
                if (schema.type === 'string' || schema.type === 'number' || schema.type === 'boolean') {
                    if (typeof value !== schema.type)
                        throw new Error(`The '${name}' field require ${schema.type} type but received ${typeof value}`)
                    if (schema.pattern) {
                        if (!schema.pattern.test(`${value}`)) {
                            throw new Error(`The '${name}' field is invalid. Value received '${value}' it must be in the following ${schema.pattern} standard.`)
                        }
                    }
                } else if (schema.type === 'object') {
                    if (typeof value !== schema.type)
                        throw new Error(`The '${name}' field require ${schema.type} type but received ${typeof value}`)
                    if (schema.properties) {
                        schema.properties.forEach(p => {
                            this.validateValueWithoutName(name + '.' + p.name, value[p.name], p);
                        })
                    }
                } else if (schema.type === 'array') {
                    if (!Array.isArray(value))
                        throw new Error(`The '${name}' field require array type.`);
                    if (schema.items !== undefined) {
                        const itens = schema.items;
                        value.forEach((v, i) => {
                            this.validateValueWithoutName(`${name}[${i}]`, v, itens);
                        })
                    }
                } else {
                    throw new Error(`Internal - Invalid SCHEMA TYPE ${schema.type}`);
                }
            }
        }
    }

    findPath(path: string, method: string): MetadataPathType | undefined {
        for (let i = 0; i < this.paths.length; i++) {
            const regexp = "^" + this.paths[i].path.replace(/{[a-zA-Z0-9_]+}/g, '[a-zA-Z0-9_]+').replace(/\//g, '\\/') + "$";
            const reg = new RegExp(regexp);
            if (reg.test(path) && this.paths[i].type === method) {
                return this.paths[i];
            }
        }
        return undefined;
    }

    private findScheme($ref: string) {
        for (let i = 0; i < this.schemas.length; i++) {
            const schema = this.schemas[i];
            if (`#/components/schemas/${schema.name}` === $ref) {
                return schema;
            }
        }
        throw new Error(`Internal - SCHEMA NOT FOUND ${$ref}`);
    }

    addSchema(schema: MetadataValueType) {
        this.schemas.push(schema);
    }

    addPath(path: MetadataPathType) {
        this.paths.push(path);
        return path;
    }

    generateSwaggerJson = () => {
        const paths: any = {};
        const definitions: any = {};

        this.paths.forEach(path => {
            let obj;
            if (paths[path.path] === undefined) {
                obj = {}
                paths[path.path] = obj;
            } else {
                obj = paths[path.path];
            }

            const method: any = {};

            if (path.security === false) method.security = [];
            method.description = path.description;
            method.tags = [path.controller];
            method.produces = ['application/json'];

            if (path.body) {
                method.requestBody = {
                    content: {
                        "application/json": {
                            schema: paranToJsonWithoutName(path.body)
                        }
                    }
                }
            }
            if (path.parameters) {
                method.parameters = path.parameters.map(p => {
                    const jsonParameter: any = { ...p, $ref: undefined };
                    if (p.$ref) {
                        jsonParameter.content = {
                            "application/json": {
                                schema: {
                                    $ref: p.$ref
                                }
                            }
                        }
                    }
                    return jsonParameter;
                });
            }

            method.responses = {};
            path.responses = [...path.responses, ...DEFAULT_ERROR_RESPONSE]
            path.responses.forEach(r => {
                const resp: any = {
                    description: r.description,
                }
                if (r.body) {
                    resp.content = {
                        "application/json": {
                            schema: paranToJsonWithoutName(r.body)
                        }
                    }
                }
                method.responses[r.code] = resp;
            });

            obj[path.type] = method;
        });
        this.schemas.forEach(schema => paranToJson(definitions, schema));

        const swaggerJson = {
            openapi: '3.0.0',
            info: {
                title: "bywise-node",
                version: pjson.version,
                description: "bywise node",
                contact: {
                    name: "Devel Blockchain",
                    email: "contact@develblockchain.com"
                }
            },
            paths: paths,
            components: {
                schemas: definitions,
                securitySchemes: {
                    jwt: {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "JWT"
                    }
                }
            },
            definitions: definitions,
            security: [
                {
                    "jwt": []
                }
            ]
        };
        return swaggerJson;
    }
}

const metadataDocument = new MetadataDocument();

export default metadataDocument;