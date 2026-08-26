import { createEngine, Engine, EngineFactory, EngineFullState } from "./game/engine.ts";
import { Bid, Card, Side } from "./game/types.ts";
import { getAllSides, getPair, nextSide } from "./game/utils.ts";
import { parseBid, parseCard } from "./parsing.ts";
import { FinalContract, prettyPrintFinalContract } from "./game/bidding.ts";
import { DealFilter, noFilter } from "./game/deal_filters.ts";
import { generateHandWithFilter, getRandomSide, getRandomVulnerability } from "./game/random.ts";

type Nickname = string | null; // anonymous if null
type Client = { conn: WebSocket; nick: Nickname };

export interface ConnectionManager {
    register(side: Side, sock: WebSocket): void;
}

export type Tweaks = {
    filter: DealFilter;
    biddingOnly: boolean;
};

class ConnectionManagerImpl implements ConnectionManager {
    clients: Record<Side, Client | null>;
    engine: Engine;
    factory: EngineFactory;
    gen: number;
    tweaks: Tweaks;

    createNewEngine(): Engine {
        const dealer = getRandomSide();
        const vuln = getRandomVulnerability();
        const deal = generateHandWithFilter(this.tweaks.filter);
        return createEngine(deal, dealer, vuln);
    }

    constructor(engineFactory: EngineFactory, tweaks?: Tweaks) {
        this.clients = { W: null, N: null, E: null, S: null };
        this.factory = engineFactory;
        this.gen = 0;
        this.tweaks = tweaks ? tweaks : { biddingOnly: false, filter: noFilter() };
        this.engine = this.createNewEngine();

        if (this.tweaks.biddingOnly) {
            this.passIfOpponents(this.engine.getFullState().dealer);
        }
    }

    passIfOpponents(side: Side) {
        if (getPair(side) == "WE") {
            setTimeout(() => {
                this.handleEngineBidMessage(null, side, "PASS");
            }, 1500);
        }
    }

