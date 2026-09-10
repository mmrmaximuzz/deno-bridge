import { assert } from "@std/assert/assert";
import { assertThrows } from "@std/assert/throws";
import { assertEquals } from "@std/assert/equals";

import { Card, Deal, Rank, Suit } from "../../shared/types.ts";

import { evalCardsHcp } from "./hcp.ts";
import { generateHandWithFilter, getRandomDeal } from "./random.ts";

Deno.test("random deal contains right cards", () => {
    // all the deck
    const ALL_CARDS = (() => {
        const c: Card[] = [];
        const SUITS: Suit[] = ["C", "D", "H", "S"];
        const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                c.push([suit, rank]);
            }
        }
        return c.sort();
    })();

    const rndDeal = getRandomDeal();
    let cards: Card[] = [];
    cards = cards
        .concat(rndDeal.W)
        .concat(rndDeal.N)
        .concat(rndDeal.E)
        .concat(rndDeal.S)
        .sort();

    assertEquals(cards, ALL_CARDS);
});

Deno.test("filter provides deals that match given predicate", () => {
    const filter = { pred: (deal: Deal) => evalCardsHcp(deal["N"]) > 18 };
    const deal = generateHandWithFilter(filter);
    assert(evalCardsHcp(deal["N"]) > 18);
});

Deno.test("cap-limiting", () => {
    assertThrows(() =>
        generateHandWithFilter({
            pred: (deal: Deal) => evalCardsHcp(deal["N"]) > 40, // never be true
            limit: 10000,
        })
    );
});
