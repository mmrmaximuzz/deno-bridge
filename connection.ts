import { Engine } from "./engine.ts";
import { Side } from "./game/common.ts";

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

    handleMessage(side: Side, message: string): void {
        console.log(`${side}: ${message}`);
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
            if (typeof data == "string") {
                this.handleMessage(side, data);
            } else {
                // handle error
                console.log(data);
            }
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
