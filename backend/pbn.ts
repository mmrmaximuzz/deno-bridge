// SPDX-License-Identifier: GPL-3.0-or-later
import { parseSide } from "../shared/parsing.ts";
import { Card, Deal, nextSide, Rank, Suit } from "../shared/types.ts";

function parsePbnRank(raw: string): Rank | null {
    switch (raw) {
        case "A":
            return 14;
        case "K":
            return 13;
        case "Q":
            return 12;
        case "J":
            return 11;
        case "T":
            return 10;
        case "9":
            return 9;
        case "8":
            return 8;
        case "7":
            return 7;
        case "6":
            return 6;
        case "5":
            return 5;
        case "4":
            return 4;
        case "3":
            return 3;
        case "2":
            return 2;
        default:
            return null;
    }
}

export function parsePbnHand(pbnHand: string): Card[] | null {
    const suits = pbnHand.split(".");
    if (suits.length != 4) {
        return null;
    }

    const [spades, hearts, diamonds, clubs] = suits;
    const pairs: [Suit, string][] = [
        ["S", spades],
        ["H", hearts],
        ["D", diamonds],
        ["C", clubs],
    ];
    const hand: Card[] = [];
    for (const [suit, cards] of pairs) {
        for (const c of cards) {
            const rank = parsePbnRank(c);
            if (!rank) {
                return null;
            }
            hand.push([suit, rank]);
        }
    }
    return hand;
}

export function parsePbnSingleDeal(text: string): Deal | null {
    const dealLine = (() => {
        for (const line of text.split("\n")) {
            if (line.startsWith(`[Deal "`) && line.endsWith(`"]`)) {
                return line.slice(7, -2);
            }
        }
        return null;
    })();
    if (!dealLine) {
        return null;
    }

    // extract the first position
    const [fromSide, sep, cardsLine] = [dealLine[0], dealLine[1], dealLine.slice(2)];
    const startSide = parseSide(fromSide);
    if (!startSide || sep != ":") {
        return null;
    }

    // pack the final result
    const deal: Deal = {
        W: [],
        N: [],
        E: [],
        S: [],
    };
    let thisSide = startSide;
    for (const sideHandText of cardsLine.split(" ")) {
        const hand = parsePbnHand(sideHandText);
        if (!hand) {
            return null;
        }
        deal[thisSide] = hand;
        thisSide = nextSide(thisSide);
    }

    return deal;
}

export function parsePbnDeals(text: string): Deal[] | null {
    const deals = [];
    for (const chunk of text.split("\n\n")) {
        const deal = parsePbnSingleDeal(chunk);
        if (!deal) {
            console.error("failed to parse pbn deal", chunk);
            return null;
        }
        deals.push(deal);
    }
    return deals;
}
