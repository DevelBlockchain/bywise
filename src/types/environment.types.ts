import { EnvironmentChanges } from "@bywise/web3";

export const ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export enum CompiledContext {
    MAIN_CONTEXT_HASH = 'main_context',
    SLICE_CONTEXT_HASH = 'slice_context',
    SLICE_MINT_CONTEXT_HASH = 'slice_mint_context',
    SIMULATE_CONTEXT_HASH = 'simulate_context',
}

export type EnvironmentContext = {
    chain: string;
    fromContextHash: CompiledContext;
    blockHeight: number;
    changes: EnvironmentChanges;
}