import { assertEquals } from "@std/assert/equals";
import { Card, getRandomDeal, processTrickNotrump } from "./cards.ts";
import { assertNotEquals } from "@std/assert/not-equals";
import { assertThrows } from "@std/assert/throws";

Deno.test("random deal", () => {
    const rndDeal = getRandomDeal();

    let allCards: Card[] = [];
    allCards = allCards
        .concat(rndDeal.W)
        .concat(rndDeal.N)
        .concat(rndDeal.E)
        .concat(rndDeal.S)
        .sort();

    assertEquals(allCards.length, 52);
    for (let i = 0; i < allCards.length - 1; ++i) {
        // all cards must be unique
        assertNotEquals(allCards[i], allCards[i + 1]);
    }
});

Deno.test("notrump tricks (all in suit)", () => {
    assertEquals(
        processTrickNotrump({
            W: ["C", 0],
            N: ["C", 10],
            E: ["C", 12],
            S: ["C", 3],
        }, "C"),
        "E",
    );
});

Deno.test("notrump tricks (with discard)", () => {
    assertEquals(
        processTrickNotrump({
            W: ["C", 10],
            N: ["C", 11],
            E: ["C", 3],
            S: ["H", 12],
        }, "C"),
        "N",
    );
});

Deno.test("notrump tricks (all discard)", () => {
    assertEquals(
        processTrickNotrump({
            W: ["D", 3],
            N: ["C", 11],
            E: ["S", 0],
            S: ["H", 12],
        }, "S"),
        "E",
    );
});

Deno.test("notrump tricks (bad tricks)", () => {
    assertThrows(
        () => {
            processTrickNotrump({
                W: ["D", 9],
                N: ["D", 8],
                E: ["H", 12],
                S: ["D", 9],
            }, "D");
        },
        Error,
        "AssertionError",
    );

    assertThrows(
        () => {
            processTrickNotrump({
                W: ["D", 9],
                N: ["D", 8],
                E: ["H", 12],
                S: ["S", 9],
            }, "C");
        },
        Error,
        "AssertionError",
    );
});
