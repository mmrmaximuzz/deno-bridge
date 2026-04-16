import { Bid, Denomination, Level } from "./game/bidding.ts";

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
