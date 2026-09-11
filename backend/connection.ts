import { Bid, Card, Deal, getPair, nextSide, Side, Vulnerability } from "../shared/types.ts";
import { ClientEngineMessage } from "../shared/protocol.ts";
import { parseClientMessage } from "../shared/parsing.ts";

import { createEngine, Engine, GameEvent } from "./game/engine.ts";
import { FinalContract } from "./game/bidding.ts";
import { DealFilter, noFilter } from "./game/deal_filters.ts";
import { generateHandWithFilter, getRandomSide, getRandomVulnerability } from "./game/random.ts";
import { Clients, createPublisher, Nickname, Publisher } from "./publisher.ts";

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
    clients: Clients;
    game: Game;
    gen: number;
    tweaks: Tweaks;
    publisher: Publisher;

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

    reload(): void {
        this.game = this.createNewGame();
        this.publisher = createPublisher(this.clients);
    }

    constructor(tweaks?: Tweaks) {
        this.clients = { W: null, N: null, E: null, S: null };
        this.gen = 0;
        this.tweaks = tweaks ? tweaks : { biddingOnly: false, nsOnly: false, filter: noFilter() };
        this.game = this.createNewGame();
        this.publisher = createPublisher(this.clients);

        if (this.tweaks.nsOnly) {
            this.passIfOpponents(this.game.dealer);
        }
    }

    passIfOpponents(side: Side): void {
        if (getPair(side) == "WE") {
            setTimeout(() => {
                this.handleEngineBidMessage(side, "PASS");
            }, 1500);
        }
    }

    die(msg: string): never {
        this.publisher.fatal(msg);
        throw new Error(`server fatal error: ${msg}`);
    }

    handleOpen(conn: WebSocket, side: Side): void {
        this.clients[side] = { conn, nick: null };
    }

    handleInitMessage(side: Side, nick: Nickname): void {
        if (!this.clients[side]) {
            this.die(`AssertionError: got init message from non-connected client: ${side}:${nick}`);
        }
        this.clients[side].nick = nick;

        const game = this.game;
        this.publisher.init(side, extractBidHistory(game), game.deal[side], game.vuln, this.gen);
    }

    handleEngineBidMessage(side: Side, bid: Bid): void {
        const response = this.game.engine.handle({
            side,
            data: {
                kind: "bid",
                bid,
            },
        });

        switch (response.kind) {
            case "err":
                this.publisher.notify(`engine: ${response.err}`, side);
                break;

            case "ok": {
                for (const event of response.events) {
                    ++this.gen;
                    switch (event.kind) {
                        case "BidMade":
                            this.publisher.bid(event.side, event.bid, this.gen);
                            if (this.tweaks.nsOnly) {
                                this.passIfOpponents(nextSide(side));
                            }
                            break;

                        case "PassOut":
                            this.publisher.notify("passout, for next deal click the button");
                            this.publisher.finish(this.game.deal, this.game.dealer, null);

                            // passout finishes the game, reset the state
                            this.reload();
                            if (this.tweaks.nsOnly) {
                                this.passIfOpponents(this.game.dealer);
                            }
                            break;

                        case "ContractReached":
                            this.publisher.contract(event.contract);
                            if (this.tweaks.biddingOnly) {
                                // finish the game if bidding only
                                this.publisher.finish(this.game.deal, this.game.dealer, null);
                                this.reload();
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
            }
        }
    }

    handleEngineCardPlay(side: Side, card: Card): void {
        const response = this.game.engine.handle({
            side,
            data: {
                kind: "cardplay",
                card,
            },
        });

        switch (response.kind) {
            case "err":
                this.publisher.notify(`engine: ${response.err}`, side);
                break;

            case "ok": {
                for (const event of response.events) {
                    switch (event.kind) {
                        case "CardPlayed":
                            this.publisher.playcard(event.side, event.card);
                            break;
                        case "DummyRevealed": {
                            this.publisher.startplay(event.side, event.hand);
                            break;
                        }
                        case "TrickCompleted": {
                            this.publisher.trick(event.winner);
                            break;
                        }
                        case "DealFinished":
                            this.publisher.finish(
                                this.game.deal,
                                this.game.dealer,
                                this.game.oplead,
                            );
                            this.reload();
                            break;
                        default:
                            this.die(`AssertionError: impossible cardplay response ${event}`);
                    }
                    this.game.events.push(event);
                }
                break;
            }
        }
    }

    handleEngineMessage(
        side: Side,
        data: ClientEngineMessage,
    ): void {
        switch (data.kind) {
            case "bid":
                this.handleEngineBidMessage(side, data.bid);
                break;
            case "cardplay":
                this.handleEngineCardPlay(side, data.card);
                break;
            case "init": {
                const nick = (typeof data.nickname == "string" && data.nickname)
                    ? data.nickname
                    : null;
                this.handleInitMessage(side, nick);
                break;
            }
        }
    }

    handleChatMessage(side: Side, message: string): void {
        this.publisher.chat(side, message);
    }

    handleMessage(side: Side, data: unknown): void {
        const input = parseClientMessage(data);
        if (typeof input == "string") {
            this.publisher.error(input, side);
            return;
        }

        switch (input.kind) {
            case "chat":
                this.handleChatMessage(side, input.data);
                return;
            case "engine":
                this.handleEngineMessage(side, input.data);
                return;
        }
    }

    handleClose(side: Side): void {
        this.clients[side] = null;
    }

    register(side: Side, sock: WebSocket): void {
        if (this.clients[side]) {
            // warn the connected user
            this.publisher.notify("someone tried to reuse your invite link", side);
            // reject the new connection outside of the current event handling
            setTimeout(() => {
                this.publisher.notify("this invite link is already used, abort", sock);
                sock.close();
            });
            return;
        }

        sock.addEventListener("open", () => {
            this.handleOpen(sock, side);
        });
        sock.addEventListener("message", (event) => {
            this.handleMessage(side, event.data);
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
function extractBidHistory(game: Game): [Side, Bid[]] {
    const bids: Bid[] = [];
    for (const event of game.events) {
        if (event.kind == "BidMade") {
            bids.push(event.bid);
        }
    }
    return [game.dealer, bids];
}
