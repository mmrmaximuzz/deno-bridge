import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import {
    allDifferent,
    compare2Tuples,
    getPair,
    getPartner,
    nextSide,
    samePairs,
    sideNSDynamicCast,
    sideWEDynamicCast,
} from "./common.ts";

Deno.test("side switching", () => {
    assertEquals(nextSide("W"), "N");
    assertEquals(nextSide("N"), "E");
    assertEquals(nextSide("E"), "S");
    assertEquals(nextSide("S"), "W");
});

Deno.test("same pairs", () => {
    assert(samePairs("E", "E"));
    assert(samePairs("W", "W"));
    assert(samePairs("E", "W"));
    assert(samePairs("W", "E"));
    assert(samePairs("N", "N"));
    assert(samePairs("S", "S"));
    assert(samePairs("N", "S"));
    assert(samePairs("S", "N"));

    assert(!samePairs("W", "N"));
    assert(!samePairs("W", "S"));
    assert(!samePairs("E", "N"));
    assert(!samePairs("E", "S"));
    assert(!samePairs("N", "E"));
    assert(!samePairs("N", "W"));
    assert(!samePairs("S", "E"));
    assert(!samePairs("S", "W"));
});

Deno.test("get pair", () => {
    assertEquals(getPair("N"), "NS");
    assertEquals(getPair("S"), "NS");
    assertEquals(getPair("W"), "WE");
    assertEquals(getPair("E"), "WE");
});

Deno.test("get partner", () => {
    assertEquals(getPartner("N"), "S");
    assertEquals(getPartner("S"), "N");
    assertEquals(getPartner("W"), "E");
    assertEquals(getPartner("E"), "W");
});

Deno.test("side casts", () => {
    assertEquals(sideNSDynamicCast("N"), "N");
    assertEquals(sideNSDynamicCast("S"), "S");
    assertEquals(sideWEDynamicCast("W"), "W");
    assertEquals(sideWEDynamicCast("E"), "E");

    assertThrows(
        () => {
            sideNSDynamicCast("W");
        },
        Error,
        "assertion error",
    );
    assertThrows(
        () => {
            sideNSDynamicCast("E");
        },
        Error,
        "assertion error",
    );
    assertThrows(
        () => {
            sideWEDynamicCast("N");
        },
        Error,
        "assertion error",
    );
    assertThrows(
        () => {
            sideWEDynamicCast("S");
        },
        Error,
        "assertion error",
    );
});

Deno.test("allDifferent utility", () => {
    assert(allDifferent([1]));
    assert(allDifferent([1, 2]));
    assertFalse(allDifferent([1, 1]));
    assertFalse(allDifferent([1, 2, 1]));

    assert(allDifferent([["x", 1], ["z", 1], ["y", 2]] as [string, number][], compare2Tuples));
    assert(allDifferent([["x", 1], ["z", 1], ["x", 2]] as [string, number][], compare2Tuples));
    assert(allDifferent([["x", 1], ["z", 1], ["y", 1]] as [string, number][], compare2Tuples));
    assertFalse(allDifferent([["x", 1], ["z", 1], ["x", 1]] as [string, number][], compare2Tuples));
    assertFalse(allDifferent([["x", 2], ["z", 1], ["x", 2]] as [string, number][], compare2Tuples));
});
