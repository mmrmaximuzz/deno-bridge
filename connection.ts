import { Engine } from "./engine.ts";
import { ALL_SIDES, Side } from "./game/common.ts";

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

    handleOpen(side: Side): void {
        this.engine.handle({ side, data: { kind: "playerConnected" } });
    }

    handleChatMessage(side: Side, text: string): void {
        for (const s of ALL_SIDES) {
            const conn = this.conns[s];
            if (conn) {
                const line = s == side ? `${side}(you): ${text}` : `${side}: ${text}`;
                conn.send(JSON.stringify({
                    kind: "chat",
                    data: line,
                }));
            }
        }
    }

    handleMessageInternal(side: Side, obj: { kind?: string; data?: unknown }): void {
        switch (obj.kind) {
            case "chat":
                if (typeof (obj.data) != "string") {
                    console.error(`${side}: bad chat data: ${obj.data}`);
                    return;
                }
                this.handleChatMessage(side, obj.data);
                return;
            default:
                console.error(`${side}: bad message kind: ${obj.kind}`);
                return;
        }
    }

    handleMessage(side: Side, message: string): void {
        let rawObject: unknown = null;
        try {
            rawObject = JSON.parse(message);
        } catch (e) {
            if (e instanceof SyntaxError) {
                console.error(`${side}: failed to parse JSON from message: ${message}`);
                return;
            }
            throw e;
        }

        if (typeof rawObject != "object" || rawObject == null) {
            console.error(`${side}: bad message type: ${message}`);
            return;
        }

        this.handleMessageInternal(side, rawObject);
    }

    handleClose(side: Side): void {
        this.engine.handle({ side, data: { kind: "playerDisconnected" } });
        this.conns[side] = null;
    }

    register(side: Side, sock: WebSocket): void {
        if (this.conns[side]) {
            // socket already registered
            sock.close();
            return;
        }

        sock.addEventListener("open", () => {
            this.handleOpen(side);
        });
        sock.addEventListener("message", (event) => {
            const data: unknown = event.data;
            if (typeof data != "string") {
                console.error(`${side}: bad message type from websocket: ${typeof data}`);
                sock.close();
                return;
            }
            this.handleMessage(side, data);
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
