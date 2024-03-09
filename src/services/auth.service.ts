import jwt from 'jsonwebtoken';
import { TokenInfo } from "../types";
import { ApplicationContext } from '../types/task.type';

export default class AuthProvider {

    private JWT: string;

    constructor(applicationContext: ApplicationContext) {
        this.JWT = applicationContext.keyJWT;
    }

    async createNodeToken(): Promise<string> {
        return await this.createJWTToken({
            type: 'node',
            id: ''
        }, 10 * 60 * 60 * 1000);
    }

    async createJWTToken(info: TokenInfo, expiresInSeconds: number): Promise<string> {
        return jwt.sign({
            ...info,
            //iat: (Math.floor(Date.now() / 1000) - 30)
        }, this.JWT, {
            expiresIn: expiresInSeconds,
        });
    }

    async checkJWT(token: string): Promise<TokenInfo | null> {
        try {
            const decode: any = jwt.verify(token, this.JWT);
            if (!decode) return null;
            return decode;
        } catch (err) {
            return null;
        }
    }
}