    die(msg: string): never {
        this.broadcastErrorMessage(msg);
        throw new Error(msg);
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
                        vuln: state.vuln,
                    },
                    gen,
                },
            });
        } else {
            return this.die("not implemented");
        }
    }

    reportError(err: string, conn?: WebSocket): boolean {
        console.error(err);
        conn?.send(this.createError(err));
        return false;
    }

    handleOpen(conn: WebSocket, side: Side): void {
        this.clients[side] = { conn, nick: null };
    }

    broadcastChatMessage(side: Side, text: string): void {
        if (text.trim() == "") {
            // do not spam empty messages
            return;
        }

        const nickRepr = (() => {
            const origSender = this.clients[side];
            if (!origSender) {
                return this.die("Assertion error: got message from non-connected client");
            }
            return origSender.nick ? `(${origSender.nick})` : "";
        })();

        for (const s of getAllSides()) {
            const client = this.clients[s];
            if (client) {
                const line = s == side ? `[you]: ${text}` : `${side}${nickRepr}: ${text}`;
                client.conn.send(JSON.stringify({
                    kind: "chat",
                    data: line,
                }));
            }
        }
    }

    broadcast(kind: string, message: unknown): void {
        for (const s of getAllSides()) {
            const client = this.clients[s];
            if (client) {
                client.conn.send(JSON.stringify({
                    kind,
                    data: message,
                }));
            }
        }
    }

    broadcastNotificationMessage(notification: string): void {
        this.broadcast("notify", `server: ${notification}`);
    }

    broadcastErrorMessage(notification: string): void {
        this.broadcast("error", `server error: ${notification}`);
    }

    broadcastBidMessage(side: Side, bid: Bid): void {
        this.broadcast("engine", {
            kind: "bid",
            side,
            bid,
            gen: this.gen,
        });
    }

    broadcastContract(contract: FinalContract): void {
        this.broadcast("engine", {
            kind: "contract",
            contract: prettyPrintFinalContract(contract),
            leader: nextSide(contract.declarer),
        });
    }

    broadcastNextDealMessage(state: EngineFullState): void {
        this.broadcast("engine", {
            kind: "nextdeal",
            reveal: state.deal,
            dealer: state.dealer,
            lead: state.lead,
        });
    }

    broadcastStartPlay(lead: Card, dummy: Side, table: Card[]) {
        this.broadcast("engine", {
            kind: "startplay",
            lead,
            dummy,
            table,
        });
    }

    broadcastPlayCard(side: Side, card: Card) {
        this.broadcast("engine", {
            kind: "playcard",
            side,
            card,
        });
    }

    broadcastTrick(side: Side, card: Card, winner: Side) {
        this.broadcast("engine", {
            kind: "trick",
            side,
            card,
            winner,
        });
    }

    handleInitMessage(conn: WebSocket, side: Side, nick: Nickname): boolean {
        if (!this.clients[side]) {
            throw new Error("AssertionError: got init message from non-connected client");
        }
        this.clients[side].nick = nick;
        conn.send(this.createInit(side, this.engine.getFullState(), this.gen));
        return true;
    }

    handleEngineBidMessage(conn: WebSocket | null, side: Side, data: unknown): boolean {
        const bid = parseBid(data);
        if (!bid) {
            if (conn) {
                return this.reportError(`failed to parse bid data: ${JSON.stringify(data)}`, conn);
            } else throw new Error("AssertionError: failed to make internal bid");
        }

        const response = this.engine.handle({
            side,
            data: {
                kind: "bid",
                bid,
            },
        });

        switch (response.kind) {
            case "ok":
                ++this.gen;
                this.broadcastBidMessage(side, bid);
                if (this.tweaks.biddingOnly) {
                    this.passIfOpponents(nextSide(side));
                }
                return true;
            case "passout":
                // send the last bid first
                ++this.gen;
                this.broadcastBidMessage(side, bid);

                // notify clients
                this.broadcastNotificationMessage("passout, for next deal click the button");
                this.broadcastNextDealMessage(this.engine.getFullState());

                // passout finishes the game, reset the state
                this.engine = this.createNewEngine();
                if (this.tweaks.biddingOnly) {
                    this.passIfOpponents(this.engine.getFullState().dealer);
                }
                return true;
            case "attack":
                // send the last bid
                ++this.gen;
                this.broadcastBidMessage(side, bid);

                // notify clients
                this.broadcastContract(response.contract);

                if (this.tweaks.biddingOnly) {
                    // finish the game if only bidding
                    this.broadcastNextDealMessage(this.engine.getFullState());
                    this.engine = this.createNewEngine();
                    this.passIfOpponents(this.engine.getFullState().dealer);
                }
                return true;
            case "err":
                if (!conn) {
                    console.error(response.err);
                    throw new Error("AssertionError: self bid has wrong type");
                }
                conn.send(this.createNotification(`engine: ${response.err}`));
                return true;
            case "playcard":
            case "startplay":
            case "trick":
            case "done":
                return this.die("AssertionError: impossible reponse for bid");
        }
    }

    handleEngineCardPlay(conn: WebSocket, side: Side, rawCard: unknown): boolean {
        const card = parseCard(rawCard);
        if (!card) {
            return this.reportError(`${side}: bad card: ${JSON.stringify(rawCard)}`, conn);
        }

        const response = this.engine.handle({
            side,
            data: {
                kind: "cardplay",
                card,
            },
        });

        switch (response.kind) {
            case "ok":
            case "attack":
            case "passout":
                return this.die(`AssertionError: impossible engine transition: ${response.kind}`);
            case "err":
                conn.send(this.createNotification(`engine: ${response.err}`));
                return true;
            case "startplay":
                this.broadcastStartPlay(response.lead, response.dummy, response.table);
                return true;
            case "playcard":
                this.broadcastPlayCard(response.side, response.card);
                return true;
            case "trick":
                this.broadcastTrick(response.side, response.card, response.winner);
                return true;
            case "done":
                this.broadcastTrick(response.side, response.card, response.winner);
                this.broadcastNextDealMessage(this.engine.getFullState());
                this.engine = this.createNewEngine();
                return true;
        }
    }

    handleEngineMessage(
        conn: WebSocket,
        side: Side,
        data: { kind?: unknown; bid?: unknown; nickname?: unknown; card?: unknown },
    ): boolean {
        switch (data.kind) {
            case "bid":
                return this.handleEngineBidMessage(conn, side, data.bid);
            case "cardplay":
                return this.handleEngineCardPlay(conn, side, data.card);
            case "init": {
                const nick = (typeof data.nickname == "string" && data.nickname)
                    ? data.nickname
                    : null;
                return this.handleInitMessage(conn, side, nick);
            }
            default:
                return this.reportError(`${side}: bad engine message kind: ${data.kind}`, conn);
        }
    }
    handleMessageInternal(
        conn: WebSocket,
        side: Side,
        obj: { kind?: string; data?: unknown },
    ): boolean {
        switch (obj.kind) {
            case "chat":
                if (typeof obj.data != "string") {
                    return this.reportError(`${side}: bad chat data: ${obj.data}`, conn);
                }
                this.broadcastChatMessage(side, obj.data);
                return true;
            case "engine":
                if (typeof obj.data != "object" || obj.data == null) {
                    return this.reportError(`${side}: bad engine data: ${obj.data}`, conn);
                }
                return this.handleEngineMessage(conn, side, obj.data);
            default:
                return this.reportError(`${side}: bad message kind: ${obj.kind}`, conn);
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

        const res = this.handleMessageInternal(conn, side, rawObject);
        if (!res) {
            console.warn(`failed to process message: ${JSON.stringify(data)}`);
        }
    }

    handleClose(side: Side): void {
        this.clients[side] = null;
    }

    register(side: Side, sock: WebSocket): void {
        if (this.clients[side]) {
            // warn the connected user
            this.clients[side].conn.send(
                this.createNotification("someone tried to reuse your invite link"),
            );
            // reject the new connection outside of the current event handling
            setTimeout(() => {
                sock.send(this.createNotification("this invite link is already used, abort"));
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

export function createConnectionManager(
    engineFactory: EngineFactory,
    tweaks?: Tweaks,
): ConnectionManager {
    return new ConnectionManagerImpl(engineFactory, tweaks);
}
