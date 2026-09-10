import { Card, Deal, Denomination, Rank, Side, Suit } from "../../shared/types.ts";

import { allDifferent, compare2Tuples, getAllSides, getPartner, nextSide } from "./utils.ts";

export type Trick = Record<Side, Card>;
export type CardPlayResponse =
    | { kind: "next"; lastTurn: Side }
    | { kind: "trick"; lastTurn: Side; winner: Side }
    | { kind: "error"; err: string }
    | { kind: "done"; lastTurn: Side; winner: Side };
export interface CardPlay {
    handle(side: Side, card: Card): CardPlayResponse;
}

export function processTrick(trick: Trick, lead: Suit, denom: Denomination): Side {
    const suitCards: [Rank, Side][] = [];
    const trumpCards: [Rank, Side][] = [];

    // sanity check
    if (!allDifferent([trick.W, trick.N, trick.E, trick.S], compare2Tuples)) {
        throw new Error(`AssertionError: bad trick ${JSON.stringify(trick)}`);
    }

    for (const side of getAllSides()) {
        const [suit, rank] = trick[side];
        if (suit == lead) {
            suitCards.push([rank, side]);
        } else if (suit == denom) {
            // if denom is NT, then this branch is unreachable
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

class CardPlayImpl implements CardPlay {
    declarer: Side;
    denom: Denomination;
    turn: Side;
    cards: Deal;
    currentTrick: [Side, Card][];
    nrTricks: number;

    constructor(deal: Deal, declarer: Side, denom: Denomination) {
        this.declarer = declarer;
        this.denom = denom;
        this.turn = nextSide(declarer); // the first move is an opening lead
        this.cards = {
            // make a deep copy as we are going to modify during play
            W: ([] as Card[]).concat(deal.W),
            N: ([] as Card[]).concat(deal.N),
            E: ([] as Card[]).concat(deal.E),
            S: ([] as Card[]).concat(deal.S),
        };
        this.currentTrick = [];
        this.nrTricks = 0;
    }

    findCardIndex(side: Side, card: Card): number {
        const hand = this.cards[side];
        return hand.findIndex((c) => c[0] == card[0] && c[1] == card[1]);
    }

    hasCard(side: Side, card: Card): boolean {
        return this.findCardIndex(side, card) != -1;
    }

    hasSuit(side: Side, suit: Suit): boolean {
        const hand = this.cards[side];
        return hand.find((c) => c[0] == suit) != undefined;
    }

    checkFollowSuit(turn: Side, card: Card, origin: Card): boolean {
        const origSuit = origin[0];
        if (card[0] == origSuit) {
            return true;
        }
        // not following suit only allowed when void in this suit
        return !this.hasSuit(turn, origSuit);
    }

    handle(side: Side, card: Card): CardPlayResponse {
        if (this.nrTricks == 13) {
            return { kind: "error", err: "the play is over, no cards left " };
        }

        const dummy = getPartner(this.declarer);
        if (side == dummy) {
            // prevent dummy to play
            return { kind: "error", err: "dummies are not allowed to play" };
        }

        if (this.turn != dummy) {
            // ordinary move, check the turn order
            if (side != this.turn) {
                return { kind: "error", err: `now it is ${this.turn}'s play, not yours` };
            }
        } else {
            // declarer plays for the dummy
            if (side != this.declarer) {
                return {
                    kind: "error",
                    err: `now it is declarer(${this.declarer})'s turn from the dummy`,
                };
            }
        }

        const idx = this.findCardIndex(this.turn, card);
        if (idx === -1) {
            // handle special errors for wrong moves with the dummy
            if (this.turn == dummy && this.hasCard(this.declarer, card)) {
                return { kind: "error", err: "you must play from the table (not your hand)" };
            }
            if (this.turn == this.declarer && this.hasCard(dummy, card)) {
                return { kind: "error", err: "you must play from your hand (not the table)" };
            }
            // everything else is cheating?
            // cheating?
            return { kind: "error", err: "you don't have this card" };
        }

        if (this.currentTrick.length > 0) {
            if (!this.checkFollowSuit(this.turn, card, this.currentTrick[0][1])) {
                return { kind: "error", err: "you must follow the suit" };
            }
        }
        this.cards[this.turn].splice(idx, 1);

        this.currentTrick.push([this.turn, card]);
        if (this.currentTrick.length != 4) {
            // trick is not complete, go to the next player
            const lastTurn = this.turn;
            this.turn = nextSide(this.turn);
            return { kind: "next", lastTurn };
        }

        // trick is complete, process it
        const W = this.currentTrick.find((c) => c[0] == "W");
        const N = this.currentTrick.find((c) => c[0] == "N");
        const E = this.currentTrick.find((c) => c[0] == "E");
        const S = this.currentTrick.find((c) => c[0] == "S");
        if (!W || !N || !E || !S) {
            throw new Error(
                `AssertionError: impossible transition in current trick state: ${this.currentTrick}`,
            );
        }
        const lastTurn = this.turn;
        this.turn = processTrick(
            {
                W: W[1],
                N: N[1],
                E: E[1],
                S: S[1],
            },
            this.currentTrick[0][1][0],
            this.denom,
        );
        this.currentTrick = []; // reset the current trick state

        ++this.nrTricks;
        if (this.nrTricks < 13) {
            return { kind: "trick", winner: this.turn, lastTurn };
        } else {
            return { kind: "done", lastTurn, winner: this.turn };
        }
    }
}

export function createCardPlay(deal: Deal, declarer: Side, denom: Denomination): CardPlay {
    return new CardPlayImpl(deal, declarer, denom);
}

export const __test__ = {
    createCardPlayImpl(deal: Deal, declarer: Side, denom: Denomination): CardPlayImpl {
        return new CardPlayImpl(deal, declarer, denom);
    },
};
