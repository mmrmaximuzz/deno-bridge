import { Pair, Side } from "../../shared/types.ts";

export function getAllSides(): Side[] {
    return ["W", "N", "E", "S"];
}

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

export function allDifferent<T>(xs: T[], comparator?: (a: T, b: T) => number): boolean {
    // avoid modifying the input array
    const vals = ([] as T[]).concat(xs).sort();

    for (let i = 0; i < vals.length - 1; ++i) {
        if (comparator) {
            if (comparator(vals[i], vals[i + 1]) == 0) {
                return false;
            }
        } else {
            if (vals[i] == vals[i + 1]) {
                return false;
            }
        }
    }
    return true;
}

export function compare2Tuples<T, V>(a: [T, V], b: [T, V]): number {
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
}
