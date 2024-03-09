import { BywiseHelper } from "@bywise/web3";
import BigNumber from "bignumber.js";
import { ApplicationContext } from "../types/task.type";

export type ChainData = {
    hash: string;
    address: string;
}

export class MinnerProvider {
    constructor(applicationContext: ApplicationContext) {
    }

    calcModule = (hexA: string, hexB: string): BigNumber => {
        if (!/[0-9a-f]{40}/.test(hexA)) throw new Error(`invalid hexA - ${hexA}`);
        if (!/[0-9a-f]{40}/.test(hexB)) throw new Error(`invalid hexB - ${hexB}`);
        const a = new BigNumber(hexA, 16);
        const b = new BigNumber(hexB, 16);
        return a.minus(b).abs();
    }

    compareDistance = (a: string, b: string): 'a' | 'b' => {
        return this.compare(
            new BigNumber(a, 16),
            new BigNumber(b, 16),
        );
    }

    compare = (a: BigNumber, b: BigNumber): 'a' | 'b' => {
        return a.isLessThanOrEqualTo(b) ? 'a' : 'b';
    }

    compareAddress = (hash: string, addressA: string, addressB: string): 'a' | 'b' => {
        if (hash.length !== 64) throw new Error(`invalid hash`);
        hash = hash.substring(24);
        addressA = BywiseHelper.decodeBWSAddress(addressA).ethAddress.substring(2);
        addressB = BywiseHelper.decodeBWSAddress(addressB).ethAddress.substring(2);
        const a = this.calcModule(hash, addressA);
        const b = this.calcModule(hash, addressB);
        return this.compare(a, b);
    }

    moduleChain = (chain: ChainData[]): BigNumber => {
        let totalMod = new BigNumber(0);
        for (let i = 0; i < chain.length; i++) {
            const data = chain[i];
            if (data.hash.length !== 64) throw new Error(`invalid hash`);
            const mod = this.calcModule(
                data.hash.substring(24),
                BywiseHelper.decodeBWSAddress(data.address).ethAddress.substring(2)
            );
            totalMod = totalMod.plus(mod);
        }
        return totalMod;
    }

    compareChain = (chainA: ChainData[], chainB: ChainData[]): 'a' | 'b' => {
        if (chainA.length !== chainB.length) throw new Error(`cant compare chains with different length`);
        const a = this.moduleChain(chainA);
        const b = this.moduleChain(chainB);
        return this.compare(a, b);
    }
}