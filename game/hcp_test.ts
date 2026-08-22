import { assertEquals } from "@std/assert/equals";
import { Card } from "./types.ts";
import { evalHandsHcp, hcp } from "./hcp.ts";
import { getRandomDeal } from "./utils.ts";

Deno.test("non-figures are not counted as hcp", () => {
    const hand: Card[] = [
        ["H", 2],
        ["H", 3],
        ["H", 4],
        ["H", 5],
        ["H", 6],
        ["H", 7],
        ["H", 8],
        ["H", 9],
        ["H", 10],
    ];
    for (const card of hand) {
        assertEquals(hcp(card), 0);
    }
});

Deno.test("figures are counted as 1234", () => {
    const a: Card = ["C", 14];
    const k: Card = ["C", 13];
    const q: Card = ["C", 12];
    const j: Card = ["C", 11];
    assertEquals(hcp(a), 4);
    assertEquals(hcp(k), 3);
    assertEquals(hcp(q), 2);
    assertEquals(hcp(j), 1);
});

Deno.test("total count is 40", () => {
    for (let i = 0; i < 100; ++i) {
        const deal = getRandomDeal();
        const hcps = evalHandsHcp(deal);
        assertEquals(hcps["E"] + hcps["W"] + hcps["N"] + hcps["S"], 40);
    }
});
