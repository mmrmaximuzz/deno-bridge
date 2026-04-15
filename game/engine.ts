import { Bid, Bidding, createBidding, InvalidBid } from "./bidding.ts";
import { Side } from "./common.ts";

export type EngineRequest = {
    side: Side;
    data: { kind: "auction"; bid: Bid };
};
export type EngineResponse =
    | { kind: "ok" }
    | { kind: "err"; err: string }
;
export type EngineFullState = {
    phase: "auction" | "attack" | "play";
    bidHistory: [Side, Bid[]],
};
export interface Engine {
    handle(req: EngineRequest): EngineResponse;
    getFullState(): EngineFullState;
}

type EngineState = { kind: "auction"; bidding: Bidding };

class EngineImpl implements Engine {
    state: EngineState;
    deals: number;

    constructor() {
        this.state = { kind: "auction", bidding: createBidding("N") };
        this.deals = 0;
    }

    ok(): EngineResponse {
        return { kind: "ok" };
    }

    err(msg: string): EngineResponse {
        return { kind: "err", err: msg };
    }

    handleAuctionPlay(side: Side, bid: Bid): EngineResponse {
        switch (this.state.kind) {
            case "auction": {
                const currentTurn = this.state.bidding.turn();
                if (currentTurn != side) {
                    return this.err(`now is ${currentTurn}'s turn, not yours`);
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
            phase: this.state.kind,
            bidHistory: this.state.bidding.getHistory(),
        }
    }

}

export function createEngine(): Engine {
    return new EngineImpl();
}
