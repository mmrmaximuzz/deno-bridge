// SPDX-License-Identifier: GPL-3.0-or-later
// side-related types and operations
export type Side = "W" | "N" | "E" | "S";
export type Pair = "WE" | "NS";

// card-related types
export type Suit = "C" | "D" | "H" | "S";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type Card = [Suit, Rank];
export type Deal = Record<Side, Card[]>;

// bidding-related types
export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Denomination = "C" | "D" | "H" | "S" | "NT";
export type Contract = { level: Level; denom: Denomination };
export type ContractStatus = "FREE" | "X" | "XX";
export type Bid = "PASS" | "X" | "XX" | Contract;
export type Vulnerability = "NONE" | "NS" | "WE" | "BOTH";

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

export function samePairs(s1: Side, s2: Side): boolean {
    return getPair(s1) == getPair(s2);
}
