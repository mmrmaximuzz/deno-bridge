import { Bid, Bidding, createBidding, InvalidBid } from "./bidding.ts";
import { Deal, getRandomDeal } from "./cards.ts";
import { getRandomSide, Side } from "./common.ts";
import { getRandomVulnerability, Vulnerability } from "./vulnerability.ts";

export type EngineRequest = {
    side: Side;
    data: { kind: "auction"; bid: Bid };
};
export type EngineResponse =
    | { kind: "ok" }
    | { kind: "oknextdeal" }
    | { kind: "err"; err: string };
export type EngineFullState = {
    phase: "auction" | "attack" | "play";
    bidHistory: [Side, Bid[]];
    vuln: Vulnerability;
    deal: Deal;
};
export interface Engine {
    handle(req: EngineRequest): EngineResponse;
    getFullState(): EngineFullState;
    restart(): void;
}

type EngineState = {
    deal: Deal;
    phase: "auction";
    bidding: Bidding;
    vuln: Vulnerability;
};
class EngineImpl implements Engine {
    state: EngineState;

    createNewState(): EngineState {
        return {
            deal: getRandomDeal(),
            phase: "auction",
            bidding: createBidding(getRandomSide()),
            vuln: getRandomVulnerability(),
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

    okNextDeal(): EngineResponse {
        return { kind: "oknextdeal" };
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
                    if (res == "inprogress") {
                        return this.ok();
                    } else if (res == "passout") {
                        // TODO: implement full game, not only bidding
                        return this.okNextDeal();
                    } else {
                        // TODO: implement full game, not only bidding
                        return this.okNextDeal();
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
            vuln: this.state.vuln,
        };
    }
}

export function createEngine(): Engine {
    return new EngineImpl();
}
