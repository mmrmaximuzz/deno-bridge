import { createEngine, Engine, GameEvent } from "./game/engine.ts";
import { Bid, Card, Deal, Side, Vulnerability } from "./game/types.ts";
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
    nsOnly: boolean;
};

type Game = {
    deal: Deal;
    dealer: Side;
    vuln: Vulnerability;
    engine: Engine;
    events: GameEvent[];
    oplead: [Side, Card] | null;
    contract: FinalContract | null;
};

class ConnectionManagerImpl implements ConnectionManager {
    clients: Record<Side, Client | null>;
    game: Game;
    gen: number;
    tweaks: Tweaks;

    createNewGame(): Game {
        const dealer = getRandomSide();
        const vuln = getRandomVulnerability();
        const deal = generateHandWithFilter(this.tweaks.filter);
        const engine = createEngine(deal, dealer, vuln);
        return {
            deal,
            dealer,
            vuln,
            engine,
            events: [],
            oplead: null,
            contract: null,
        };
    }

    constructor(tweaks?: Tweaks) {
        this.clients = { W: null, N: null, E: null, S: null };
        this.gen = 0;
        this.tweaks = tweaks ? tweaks : { biddingOnly: false, nsOnly: false, filter: noFilter() };
        this.game = this.createNewGame();

        if (this.tweaks.nsOnly) {
            this.passIfOpponents(this.game.dealer);
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

    createInit(side: Side, gen: number): string {
        const game = this.game;

        if (auctionFinished(game)) {
            this.die("not implemented");
        }

        return JSON.stringify({
            kind: "init",
            data: {
                side,
                state: {
                    phase: "auction",
                    bidHistory: extractBidHistory(game),
                    deal: game.deal[side],
                    vuln: game.vuln,
                },
                gen,
            },
        });
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

    broadcastDealFinished(oldgame: Game, lead: [Side, Card] | null): void {
        this.broadcast("engine", {
            kind: "nextdeal",
            reveal: oldgame.deal,
            dealer: oldgame.dealer,
            lead,
        });
    }

    broadcastStartPlay(dummy: Side, table: Card[]) {
        this.broadcast("engine", {
            kind: "startplay",
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

    broadcastTrick(winner: Side) {
        this.broadcast("engine", {
            kind: "trick",
            winner,
        });
    }

    handleInitMessage(conn: WebSocket, side: Side, nick: Nickname): boolean {
        if (!this.clients[side]) {
            this.die(`AssertionError: got init message from non-connected client: ${side}:${nick}`);
        }
        this.clients[side].nick = nick;
        conn.send(this.createInit(side, this.gen));
        return true;
    }

    handleEngineBidMessage(conn: WebSocket | null, side: Side, data: unknown): boolean {
        const bid = parseBid(data);
        if (!bid) {
            if (conn) {
                return this.reportError(`failed to parse bid data: ${JSON.stringify(data)}`, conn);
            } else throw new Error("AssertionError: failed to make internal bid");
        }

        const response = this.game.engine.handle({
            side,
            data: {
                kind: "bid",
                bid,
            },
        });

        switch (response.kind) {
            case "err":
                if (!conn) {
                    console.error(response.err);
                    throw new Error("AssertionError: error happened on internal bid message");
                }
                conn.send(this.createNotification(`engine: ${response.err}`));
                return true;

            case "ok": {
                for (const event of response.events) {
                    ++this.gen;
                    switch (event.kind) {
                        case "BidMade":
                            this.broadcastBidMessage(event.side, event.bid);
                            if (this.tweaks.nsOnly) {
                                this.passIfOpponents(nextSide(side));
                            }
                            break;

                        case "PassOut":
                            this.broadcastNotificationMessage(
                                "passout, for next deal click the button",
                            );
                            this.broadcastDealFinished(this.game, null);

                            // passout finishes the game, reset the state
                            this.game = this.createNewGame();
                            if (this.tweaks.nsOnly) {
                                this.passIfOpponents(this.game.dealer);
                            }
                            break;

                        case "ContractReached":
                            this.broadcastContract(event.contract);
                            if (this.tweaks.biddingOnly) {
                                // finish the game if bidding
                                this.broadcastDealFinished(this.game, null);
                                this.game = this.createNewGame();
                                if (this.tweaks.nsOnly) {
                                    this.passIfOpponents(this.game.dealer);
                                }
                            }
                            this.game.contract = event.contract;
                            break;

                        default:
                            return this.die(`AssertionError: impossible bid response ${event}`);
                    }
                }
                return true;
            }
        }
    }

    handleEngineCardPlay(conn: WebSocket, side: Side, rawCard: unknown): boolean {
        const card = parseCard(rawCard);
        if (!card) {
            return this.reportError(`${side}: bad card: ${JSON.stringify(rawCard)}`, conn);
        }

        const response = this.game.engine.handle({
            side,
            data: {
                kind: "cardplay",
                card,
            },
        });

        switch (response.kind) {
            case "err":
                conn.send(this.createNotification(`engine: ${response.err}`));
                return true;

            case "ok": {
                for (const event of response.events) {
                    switch (event.kind) {
                        case "CardPlayed":
                            this.broadcastPlayCard(event.side, event.card);
                            break;
                        case "DummyRevealed": {
                            this.broadcastStartPlay(event.side, event.hand);
                            return true;
                        }
                        case "TrickCompleted": {
                            this.broadcastTrick(event.winner);
                            break;
                        }
                        case "DealFinished":
                            this.broadcastDealFinished(this.game, this.game.oplead);
                            this.game = this.createNewGame();
                            break;
                        default:
                            this.die(`AssertionError: impossible cardplay response ${event}`);
                    }
                    this.game.events.push(event);
                }
                return true;
            }
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
            console.warn(`handleMessage: failed to process message: ${JSON.stringify(data)}`);
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

export function createConnectionManager(tweaks?: Tweaks): ConnectionManager {
    return new ConnectionManagerImpl(tweaks);
}

// FIXME: compatibility with old connection code
function auctionFinished(game: Game) {
    for (const event of game.events) {
        if (event.kind == "CardPlayed" || event.kind == "PassOut") {
            return true;
        }
    }
    return false;
}

function extractBidHistory(game: Game) {
    const bids: Bid[] = [];
    for (const event of game.events) {
        if (event.kind == "BidMade") {
            bids.push(event.bid);
        }
    }
    return [game.dealer, bids];
}
