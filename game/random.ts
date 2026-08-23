import { Card, Deal, Rank, Side, Suit, Vulnerability } from "./types.ts";
import { getAllSides } from "./utils.ts";

export function unbiasedRandRange(limit: number): number {
    const upperLimit = Math.floor(0xFFFFFFFF / limit) * limit;
    while (true) {
        const bytes = new Uint32Array(1);
        crypto.getRandomValues(bytes);
        const value = bytes[0];
        if (value < upperLimit) {
            return value % limit;
        }
    }
}

export function getRandomSide(): Side {
    const allSides = getAllSides();
    return allSides[unbiasedRandRange(allSides.length)];
}

export function getRandomVulnerability(): Vulnerability {
    const ALL: Vulnerability[] = ["NONE", "NS", "WE", "BOTH"];
    return ALL[unbiasedRandRange(ALL.length)];
}

export function getRandomDeal(): Deal {
    const ALL_SUITS: Suit[] = ["S", "H", "D", "C"];
    const ALL_RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

    const cards: Card[] = [];
    for (const suit of ALL_SUITS) {
        for (const rank of ALL_RANKS) {
            cards.push([suit, rank]);
        }
    }

    // fisher-yates with unbiased randrange
    for (let i = cards.length - 1; i > 0; --i) {
        const j = unbiasedRandRange(i);
        [cards[i], cards[j]] = [cards[j], cards[i]];
    }

    return {
        W: cards.slice(0, 13),
        N: cards.slice(13, 26),
        E: cards.slice(26, 39),
        S: cards.slice(39, 52),
    };
}
