import { assert } from "@std/assert/assert";
import { evalCardsHcp } from "./hcp.ts";
import { generateHandWithFilter } from "./random.ts";
import { Deal } from "./types.ts";
import { assertThrows } from "@std/assert/throws";

Deno.test("filter provides deals that match given predicate", () => {
    const filter = { pred: (deal: Deal) => evalCardsHcp(deal["N"]) > 18 };
    const deal = generateHandWithFilter(filter);
    assert(evalCardsHcp(deal["N"]) > 18);
});

Deno.test("impossible filter is cap-limited", () => {
    assertThrows(() =>
        generateHandWithFilter({
            pred: (deal: Deal) => evalCardsHcp(deal["N"]) > 40,
        })
    );
});
