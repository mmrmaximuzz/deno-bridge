import { Engine, EngineFullState } from "./game/engine.ts";
import { ALL_SIDES, Side } from "./game/common.ts";
import { parseBid } from "./parsing.ts";
import { Bid } from "./game/bidding.ts";

export interface ConnectionManager {
    register(side: Side, sock: WebSocket): void;
}

class ConnectionManagerImpl implements ConnectionManager {
    conns: Record<Side, WebSocket | null>;
    engine: Engine;
    gen: number;

    constructor(engine: Engine) {
        this.conns = { W: null, N: null, E: null, S: null };
        this.engine = engine;
        this.gen = 0;
    }

    createNotification(notification: string): string {
        return JSON.stringify({ kind: "notify", data: `server: ${notification}` });
    }

    createError(err: string): string {
        return JSON.stringify({ kind: "error", data: `server: ${err}` });
    }

    createInit(side: Side, state: EngineFullState, gen: number): string {
        if (state.phase == "auction") {
            // on auction filter only the players cards
            return JSON.stringify({
                kind: "init",
                data: {
                    side,
                    state: {
                        phase: state.phase,
                        bidHistory: state.bidHistory,
                        deal: state.deal[side],
                    },
                    gen,
                },
            });
        } else {
            throw new Error("not implemented");
        }
    }

    reportError(err: string, conn?: WebSocket): void {
        console.error(err);
        conn?.send(this.createError(err));
    }

    handleOpen(conn: WebSocket, side: Side): void {
        this.conns[side] = conn;
    }

    broadcastChatMessage(side: Side, text: string): void {
        if (text.trim() == "") {
            // do not spam empty messages
            return;
        }

        for (const s of ALL_SIDES) {
            const line = s == side ? `${side}(you): ${text}` : `${side}: ${text}`;
            const conn = this.conns[s];
            conn?.send(JSON.stringify({
                kind: "chat",
                data: line,
            }));
        }
    }

    broadcastBidMessage(side: Side, bid: Bid): void {
        for (const s of ALL_SIDES) {
            const conn = this.conns[s];
            conn?.send(JSON.stringify({
                kind: "engine",
                data: {
                    kind: "auction",
                    side,
                    bid,
                    gen: this.gen,
                },
            }));
        }
    }

    handleInitMessage(conn: WebSocket, side: Side): void {
        conn.send(this.createInit(side, this.engine.getFullState(), this.gen));
    }

    handleEngineAuctionMessage(conn: WebSocket, side: Side, data: unknown): void {
        const bid = parseBid(data);
        if (!bid) {
            this.reportError(`failed to parse bid data: ${JSON.stringify(data)}`, conn);
            return;
        }

        const response = this.engine.handle({
            side,
            data: {
                kind: "auction",
                bid,
            },
        });

        switch (response.kind) {
            case "ok":
                ++this.gen;
                this.broadcastBidMessage(side, bid);
                break;
            case "err":
                conn.send(this.createNotification(`engine: ${response.err}`));
                return;
        }
    }

    handleEngineMessage(
        conn: WebSocket,
        side: Side,
        data: { kind?: unknown; bid?: unknown },
    ): void {
        switch (data.kind) {
            case "auction":
                this.handleEngineAuctionMessage(conn, side, data.bid);
                return;
            default:
                this.reportError(`${side}: bad engine message kind: ${data.kind}`, conn);
                return;
        }
    }

    handleMessageInternal(
        conn: WebSocket,
        side: Side,
        obj: { kind?: string; data?: unknown },
    ): void {
        switch (obj.kind) {
            case "chat":
                if (typeof obj.data != "string") {
                    this.reportError(`${side}: bad chat data: ${obj.data}`, conn);
                    return;
                }
                this.broadcastChatMessage(side, obj.data);
                return;
            case "init":
                this.handleInitMessage(conn, side);
                return;
            case "engine":
                if (typeof obj.data != "object" || obj.data == null) {
                    this.reportError(`${side}: bad engine data: ${obj.data}`, conn);
                    return;
                }
                this.handleEngineMessage(conn, side, obj.data);
                return;
            default:
                this.reportError(`${side}: bad message kind: ${obj.kind}`, conn);
                return;
        }
    }

    handleMessage(conn: WebSocket, side: Side, data: unknown): void {
        if (typeof data != "string") {
            this.reportError(`${side}: bad message type from websocket: ${typeof data}`, conn);
            conn.close();
            return;
        }

        let rawObject: unknown = null;
        try {
            rawObject = JSON.parse(data);
        } catch (e) {
            if (e instanceof SyntaxError) {
                this.reportError(`${side}: failed to parse JSON from message: ${data}`);
                return;
            }
            throw e;
        }

        if (typeof rawObject != "object" || rawObject == null) {
            this.reportError(`${side}: bad message type: ${data}`, conn);
            return;
        }

        this.handleMessageInternal(conn, side, rawObject);
    }

    handleClose(side: Side): void {
        this.conns[side] = null;
    }

    register(side: Side, sock: WebSocket): void {
        if (this.conns[side]) {
            // warn the connected user
            this.conns[side].send(
                this.createNotification("someone tried to reuse your invite link"),
            );
            // reject the new connection outside of the current event handling
            setTimeout(() => {
                sock.send(this.createNotification("this invite link is already used"));
                sock.close();
            });
            return;
        }

        sock.addEventListener("open", () => {
            this.handleOpen(sock, side);
        });
        sock.addEventListener("message", (event) => {
            this.handleMessage(sock, side, event.data);
        });
        sock.addEventListener("close", () => {
            this.handleClose(side);
        });
    }
}

export function createConnectionManager(engine: Engine): ConnectionManager {
    return new ConnectionManagerImpl(engine);
}
