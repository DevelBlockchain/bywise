export type TokenInfo = {
    type: 'user' | 'node' | 'token',
    id: string,
    username?: string,
}

export type SignupDTO = {
    username: string;
    password: string;
    code2fa?: string;
}