import { evalHandsHcp } from "./hcp.ts";
import { Deal } from "./types.ts";

export function gameLike(deal: Deal): boolean {
    const hands = evalHandsHcp(deal);
    return hands["N"] + hands["S"] >= 20;
}

export function slamLike(deal: Deal): boolean {
    const hands = evalHandsHcp(deal);
    return hands["N"] + hands["S"] >= 28;
}
