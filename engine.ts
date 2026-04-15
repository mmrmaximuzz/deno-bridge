import { Bid, Bidding, createBidding, InvalidBid } from "./game/bidding.ts";
import { ALL_SIDES, Side } from "./game/common.ts";

export type EngineRequest = {
    side: Side;
    data:
        | { kind: "playerConnected" }
        | { kind: "auction"; bid: Bid }
        | { kind: "playerDisconnected" };
};
export type EngineResponse =
    | { kind: "ok" }
    | { kind: "stopped" }
    | { kind: "err"; err: string }
    | { kind: "deal"; cards: Record<Side, unknown> };
export interface Engine {
    handle(req: EngineRequest): EngineResponse;
}

type EngineState =
    | { kind: "connecting"; connected: Side[] }
    | { kind: "bidding"; bidding: Bidding }
    | { kind: "stopped" };

class EngineImpl implements Engine {
    state: EngineState;
    deals: number;

    constructor() {
        this.state = { kind: "connecting", connected: [] };
        this.deals = 0;
    }

    ok(): EngineResponse {
        return { kind: "ok" };
    }

    err(msg: string): EngineResponse {
        return { kind: "err", err: msg };
    }

    stopped(): EngineResponse {
        return { kind: "stopped" };
    }

    handlePlayerConnection(side: Side): EngineResponse {
        switch (this.state.kind) {
            case "connecting":
                if (this.state.connected.find((s) => s == side)) {
                    // this side is already connected
                    return this.err(`connection ${side} already exists`);
                }
                this.state.connected.push(side);
                if (this.state.connected.length == 4) {
                    // all players connected, start playing
                    this.state = {
                        kind: "bidding",
                        bidding: createBidding(ALL_SIDES[this.deals]),
                    };
                }
                return this.ok();
            case "stopped":
                // already stopped
                return this.err("this engine is already stopped");
            case "bidding":
                return this.err("cannot connect now, game already started");
        }
    }

    handlePlayerDisconnect(side: Side): EngineResponse {
        switch (this.state.kind) {
            case "connecting":
                if (!this.state.connected.find((s) => s == side)) {
                    // unreachable
                    throw new Error(`assertion error: disconnecting unknown player: ${side}`);
                }
                this.state.connected = this.state.connected.filter((s) => s != side);
                return this.ok();
            case "stopped":
                // already stopped, do not do anything
                return this.ok();
            case "bidding":
                // TODO: make the engine resilient to disconnecting.
                // Now it simply finishes when any of the player disconnects during play.
                this.state = { kind: "stopped" };
                return this.stopped();
        }
    }

    handleAuctionPlay(side: Side, bid: Bid): EngineResponse {
        switch (this.state.kind) {
            case "stopped":
            case "connecting":
                return this.err("current engine state does not accept bid requests");
            case "bidding": {
                const currentTurn = this.state.bidding.turn();
                if (currentTurn != side) {
                    return this.err(`now is ${currentTurn}'s turn, not yours`);
                }
                try {
                    const res = this.state.bidding.handle(bid);
                    // TODO: implement end of bidding
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
            case "playerConnected":
                return this.handlePlayerConnection(req.side);
            case "playerDisconnected":
                return this.handlePlayerDisconnect(req.side);
            case "auction":
                return this.handleAuctionPlay(req.side, req.data.bid);
        }
    }
}

export function createEngine(): Engine {
    return new EngineImpl();
}
