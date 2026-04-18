import { Bid, Denomination, Level } from "./game/bidding.ts";
import { Card, Rank, Suit } from "./game/cards.ts";

export function parseLevel(num: unknown): Level | null {
    switch (num) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
            return num;
        default:
            return null;
    }
}

export function parseDenomination(denom: unknown): Denomination | null {
    switch (denom) {
        case "C":
        case "D":
        case "H":
        case "S":
        case "NT":
            return denom;
        default:
            return null;
    }
}

export function parseBid(data: unknown): Bid | null {
    switch (data) {
        case "PASS":
        case "X":
        case "XX":
            return data;
        default:
            if (typeof data != "object" || !data || !("level" in data && "denom" in data)) {
                return null;
            } else {
                const level = parseLevel(data.level);
                const denom = parseDenomination(data.denom);
                if (level == null || denom == null) {
                    return null;
                }
                return { level, denom };
            }
    }
}

export function parseSuit(data: unknown): Suit | null {
    switch (data) {
        case "S":
        case "H":
        case "D":
        case "C":
            return data;
        default:
            return null;
    }
}

export function parseRank(data: unknown): Rank | null {
    switch (data) {
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
            return data;
        default:
            return null;
    }
}

export function parseCard(data: unknown): Card | null {
    if (!(data instanceof Array) || data.length != 2) {
        return null;
    }
    const [suit, rank] = [parseSuit(data[0]), parseRank(data[1])];
    if (!suit || !rank) {
        return null;
    }
    return [suit, rank];
}
