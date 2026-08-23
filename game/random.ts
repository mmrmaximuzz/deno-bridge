import { DealFilter } from "./deal_filters.ts";
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

const DEFAULT_RETRIES = 50000;
const MAX_RETRIES = 1000000;

export function generateHandWithFilter(f: DealFilter): Deal {
    let limit = (() => {
        if (!f.limit) {
            return DEFAULT_RETRIES;
        }

        if (f.limit <= 0 || Math.trunc(f.limit) != f.limit) {
            throw new Error(`AssertionError: bad limit for hand generation: ${f.limit}`);
        }
        if (f.limit > MAX_RETRIES) {
            throw new Error(`AssertionError: too big limit for hand generation: ${f.limit}`);
        }
        return f.limit;
    })();

    while (limit--) {
        const deal = getRandomDeal();
        if (f.pred(deal)) {
            return deal;
        }
    }

    throw new Error(`Retries limit exceeded: probably too strict or incorrect filter`);
}
