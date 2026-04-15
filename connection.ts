import { Engine } from "./engine.ts";
import { ALL_SIDES, Side } from "./game/common.ts";
import { parseBid, parseDenomination, parseLevel } from "./parsing.ts";

export interface ConnectionManager {
    register(side: Side, sock: WebSocket): void;
}

class ConnectionManagerImpl implements ConnectionManager {
    conns: Record<Side, WebSocket | null>;
    engine: Engine;

    constructor(engine: Engine) {
        this.conns = { W: null, N: null, E: null, S: null };
        this.engine = engine;
    }

    createNotification(notification: string): string {
        return JSON.stringify({ kind: "notify", data: `server: ${notification}` });
    }

    createError(err: string): string {
        return JSON.stringify({ kind: "error", data: `server: ${err}` });
    }

    reportError(err: string, conn?: WebSocket): void {
        console.error(err);
        conn?.send(this.createError(err));
    }

    handleOpen(conn: WebSocket, side: Side): void {
        const res = this.engine.handle({ side, data: { kind: "playerConnected" } });
        switch (res.kind) {
            case "ok":
                return;
            case "err":
                conn.send(this.createNotification(res.err));
                return;
            case "stopped":
            case "deal":
                break;
        }
    }

    broadcastChatMessage(side: Side, text: string): void {
        for (const s of ALL_SIDES) {
            const line = s == side ? `${side}(you): ${text}` : `${side}: ${text}`;
            const conn = this.conns[s];
            conn?.send(JSON.stringify({
                kind: "chat",
                data: line,
            }));
        }
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
                break;
            case "err":
                conn.send(this.createNotification(`engine: ${response.err}`));
                return;
            case "stopped":
                conn.send(this.createError("game has been stopped"));
                return;
            case "deal":
                throw new Error("not implemented");
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
            case "init":
                console.log("INIT IS NOT IMPLEMENTED");
                return;
            case "chat":
                if (typeof (obj.data) != "string") {
                    this.reportError(`${side}: bad chat data: ${obj.data}`, conn);
                    return;
                }
                this.broadcastChatMessage(side, obj.data);
                return;
            case "engine":
                if (typeof (obj.data) != "object" || obj.data == null) {
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

    handleMessage(conn: WebSocket, side: Side, message: string): void {
        let rawObject: unknown = null;
        try {
            rawObject = JSON.parse(message);
        } catch (e) {
            if (e instanceof SyntaxError) {
                this.reportError(`${side}: failed to parse JSON from message: ${message}`);
                return;
            }
            throw e;
        }

        if (typeof rawObject != "object" || rawObject == null) {
            this.reportError(`${side}: bad message type: ${message}`, conn);
            return;
        }

        this.handleMessageInternal(conn, side, rawObject);
    }

    handleClose(side: Side): void {
        this.engine.handle({ side, data: { kind: "playerDisconnected" } });
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
            const data: unknown = event.data;
            if (typeof data != "string") {
                this.reportError(`${side}: bad message type from websocket: ${typeof data}`, sock);
                sock.close();
                return;
            }
            this.handleMessage(sock, side, data);
        });
        sock.addEventListener("close", () => {
            this.handleClose(side);
        });

        this.conns[side] = sock;
    }
}

export function createConnectionManager(engine: Engine): ConnectionManager {
    return new ConnectionManagerImpl(engine);
}
