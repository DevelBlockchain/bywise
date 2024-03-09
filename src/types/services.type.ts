
export type NewService = {
    key: string;
    address: string;
    name: string;
    code: string;
    sign: string;
}

export type UpdateService = {
    id: string;
    address: string;
    operation: 'del' | 'patch' | 'get';
    code?: string;
    sign: string;
}