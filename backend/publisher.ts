import { ServerMessage } from "../shared/protocol.ts";
import { Bid, Card, Deal, Side } from "../shared/types.ts";

import { FinalContract } from "./game/bidding.ts";
import { getAllSides, nextSide } from "./game/utils.ts";

function prettyPrintFinalContract(contract: FinalContract) {
    const level = contract.contract.level;
    const suitSymbol = (() => {
        switch (contract.contract.denom) {
            case "C":
                return "♣";
            case "D":
                return "♦";
            case "H":
                return "♥";
            case "S":
                return "♠";
            case "NT":
                return "NT";
        }
    })();
    const statusSymbol = (() => {
        switch (contract.status) {
            case "FREE":
                return "";
            case "X":
                return "x";
            case "XX":
                return "xx";
        }
    })();
    return `${level}${suitSymbol}${statusSymbol} by ${contract.declarer}`;
}

export interface Publisher {
    // messages
    notify(msg: string, to?: Side | WebSocket): void;
    error(msg: string, to: Side): void;
    fatal(msg: string): void;

    // chat
    chat(side: Side, msg: string): void;

    // game
    bid(side: Side, bid: Bid, gen: number): void;
    contract(contract: FinalContract): void;
    finish(deal: Deal, dealer: Side, lead: [Side, Card] | null): void;
    startplay(dummy: Side, table: Card[]): void;
    playcard(side: Side, card: Card): void;
    trick(winner: Side): void;
}

export type Nickname = string | null; // anonymous if null
export type Client = { conn: WebSocket; nick: Nickname };
export type Clients = Record<Side, { conn: WebSocket; nick: string | null } | null>;

class PublisherImpl implements Publisher {
    clients: Clients;

    constructor(clients: Clients) {
        this.clients = clients;
    }

    unicast(to: Side, msg: ServerMessage): void {
        const client = this.clients[to];
        if (!client) {
            return;
        }
        client.conn.send(JSON.stringify(msg));
    }

    broadcast(message: ServerMessage): void {
        for (const s of getAllSides()) {
            const client = this.clients[s];
            if (client) {
                client.conn.send(JSON.stringify(message));
            }
        }
    }

    chat(side: Side, text: string): void {
        if (text.trim() == "") {
            // do not spam empty messages
            return;
        }

        const nickRepr = (() => {
            const origSender = this.clients[side];
            if (!origSender) {
                throw new Error("Assertion error: got message from non-connected client");
            }
            return origSender.nick ? `(${origSender.nick})` : "";
        })();

        for (const s of getAllSides()) {
            const line = s == side ? `[you]: ${text}` : `${side}${nickRepr}: ${text}`;
            this.unicast(s, { kind: "chat", data: line });
        }
    }

    notify(text: string, to?: Side | WebSocket): void {
        const msg: ServerMessage = { kind: "notify", data: `server: ${text}` };
        if (to) {
            if (typeof to == "string") {
                this.unicast(to, msg);
            } else {
                to.send(JSON.stringify(msg));
            }
        } else {
            this.broadcast(msg);
        }
    }

    error(err: string, to: Side): void {
        const msg: ServerMessage = { kind: "error", data: `server: ${err}` };
        this.unicast(to, msg);
    }

    fatal(err: string): void {
        const msg: ServerMessage = { kind: "error", data: `server fatal error: ${err}` };
        this.broadcast(msg);
    }

    chatmsg(msg: string): string {
        return JSON.stringify({ kind: "chat", data: msg });
    }

    bid(side: Side, bid: Bid, gen: number): void {
        const msg: ServerMessage = {
            kind: "engine",
            data: {
                kind: "bid",
                side,
                bid,
                gen,
            },
        };
        this.broadcast(msg);
    }

    contract(contract: FinalContract): void {
        const msg: ServerMessage = {
            kind: "engine",
            data: {
                kind: "contract",
                contract: prettyPrintFinalContract(contract),
                leader: nextSide(contract.declarer),
            },
        };
        this.broadcast(msg);
    }

    finish(reveal: Deal, dealer: Side, lead: [Side, Card] | null): void {
        const msg: ServerMessage = {
            kind: "engine",
            data: {
                kind: "nextdeal",
                reveal,
                dealer,
                lead,
            },
        };
        this.broadcast(msg);
    }

    startplay(dummy: Side, table: Card[]): void {
        const msg: ServerMessage = {
            kind: "engine",
            data: {
                kind: "startplay",
                dummy,
                table,
            },
        };
        this.broadcast(msg);
    }

    playcard(side: Side, card: Card): void {
        const msg: ServerMessage = {
            kind: "engine",
            data: {
                kind: "playcard",
                side,
                card,
            },
        };
        this.broadcast(msg);
    }

    trick(winner: Side): void {
        const msg: ServerMessage = {
            kind: "engine",
            data: {
                kind: "trick",
                winner,
            },
        };
        this.broadcast(msg);
    }
}

export function createPublisher(
    clients: Record<Side, { conn: WebSocket; nick: string | null } | null>,
): Publisher {
    return new PublisherImpl(clients);
}
