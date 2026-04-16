import { Side, unbiasedRandRange } from "./common.ts";

export type Suit = "C" | "D" | "H" | "S";
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type Card = [Suit, Rank];
export type Deal = Record<Side, Card[]>;

export const ALL_SUITS: Suit[] = ["S", "H", "D", "C"];
export const ALL_RANKS: Rank[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function getRandomDeal(): Deal {
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
