import { evalHandsHcp } from "./hcp.ts";
import { Deal, Side, Suit } from "./types.ts";

export type DealFilter = {
    /** Logical predicate to filter deals */
    pred: (deal: Deal) => boolean;

    /**
     * If needed to generate some unique deals, there is a way to provide some
     * bigger cap limit.
     */
    limit?: number;
};

export function simpleFilterNSHcp(minHcp: number): DealFilter {
    return {
        pred: (deal: Deal) => {
            const hands = evalHandsHcp(deal);
            return hands["N"] + hands["S"] >= minHcp;
        },
    };
}

export function simpleFilterNSLongsuit(minLength: number): DealFilter {
    const NS_SIDES: Side[] = ["N", "S"];
    return {
        pred: (deal: Deal) => {
            for (const side of NS_SIDES) {
                const suits: Record<Suit, number> = { S: 0, C: 0, D: 0, H: 0 };
                for (const [suit, _rank] of deal[side]) {
                    ++suits[suit];
                    if (suits[suit] >= minLength) {
                        return true;
                    }
                }
            }
            return false;
        },
    };
}
