import { assertObjectMatch } from "@std/assert/object-match";

import { Side } from "../../shared/types.ts";
import { ConnectionManager, createConnectionManager } from "../connection.ts";

class WebSocketConnectionHarness {
    private server: Deno.HttpServer | null = null;
    private conns: Set<WebSocket> | null = null;
    private port: number = 9000;
    private mgr: ConnectionManager | null = null;

    setup(): void {
        this.mgr = createConnectionManager();
        this.conns = new Set<WebSocket>();
        this.server = Deno.serve({ hostname: "localhost", port: this.port }, (req) => {
            const side: Side = (() => {
                const url = new URL(req.url);
                switch (url.pathname) {
                    case "/N":
                        return "N";
                    case "/E":
                        return "E";
                    case "/S":
                        return "S";
                    case "/W":
                        return "W";
                    default:
                        throw new Error(`AssertionError: ${url}`);
                }
            })();
            const { socket, response } = Deno.upgradeWebSocket(req);
            this.conns?.add(socket);
            this.mgr?.register(side, socket);
            return response;
        });
    }

    async teardown() {
        if (this.conns) {
            for (const conn of this.conns) {
                conn.close();
            }
            this.conns = null;
        }
        if (this.server) {
            await this.server.shutdown();
            this.server = null;
        }
        this.mgr = null;
    }

    private waitForConnection(sock: WebSocket, timeout = 5000) {
        return new Promise<WebSocket>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error("failed to connect due to timeout"));
            }, timeout);
            sock.onopen = () => {
                clearTimeout(timer);
                resolve(sock);
            };
            sock.onerror = (error) => {
                clearTimeout(timer);
                reject(error);
            };
        });
    }

    connectToSide(side: Side): Promise<WebSocket> {
        const sock = new WebSocket(`ws://localhost:${this.port}/${side}`);
        return this.waitForConnection(sock);
    }

    waitForMessage(sock: WebSocket, timeout = 5000) {
        return new Promise<object>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error("message timeout"));
            }, timeout);
            sock.onmessage = (event) => {
                clearTimeout(timer);
                if (typeof event.data == "string") {
                    const res = JSON.parse(event.data);
                    if (typeof res == "object") {
                        sock.onmessage = null;
                        resolve(res);
                    } else {
                        reject(new Error("bad response type"));
                    }
                } else {
                    reject(new Error("bad websocket content"));
                }
            };
        });
    }

    sendMessage(sock: WebSocket, message: object) {
        sock.send(JSON.stringify(message));
    }
}

const harness = new WebSocketConnectionHarness();

Deno.test.beforeEach(() => {
    harness.setup();
});

Deno.test.afterEach(async () => {
    await harness.teardown();
});

Deno.test("self-chat", async () => {
    const client = await harness.connectToSide("S");
    harness.sendMessage(client, { kind: "chat", data: "hello" });
    const response = await harness.waitForMessage(client);
    assertObjectMatch(response, {
        kind: "chat",
        data: "[you]: hello",
    });
});

Deno.test("anonymous chat", async () => {
    const sClient = await harness.connectToSide("S");
    const nClient = await harness.connectToSide("N");

    harness.sendMessage(sClient, { kind: "chat", data: "hello" });
    const sResponse1 = harness.waitForMessage(sClient);
    const nResponse1 = harness.waitForMessage(nClient);
    assertObjectMatch(await sResponse1, {
        kind: "chat",
        data: "[you]: hello",
    });
    assertObjectMatch(await nResponse1, {
        kind: "chat",
        data: "S: hello",
    });

    harness.sendMessage(nClient, { kind: "chat", data: "world" });
    const sResponse2 = harness.waitForMessage(sClient);
    const nResponse2 = harness.waitForMessage(nClient);
    assertObjectMatch(await sResponse2, {
        kind: "chat",
        data: "N: world",
    });
    assertObjectMatch(await nResponse2, {
        kind: "chat",
        data: "[you]: world",
    });
});

Deno.test("init connection", async () => {
    const sClient = await harness.connectToSide("S");

    harness.sendMessage(sClient, { kind: "engine", data: { kind: "init" } });
    const sInitResponse = await harness.waitForMessage(sClient);
    assertObjectMatch(sInitResponse, {
        kind: "engine",
        data: {
            kind: "init",
            side: "S",
            bidHistory: [],
            hand: [],
            gen: 0,
        },
    });
});
