import { assert, assertEquals } from "@std/assert";

import { getPair, getPartner, nextSide, samePairs } from "./types.ts";

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
