import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { assertObjectMatch } from "@std/assert/object-match";
import { AssertionError } from "@std/assert/assertion-error";

import { getAllSides, Side } from "../../shared/types.ts";
import { ClientMessage, ServerMessage } from "../../shared/protocol.ts";
import { parseServerMessage } from "../../shared/parsing.ts";

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
        return new Promise<ServerMessage>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error("message timeout"));
            }, timeout);
            sock.onmessage = (event) => {
                clearTimeout(timer);
                if (typeof event.data == "string") {
                    const res = parseServerMessage(event.data);
                    if (typeof res == "object") {
                        sock.onmessage = null;
                        resolve(res);
                    } else {
                        reject(new Error(`failed to parse: ${res}`));
                    }
                } else {
                    reject(new Error("bad websocket content"));
                }
            };
        });
    }

    sendMessage(sock: WebSocket, message: ClientMessage) {
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

    harness.sendMessage(sClient, { kind: "engine", data: { kind: "init", nickname: null } });
    const sInitResponse = await harness.waitForMessage(sClient);

    assert(sInitResponse instanceof Object);
    assert(sInitResponse.kind == "engine" && sInitResponse.data.kind == "init");
    assertEquals(sInitResponse.data.side, "S", "side must match");
    assertEquals(sInitResponse.data.hand.length, 13, "hand must be 13 cards");
    assertEquals(sInitResponse.data.gen, 0, "empty gen must be 0");
    assertEquals(sInitResponse.data.bidHistory[1], [], "no bidding history yet");
});

Deno.test("chat with nick", async () => {
    const [s, n] = await Promise.all([harness.connectToSide("S"), harness.connectToSide("N")]);
    harness.sendMessage(s, { kind: "engine", data: { kind: "init", nickname: "deadbeef" } });
    await harness.waitForMessage(s); // ignore response

    harness.sendMessage(s, { kind: "chat", data: "coolmsg" });
    const nMessage = await harness.waitForMessage(n);
    assert(nMessage instanceof Object);
    assert(nMessage.kind == "chat");
    assertEquals(nMessage.data, "S(deadbeef): coolmsg");
});

Deno.test("simple bid", async () => {
    const [w, n, e, s] = await Promise.all([
        harness.connectToSide("W"),
        harness.connectToSide("N"),
        harness.connectToSide("E"),
        harness.connectToSide("S"),
    ]);
    const clients: Record<Side, WebSocket> = {
        "W": w,
        "N": n,
        "E": e,
        "S": s,
    };

    const inits = [];
    for (const side of getAllSides()) {
        harness.sendMessage(clients[side], {
            kind: "engine",
            data: { kind: "init", nickname: side },
        });
        inits.push(harness.waitForMessage(clients[side]));
    }

    // collect init responses
    const initResponses = await (async () => {
        const [w, n, e, s] = await Promise.all(inits);
        const res: Record<Side, ServerMessage> = {
            "W": w,
            "N": n,
            "E": e,
            "S": s,
        };
        return res;
    })();

    // find the dealer
    let dealerSide: Side | null = null;
    for (const side of getAllSides()) {
        if (initResponses[side].kind == "engine" && initResponses[side].data.kind == "init") {
            const dealer = initResponses[side].data.bidHistory[0];
            if (dealer == side) {
                dealerSide = side;
                break;
            }
        } else {
            throw new AssertionError("bad response");
        }
    }
    assert(dealerSide !== null);

    // make the bid
    harness.sendMessage(clients[dealerSide], {
        kind: "engine",
        data: { kind: "bid", bid: { level: 7, denom: "NT" } },
    });

    for (
        const bidResp of await Promise.all([
            harness.waitForMessage(clients["W"]),
            harness.waitForMessage(clients["N"]),
            harness.waitForMessage(clients["E"]),
            harness.waitForMessage(clients["S"]),
        ])
    ) {
        assert(bidResp.kind == "engine" && bidResp.data.kind == "bid");
        assertEquals(bidResp.data.side, dealerSide);
        assert(typeof bidResp.data.bid == "object");
        assertObjectMatch(bidResp.data.bid, {
            level: 7,
            denom: "NT",
        });
    }
});
