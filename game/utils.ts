import { Card, Deal, Pair, Rank, Side, Suit, Vulnerability } from "./types.ts";

export function getAllSides(): Side[] {
    return ["W", "N", "E", "S"];
}

export function nextSide(side: Side): Side {
    switch (side) {
        case "N":
            return "E";
        case "E":
            return "S";
        case "S":
            return "W";
        case "W":
            return "N";
    }
}

export function getPartner(side: Side): Side {
    switch (side) {
        case "W":
            return "E";
        case "E":
            return "W";
        case "N":
            return "S";
        case "S":
            return "N";
    }
}

export function getPair(side: Side): Pair {
    switch (side) {
        case "W":
        case "E":
            return "WE";
        case "N":
        case "S":
            return "NS";
    }
}

export function sideWEDynamicCast(side: Side): "W" | "E" {
    switch (side) {
        case "W":
            return "W";
        case "E":
            return "E";
        case "N":
        case "S":
            throw new Error(`assertion error: dynamic_cast<WE> failed from: ${side}`);
    }
}

export function sideNSDynamicCast(side: Side): "N" | "S" {
    switch (side) {
        case "N":
            return "N";
        case "S":
            return "S";
        case "W":
        case "E":
            throw new Error(`assertion error: dynamic_cast<NS> failed from: ${side}`);
    }
}

export function samePairs(s1: Side, s2: Side): boolean {
    return getPair(s1) == getPair(s2);
}

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

export function allDifferent<T>(xs: T[], comparator?: (a: T, b: T) => number): boolean {
    xs.sort();
    for (let i = 0; i < xs.length - 1; ++i) {
        if (comparator) {
            if (comparator(xs[i], xs[i + 1]) == 0) {
                return false;
            }
        } else {
            if (xs[i] == xs[i + 1]) {
                return false;
            }
        }
    }
    return true;
}

export function compare2Tuples<T, V>(a: [T, V], b: [T, V]): number {
    if (a[0] > b[0]) {
        return 1;
    }

    if (a[0] < b[0]) {
        return -1;
    }

    if (a[1] > b[1]) {
        return 1;
    }

    if (a[1] < b[1]) {
        return -1;
    }

    return 0;
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
