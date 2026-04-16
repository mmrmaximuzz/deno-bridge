import { Bid, Bidding, createBidding, InvalidBid } from "./bidding.ts";
import { Deal, getRandomDeal } from "./cards.ts";
import { ALL_SIDES, Side, unbiasedRandRange } from "./common.ts";

export type EngineRequest = {
    side: Side;
    data: { kind: "auction"; bid: Bid };
};
export type EngineResponse =
    | { kind: "ok" }
    | { kind: "err"; err: string };
export type EngineFullState = {
    phase: "auction" | "attack" | "play";
    bidHistory: [Side, Bid[]];
    deal: Deal;
};
export interface Engine {
    handle(req: EngineRequest): EngineResponse;
    getFullState(): EngineFullState;
}

type EngineState = {
    deal: Deal;
    phase: "auction";
    bidding: Bidding;
};
class EngineImpl implements Engine {
    state: EngineState;

    createNewState(): EngineState {
        return {
            deal: getRandomDeal(),
            phase: "auction",
            bidding: createBidding(ALL_SIDES[unbiasedRandRange(4)]),
        };
    }

    constructor() {
        this.state = this.createNewState();
    }

    ok(): EngineResponse {
        return { kind: "ok" };
    }

    err(msg: string): EngineResponse {
        return { kind: "err", err: msg };
    }

    handleAuctionPlay(side: Side, bid: Bid): EngineResponse {
        switch (this.state.phase) {
            case "auction": {
                const currentTurn = this.state.bidding.turn();
                if (currentTurn != side) {
                    return this.err(`now it is ${currentTurn}'s turn, not yours`);
                }
                try {
                    const res = this.state.bidding.handle(bid);
                    // TODO: implement end of bidding and transition to next phase
                    if (res == "inprogress") {
                        return this.ok();
                    } else if (res == "passout") {
                        return this.ok();
                    } else {
                        return this.ok();
                    }
                } catch (e) {
                    if (e instanceof InvalidBid) {
                        return this.err(`invalid bid: ${e.message}`);
                    }
                    throw e;
                }
            }
        }
    }

    handle(req: EngineRequest): EngineResponse {
        switch (req.data.kind) {
            case "auction":
                return this.handleAuctionPlay(req.side, req.data.bid);
        }
    }

    getFullState(): EngineFullState {
        return {
            deal: this.state.deal,
            phase: this.state.phase,
            bidHistory: this.state.bidding.getHistory(),
        };
    }
}

export function createEngine(): Engine {
    return new EngineImpl();
}
