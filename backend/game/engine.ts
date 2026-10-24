// SPDX-License-Identifier: GPL-3.0-or-later
import {
    Bid,
    Card,
    Deal,
    getPair,
    getPartner,
    Pair,
    Side,
    Vulnerability,
} from "../../shared/types.ts";

import { Bidding, createBidding, FinalContract, InvalidBid } from "./bidding.ts";
import { CardPlay, createCardPlay } from "./cards.ts";

export type GameEvent =
    | { kind: "BidMade"; side: Side; bid: Bid }
    | { kind: "PassOut" }
    | { kind: "ContractReached"; contract: FinalContract }
    | { kind: "DummyRevealed"; side: Side; hand: Card[] }
    | { kind: "CardPlayed"; side: Side; card: Card }
    | { kind: "TrickCompleted"; winner: Side }
    | { kind: "DealFinished"; tricksNS: number; tricksWE: number };
export type EngineInput = {
    side: Side;
    data:
        | { kind: "bid"; bid: Bid }
        | { kind: "cardplay"; card: Card };
};
export type EngineResponse =
    | { kind: "ok"; events: GameEvent[] }
    | { kind: "err"; err: string };
export interface Engine {
    handle(req: EngineInput): EngineResponse;
}

class EngineImpl implements Engine {
    deal: Deal;
    dealer: Side;
    vuln: Vulnerability;
    fsm:
        | { phase: "auction"; bidding: Bidding }
        | { phase: "oplead"; contract: FinalContract }
        | { phase: "play"; play: CardPlay; tricks: Record<Pair, number> };

    constructor(deal: Deal, dealer: Side, vuln: Vulnerability) {
        this.deal = deal;
        this.fsm = { phase: "auction", bidding: createBidding(dealer) };
        this.vuln = vuln;
        this.dealer = dealer;
    }

    bidMade(side: Side, bid: Bid): EngineResponse {
        return { kind: "ok", events: [{ kind: "BidMade", side, bid }] };
    }

    passOut(side: Side, bid: Bid): EngineResponse {
        return { kind: "ok", events: [{ kind: "BidMade", side, bid }, { kind: "PassOut" }] };
    }

    contractReached(side: Side, bid: Bid, contract: FinalContract): EngineResponse {
        return {
            kind: "ok",
            events: [{ kind: "BidMade", side, bid }, { kind: "ContractReached", contract }],
        };
    }

    revealDummy(side: Side, lead: Card, dummy: Side, hand: Card[]): EngineResponse {
        return {
            kind: "ok",
            events: [{ kind: "CardPlayed", side, card: lead }, {
                kind: "DummyRevealed",
                side: dummy,
                hand,
            }],
        };
    }

    playCard(side: Side, card: Card): EngineResponse {
        return {
            kind: "ok",
            events: [{ kind: "CardPlayed", side, card }],
        };
    }

    trick(side: Side, card: Card, winner: Side): EngineResponse {
        return {
            kind: "ok",
            events: [{ kind: "CardPlayed", side, card }, { kind: "TrickCompleted", winner }],
        };
    }

    dealDone(side: Side, card: Card, winner: Side, tricks: Record<Pair, number>): EngineResponse {
        const tricksNS = tricks["NS"];
        const tricksWE = tricks["WE"];
        if (tricksNS + tricksWE != 13) {
            throw new Error(`AssertionError: NS(${tricksNS}) + WE(${tricksWE}) != 13`);
        }
        return {
            kind: "ok",
            events: [{ kind: "CardPlayed", side, card }, { kind: "TrickCompleted", winner }, {
                kind: "DealFinished",
                tricksNS,
                tricksWE,
            }],
        };
    }

    err(msg: string): EngineResponse {
        return { kind: "err", err: msg };
    }

    handleBidPlay(side: Side, bid: Bid): EngineResponse {
        switch (this.fsm.phase) {
            case "auction": {
                const bidding = this.fsm.bidding;
                const currentTurn = bidding.turn();
                if (currentTurn != side) {
                    return this.err(`now it is ${currentTurn}'s turn, not yours`);
                }
                try {
                    const res = bidding.handle(bid);
                    if (res == "inprogress") {
                        return this.bidMade(side, bid);
                    } else if (res == "passout") {
                        return this.passOut(side, bid);
                    } else {
                        this.fsm = {
                            phase: "oplead",
                            contract: res,
                        };
                        return this.contractReached(side, bid, res);
                    }
                } catch (e) {
                    if (e instanceof InvalidBid) {
                        return this.err(`invalid bid: ${e.message}`);
                    }
                    throw e;
                }
            }
            case "oplead":
            case "play":
                return this.err("the bidding is over");
        }
    }

    handleCardPlay(side: Side, card: Card): EngineResponse {
        switch (this.fsm.phase) {
            case "auction":
                return this.err(`the bidding is not finished yet`);
            case "oplead": {
                const contract = this.fsm.contract;
                const declarer = contract.declarer;
                const denom = contract.contract.denom;

                // create temporary card play to check the validity of opening lead
                const play = createCardPlay(this.deal, declarer, denom);

                const res = play.handle(side, card);
                switch (res.kind) {
                    case "next": {
                        this.fsm = {
                            phase: "play",
                            play,
                            tricks: {
                                NS: 0,
                                WE: 0,
                            },
                        };
                        const dummy = getPartner(declarer);
                        return this.revealDummy(side, card, dummy, this.deal[dummy]);
                    }
                    case "error":
                        return this.err(`failed opening lead: ${res.err}`);
                    default:
                        throw new Error(
                            `AssertionError: impossible state: opening lead on ${res.kind}`,
                        );
                }
            }
            case "play": {
                const play = this.fsm.play;
                const res = play.handle(side, card);
                switch (res.kind) {
                    case "next":
                        return this.playCard(res.lastTurn, card);
                    case "trick":
                        this.fsm.tricks[getPair(res.winner)]++;
                        return this.trick(res.lastTurn, card, res.winner);
                    case "done":
                        this.fsm.tricks[getPair(res.winner)]++;
                        return this.dealDone(res.lastTurn, card, res.winner, this.fsm.tricks);
                    case "error":
                        return this.err(res.err);
                }
            }
        }
    }

    handle(req: EngineInput): EngineResponse {
        switch (req.data.kind) {
            case "bid":
                return this.handleBidPlay(req.side, req.data.bid);
            case "cardplay":
                return this.handleCardPlay(req.side, req.data.card);
        }
    }
}

export function createEngine(deal: Deal, dealer: Side, vuln: Vulnerability): Engine {
    return new EngineImpl(deal, dealer, vuln);
}
