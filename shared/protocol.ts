import { Bid, Card, Deal, Side } from "./types.ts";
import { parseBid, parseCard } from "./parsing.ts";

export type ClientEngineMessage =
    | { kind: "init"; nickname: string | null }
    | { kind: "bid"; bid: Bid }
    | { kind: "cardplay"; card: Card };

export type ClientMessage =
    | { kind: "chat"; data: string }
    | { kind: "engine"; data: ClientEngineMessage };

export type ClientParsingError = string;

function parseClientEngineData(data: unknown): ClientEngineMessage | ClientParsingError {
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

export function parseClientData(data: unknown): ClientMessage | ClientParsingError {
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
            const res = parseClientEngineData(obj.data);
            if (typeof res == "string") {
                return `malformed engine message: ${res}`;
            }
            return { kind: "engine", data: res };
        }
        default:
            return `malformed message - unknown kind: ${obj.kind}`;
    }
}

export type ServerEngineResponse =
    | { kind: "bid"; side: Side; bid: Bid; gen: number }
    | { kind: "contract"; contract: string; leader: Side }
    | { kind: "nextdeal"; reveal: Deal; dealer: Side; lead: [Side, Card] | null }
    | { kind: "startplay"; dummy: Side; table: Card[] }
    | { kind: "playcard"; side: Side; card: Card }
    | { kind: "trick"; winner: Side };

export type ServerMessage =
    | { kind: "notify"; data: string }
    | { kind: "error"; data: string }
    | { kind: "chat"; data: string }
    | { kind: "engine"; data: ServerEngineResponse };
