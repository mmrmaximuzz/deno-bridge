import { ClientEngineMessage, ClientMessage, ServerMessage } from "./protocol.ts";
import { Bid, Card, Deal, Denomination, Level, Rank, Side, Suit, Vulnerability } from "./types.ts";

export function parseSide(rawSide: unknown): Side | null {
    switch (rawSide) {
        case "W":
        case "N":
        case "E":
        case "S":
            return rawSide;
        default:
            return null;
    }
}

export function parseLevel(rawLevel: unknown): Level | null {
    switch (rawLevel) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
            return rawLevel;
        default:
            return null;
    }
}

export function parseDenomination(rawDenom: unknown): Denomination | null {
    switch (rawDenom) {
        case "C":
        case "D":
        case "H":
        case "S":
        case "NT":
            return rawDenom;
        default:
            return null;
    }
}

export function parseBid(rawBid: unknown): Bid | null {
    switch (rawBid) {
        case "PASS":
        case "X":
        case "XX":
            return rawBid;
        default:
            if (typeof rawBid != "object" || !rawBid || !("level" in rawBid && "denom" in rawBid)) {
                return null;
            } else {
                const level = parseLevel(rawBid.level);
                const denom = parseDenomination(rawBid.denom);
                if (level == null || denom == null) {
                    return null;
                }
                return { level, denom };
            }
    }
}

export function parseSuit(rawSuit: unknown): Suit | null {
    switch (rawSuit) {
        case "S":
        case "H":
        case "D":
        case "C":
            return rawSuit;
        default:
            return null;
    }
}

export function parseRank(rawRank: unknown): Rank | null {
    switch (rawRank) {
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
        case 8:
        case 9:
        case 10:
        case 11:
        case 12:
        case 13:
        case 14:
            return rawRank;
        default:
            return null;
    }
}

export function parseCard(rawCard: unknown): Card | null {
    if (!(rawCard instanceof Array) || rawCard.length != 2) {
        return null;
    }
    const [suit, rank] = [parseSuit(rawCard[0]), parseRank(rawCard[1])];
    if (!suit || !rank) {
        return null;
    }
    return [suit, rank];
}

export function parseVulnerability(rawVuln: unknown): Vulnerability | null {
    switch (rawVuln) {
        case "NONE":
        case "NS":
        case "WE":
        case "BOTH":
            return rawVuln;
        default:
            return null;
    }
}

export function parseBids(rawBids: unknown): Bid[] | null {
    const result: Bid[] = [];

    if (!(rawBids instanceof Array)) {
        return null;
    }
    for (const rawItem of rawBids) {
        const bid = parseBid(rawItem);
        if (!bid) {
            return null;
        }
        result.push(bid);
    }
    return result;
}

export function parseHand(rawHand: unknown): Card[] | null {
    if (!(rawHand instanceof Array)) {
        return null;
    }

    const result: Card[] = [];
    for (const rawItem of rawHand) {
        const card = parseCard(rawItem);
        if (!card) {
            return null;
        }
        result.push(card);
    }
    return result.sort((a, b) => {
        if (a[0] > b[0]) {
            return 1;
        }
        if (a[0] < b[0]) {
            return -1;
        }
        if (a[1] > b[1]) {
            return 1;
        }
        if (a[1] < b[1]) {
            return -1;
        }
        return 0;
    }).reverse();
}

export function parseFullDeal(rawDeal: unknown): Deal | null {
    if (
        !rawDeal || typeof rawDeal != "object" || !("W" in rawDeal) || !("N" in rawDeal) ||
        !("E" in rawDeal) || !("S" in rawDeal)
    ) {
        return null;
    }
    const W = parseHand(rawDeal.W);
    const N = parseHand(rawDeal.N);
    const E = parseHand(rawDeal.E);
    const S = parseHand(rawDeal.S);
    if (!W || !N || !E || !S) {
        return null;
    }
    return { W, N, E, S };
}

export function parseLead(rawLead: unknown): [Side, Card] | null {
    if (!(rawLead instanceof Array) || rawLead.length != 2) {
        return null;
    }
    const [rawSide, rawCard] = rawLead;
    const side = parseSide(rawSide);
    const card = parseCard(rawCard);
    if (!side || !card) {
        return null;
    }
    return [side, card];
}

export type ParsingError = string;

function parseClientEngineMessage(data: unknown): ClientEngineMessage | ParsingError {
    if (typeof data != "object" || data == null || !("kind" in data)) {
        return `malformed engine message: ${data}`;
    }

    switch (data.kind) {
        case "bid": {
            if (!("bid" in data)) {
                return `bad bid: no 'bid' field`;
            }
            const bid = parseBid(data.bid);
            if (!bid) {
                return `bad 'bid' message: ${JSON.stringify(data.bid)}`;
            }
            return { kind: "bid", bid };
        }
        case "cardplay": {
            if (!("card" in data)) {
                return `bad cardplay: no 'card field`;
            }

            const card = parseCard(data.card);
            if (!card) {
                return `bad 'cardplay' message: ${JSON.stringify(data.card)}`;
            }

            return { kind: "cardplay", card };
        }
        case "init": {
            if (!("nickname" in data)) {
                return { kind: "init", nickname: null };
            }
            const nickname = (typeof data.nickname == "string" && data.nickname)
                ? data.nickname
                : null;
            return { kind: "init", nickname };
        }
        default:
            return `bad engine message kind: ${data.kind}`;
    }
}

export function parseClientMessage(data: unknown): ClientMessage | ParsingError {
    if (typeof data != "string") {
        return `bad message type from websocket: ${typeof data}`;
    }

    let obj: unknown = null;
    try {
        obj = JSON.parse(data);
    } catch (e) {
        if (e instanceof SyntaxError) {
            return `failed to parse JSON from message: ${data}`;
        }
        return `unknown exception: ${e}: ${data}`;
    }

    if (typeof obj != "object" || obj == null || !("kind" in obj) || !("data" in obj)) {
        return `bad message type (${typeof obj}): ${data}`;
    }

    switch (obj.kind) {
        case "chat":
            if (typeof obj.data != "string") {
                return `malformed chat message: ${obj.data}`;
            }
            return { kind: "chat", data: obj.data };
        case "engine": {
            const res = parseClientEngineMessage(obj.data);
            if (typeof res == "string") {
                return `malformed engine message: ${res}`;
            }
            return { kind: "engine", data: res };
        }
        default:
            return `malformed message - unknown kind: ${obj.kind}`;
    }
}
