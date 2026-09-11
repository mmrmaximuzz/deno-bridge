import { Bid, Card, Deal, Side, Vulnerability } from "./types.ts";

export type ClientEngineMessage =
    | { kind: "init"; nickname: string | null }
    | { kind: "bid"; bid: Bid }
    | { kind: "cardplay"; card: Card };

export type ClientMessage =
    | { kind: "chat"; data: string }
    | { kind: "engine"; data: ClientEngineMessage };

export type ServerEngineMessage =
    | {
        kind: "init";
        side: Side;
        bidHistory: [Side, Bid[]];
        hand: Card[];
        vuln: Vulnerability;
        gen: number;
    }
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
    | { kind: "engine"; data: ServerEngineMessage };
