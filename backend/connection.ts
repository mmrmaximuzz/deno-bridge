// SPDX-License-Identifier: GPL-3.0-or-later
import { Bid, Card, Deal, getPair, nextSide, Side, Vulnerability } from "../shared/types.ts";
import { ClientEngineMessage } from "../shared/protocol.ts";
import { parseClientMessage } from "../shared/parsing.ts";

import { createEngine, Engine, GameEvent } from "./game/engine.ts";
import { FinalContract } from "./game/bidding.ts";
import { DealFilter, noFilter } from "./game/deal_filters.ts";
import { generateHandWithFilter } from "./game/random.ts";
import { Clients, createPublisher, Nickname, Publisher } from "./publisher.ts";
import { canonicalBoardParams } from "./game/boards.ts";
import { scoreContract } from "./game/scoring.ts";

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
    tweaks: Tweaks;
    publisher: Publisher;
    boardNum: number;

    createNewGame(): Game {
        const deal = generateHandWithFilter(this.tweaks.filter);
        const [dealer, vuln] = canonicalBoardParams(this.boardNum);
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

    nextGame(): void {
        this.boardNum++;
        this.game = this.createNewGame();
        this.publisher = createPublisher(this.clients);
    }

    constructor(tweaks?: Tweaks) {
        this.clients = { W: null, N: null, E: null, S: null };
        this.tweaks = tweaks ? tweaks : { biddingOnly: false, nsOnly: false, filter: noFilter() };
        this.boardNum = 1;
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

    handleInitMessage(conn: WebSocket, side: Side, nick: Nickname): void {
        let fresh = false;
        if (!this.clients[side]) {
            this.clients[side] = { conn, nick };
            fresh = true;
        }

        const game = this.game;
        this.publisher.init(
            side,
            this.boardNum,
            extractBidHistory(game),
            game.deal[side],
            game.vuln,
        );

        if (fresh) {
            // notify only really fresh connections
            this.publisher.connected(side, nick);
        }
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
                    switch (event.kind) {
                        case "BidMade":
                            this.publisher.bid(event.side, event.bid);
                            if (this.tweaks.nsOnly) {
                                this.passIfOpponents(nextSide(side));
                            }
                            break;

                        case "PassOut":
                            this.publisher.finish(
                                this.game.deal,
                                0, // passouts are zero points
                                this.game.dealer,
                                null,
                            );

                            // passout finishes the game, reset the state
                            this.nextGame();
                            if (this.tweaks.nsOnly) {
                                this.passIfOpponents(this.game.dealer);
                            }
                            break;
                        case "ContractReached":
                            this.publisher.contract(event.contract);
                            if (this.tweaks.biddingOnly) {
                                // finish the game if bidding only
                                const nsResult = 0; // if bidding only, no score applied
                                this.publisher.finish(
                                    this.game.deal,
                                    nsResult,
                                    this.game.dealer,
                                    null,
                                );
                                this.nextGame();
                                if (this.tweaks.nsOnly) {
                                    this.passIfOpponents(this.game.dealer);
                                }
                            }
                            this.game.contract = event.contract;
                            break;

                        default:
                            return this.die(`AssertionError: impossible bid response ${event}`);
                    }
                    this.game.events.push(event);
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
                        case "DummyRevealed":
                            this.publisher.startplay(event.side, event.hand);
                            break;
                        case "TrickCompleted":
                            this.publisher.trick(event.winner);
                            break;
                        case "DealFinished": {
                            const [mult, tricks] = (() => {
                                switch (getPair(this.game.dealer)) {
                                    case "NS":
                                        return [+1, event.tricksNS];
                                    case "WE":
                                        return [-1, event.tricksWE];
                                }
                            })();
                            const contract = this.game.contract;
                            if (!contract) {
                                this.die("unreachable: deal finished when no contract");
                            }
                            const vulnerability = this.game.vuln;
                            const nsScore = mult * scoreContract(contract, vulnerability, tricks);
                            console.log(contract, vulnerability, tricks, nsScore); // TODO: remove after debug
                            this.publisher.finish(
                                this.game.deal,
                                nsScore,
                                this.game.dealer,
                                this.game.oplead,
                            );
                            this.nextGame();
                            break;
                        }
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
        conn: WebSocket,
        side: Side,
        data: ClientEngineMessage,
    ): void {
        switch (data.kind) {
            case "bid":
                if (!this.clients[side]) {
                    this.publisher.error("cannot play before 'init' is completed", conn);
                    return;
                }
                this.handleEngineBidMessage(side, data.bid);
                break;
            case "cardplay":
                if (!this.clients[side]) {
                    this.publisher.error("cannot play before 'init' is completed", conn);
                    return;
                }
                this.handleEngineCardPlay(side, data.card);
                break;
            case "init": {
                this.handleInitMessage(conn, side, data.nickname);
                break;
            }
        }
    }

    handleChatMessage(side: Side, message: string): void {
        this.publisher.chat(side, message);
    }

    handleMessage(conn: WebSocket, side: Side, data: unknown): void {
        const input = parseClientMessage(data);
        if (typeof input == "string") {
            this.publisher.error(input, side);
            return;
        }

        switch (input.kind) {
            case "chat":
                if (!this.clients[side]) {
                    this.publisher.error("cannot chat before 'init' is completed", conn);
                    return;
                }
                this.handleChatMessage(side, input.data);
                return;
            case "engine":
                this.handleEngineMessage(conn, side, input.data);
                return;
        }
    }

    handleClose(side: Side): void {
        this.clients[side] = null;
        this.publisher.disconnected(side);
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

        sock.addEventListener("open", () => {});
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
function extractBidHistory(game: Game): [Side, Bid[]] {
    const bids: Bid[] = [];
    for (const event of game.events) {
        if (event.kind == "BidMade") {
            bids.push(event.bid);
        }
    }
    return [game.dealer, bids];
}
