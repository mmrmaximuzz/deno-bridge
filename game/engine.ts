import { Bid, Bidding, createBidding, FinalContract, InvalidBid } from "./bidding.ts";
import { Card, CardPlay, createCardPlay, Deal, getRandomDeal } from "./cards.ts";
import { getRandomSide, nextSide, Side } from "./common.ts";
import { getRandomVulnerability, Vulnerability } from "./vulnerability.ts";

export type EngineRequest = {
    side: Side;
    data:
        | { kind: "bid"; bid: Bid }
        | { kind: "cardplay"; card: Card };
};
export type EngineResponse =
    | { kind: "ok" }
    | { kind: "passout" }
    | { kind: "done"; side: Side; card: Card; winner: Side }
    | { kind: "attack"; contract: FinalContract }
    | { kind: "startplay"; lead: Card; dummy: Side; table: Card[] }
    | { kind: "playcard"; side: Side; card: Card }
    | { kind: "trick"; side: Side; card: Card; winner: Side }
    | { kind: "err"; err: string };
export type EngineFullState = {
    phase: "auction" | "attack" | "play";
    bidHistory: [Side, Bid[]];
    vuln: Vulnerability;
    deal: Deal;
    dealer: Side;
    lead: [Side, Card] | null;
};
export interface Engine {
    handle(req: EngineRequest): EngineResponse;
    getFullState(): EngineFullState;
    restart(): void;
}

type EngineState = {
    deal: Deal;
    phase: "auction" | "attack" | "play";
    bidding: Bidding;
    play: CardPlay | null;
    vuln: Vulnerability;
    dealer: Side;
    lead: [Side, Card] | null;
};
class EngineImpl implements Engine {
    state: EngineState;

    createNewState(): EngineState {
        const dealer = getRandomSide();
        return {
            deal: getRandomDeal(),
            phase: "auction",
            bidding: createBidding(dealer),
            vuln: getRandomVulnerability(),
            play: null,
            dealer,
            lead: null,
        };
    }

    constructor() {
        this.state = this.createNewState();
    }

    restart() {
        this.state = this.createNewState();
    }

    ok(): EngineResponse {
        return { kind: "ok" };
    }

    passout(): EngineResponse {
        return { kind: "passout" };
    }

    attack(contract: FinalContract): EngineResponse {
        return {
            kind: "attack",
            contract,
        };
    }

    startPlay(lead: Card, dummy: Side, table: Card[]): EngineResponse {
        return {
            kind: "startplay",
            lead,
            dummy,
            table,
        };
    }

    playCard(side: Side, card: Card): EngineResponse {
        return {
            kind: "playcard",
            side,
            card,
        };
    }

    trick(side: Side, card: Card, winner: Side): EngineResponse {
        return {
            kind: "trick",
            side,
            card,
            winner,
        };
    }

    done(side: Side, card: Card, winner: Side): EngineResponse {
        return { kind: "done", side, card, winner };
    }

    err(msg: string): EngineResponse {
        return { kind: "err", err: msg };
    }

    handleBidPlay(side: Side, bid: Bid): EngineResponse {
        switch (this.state.phase) {
            case "auction": {
                const currentTurn = this.state.bidding.turn();
                if (currentTurn != side) {
                    return this.err(`now it is ${currentTurn}'s turn, not yours`);
                }
                try {
                    const res = this.state.bidding.handle(bid);
                    if (res == "inprogress") {
                        return this.ok();
                    } else if (res == "passout") {
                        return this.passout();
                    } else {
                        this.state.phase = "attack";
                        this.state.play = createCardPlay(
                            this.state.deal,
                            res.declarer,
                            res.contract.denom,
                        );
                        return this.attack(res);
                    }
                } catch (e) {
                    if (e instanceof InvalidBid) {
                        return this.err(`invalid bid: ${e.message}`);
                    }
                    throw e;
                }
            }
            case "attack":
            case "play":
                return this.err(`the bidding of over`);
        }
    }

    handleCardPlay(side: Side, card: Card): EngineResponse {
        switch (this.state.phase) {
            case "auction":
                return this.err(`the bidding is not finished yet`);
            case "attack": {
                if (!this.state.play) {
                    throw new Error(
                        "Assertion Error: impossible transition - attack with no active CardPlay",
                    );
                }
                const res = this.state.play.handle(side, card);
                if (res.kind == "next") {
                    // if attack was correct, switch state and publish dummy's hand
                    this.state.lead = [side, card]; // save the opening lead
                    this.state.phase = "play";
                    const dummy = nextSide(side);
                    return this.startPlay(card, dummy, this.state.deal[dummy]);
                } else if (res.kind == "error") {
                    return this.err(res.err);
                } else {
                    throw new Error(
                        `AssertionError: impossible state: opening lead on ${res.kind}`,
                    );
                }
            }
            case "play": {
                if (!this.state.play) {
                    throw new Error(
                        "Assertion Error: impossible transition - play with no active CardPlay",
                    );
                }
                const res = this.state.play.handle(side, card);
                if (res.kind == "next") {
                    return this.playCard(res.lastTurn, card);
                } else if (res.kind == "trick") {
                    return this.trick(res.lastTurn, card, res.winner);
                } else if (res.kind == "done") {
                    return this.done(res.lastTurn, card, res.winner);
                } else if (res.kind == "error") {
                    return this.err(res.err);
                }
            }
        }
        throw new Error("unreachable");
    }

    handle(req: EngineRequest): EngineResponse {
        switch (req.data.kind) {
            case "bid":
                return this.handleBidPlay(req.side, req.data.bid);
            case "cardplay":
                return this.handleCardPlay(req.side, req.data.card);
        }
    }

    getFullState(): EngineFullState {
        return {
            deal: this.state.deal,
            phase: this.state.phase,
            bidHistory: this.state.bidding.getHistory(),
            vuln: this.state.vuln,
            dealer: this.state.dealer,
            lead: this.state.lead,
        };
    }
}

export function createEngine(): Engine {
    return new EngineImpl();
}
