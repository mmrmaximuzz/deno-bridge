export type Side = "W" | "E" | "N" | "S";
type Pair = "WE" | "NS";

export const ALL_SIDES: Side[] = ["N", "E", "S", "W"];

export function nextSide(side: Side): Side {
    switch (side) {
        case "N":
            return "E";
        case "E":
            return "S";
        case "S":
            return "W";
        case "W":
            return "N";
    }
}

export function getPair(side: Side): Pair {
    switch (side) {
        case "W":
        case "E":
            return "WE";
        case "N":
        case "S":
            return "NS";
    }
}

export function getPartner(side: Side): Side {
    switch (side) {
        case "W":
            return "E";
        case "E":
            return "W";
        case "N":
            return "S";
        case "S":
            return "N";
    }
}

export function sideWEDynamicCast(side: Side): "W" | "E" {
    switch (side) {
        case "W":
            return "W";
        case "E":
            return "E";
        case "N":
        case "S":
            throw new Error(`assertion error: dynamic_cast<WE> failed from: ${side}`);
    }
}

export function sideNSDynamicCast(side: Side): "N" | "S" {
    switch (side) {
        case "N":
            return "N";
        case "S":
            return "S";
        case "W":
        case "E":
            throw new Error(`assertion error: dynamic_cast<NS> failed from: ${side}`);
    }
}

export function samePairs(s1: Side, s2: Side): boolean {
    return getPair(s1) == getPair(s2);
}
