import { ALL_SIDES, allDifferent, compare2Tuples, Side, unbiasedRandRange } from "./common.ts";

export type Suit = "C" | "D" | "H" | "S";
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type Card = [Suit, Rank];
export type Deal = Record<Side, Card[]>;
export type Trick = Record<Side, Card>;

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

export function processTrick(trick: Trick, lead: Suit, trump?: Suit): Side {
    const suitCards: [Rank, Side][] = [];
    const trumpCards: [Rank, Side][] = [];

    // sanity check
    if (!allDifferent([trick.W, trick.N, trick.E, trick.S], compare2Tuples)) {
        throw new Error(`AssertionError: bad trick ${JSON.stringify(trick)}`);
    }

    for (const side of ALL_SIDES) {
        const [suit, rank] = trick[side];
        if (suit == lead) {
            suitCards.push([rank, side]);
        } else if (suit == trump) {
            trumpCards.push([rank, side]);
        }
    }

    if (!suitCards.length) {
        throw new Error(`AssertionError: no lead ${lead} in ${JSON.stringify(trick)}`);
    }

    return (trumpCards.length ? trumpCards : suitCards).reduce((max, curr) =>
        curr[0] > max[0] ? curr : max
    )[1];
}
