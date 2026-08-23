import { Card, Deal, Side } from "./types.ts";

export function hcp(card: Card): number {
    const [_, rank] = card;
    return rank > 10 ? rank - 10 : 0;
}

export function evalCardsHcp(cards: Card[]): number {
    return cards.map(hcp).reduce((a, b) => a + b);
}

export function evalHandsHcp(deal: Deal): Record<Side, number> {
    return {
        W: evalCardsHcp(deal.W),
        N: evalCardsHcp(deal.N),
        E: evalCardsHcp(deal.E),
        S: evalCardsHcp(deal.S),
    };
}
