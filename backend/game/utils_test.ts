import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";

import { allDifferent, compare2Tuples, sideNSDynamicCast, sideWEDynamicCast } from "./utils.ts";

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
