import jwt from 'jsonwebtoken';
import { TokenInfo } from "../types";
import { ApplicationContext } from '../types/task.type';

export default class AuthProvider {

    private JWT: string;

    constructor(applicationContext: ApplicationContext) {
        this.JWT = applicationContext.keyJWT;
    }

    async createNodeToken(expiresInSeconds: number): Promise<string> {
        return await this.createJWTToken({
            type: 'node',
            id: ''
        }, expiresInSeconds);
    }

    async createJWTToken(info: TokenInfo, expiresInSeconds: number): Promise<string> {
        return jwt.sign({
            ...info,
        }, this.JWT, {
            expiresIn: expiresInSeconds,
        });
    }

    async checkJWT(token: string): Promise<TokenInfo | null> {
        try {
            if (token === this.JWT) {
                return {
                    type: 'node',
                    id: ''
                }
            }
            const decode: any = jwt.verify(token, this.JWT);
            if (!decode) return null;
            return decode;
        } catch (err) {
            return null;
        }
    }
}

