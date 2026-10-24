// SPDX-License-Identifier: GPL-3.0-or-later
import { assertEquals } from "@std/assert/equals";
import { assertThrows } from "@std/assert/throws";
import { assertObjectMatch } from "@std/assert/object-match";

import { Card, Denomination, getAllSides, Side } from "../../shared/types.ts";

import { __test__, processTrick } from "./cards.ts";

Deno.test("notrump tricks (all in suit)", () => {
    assertEquals(
        processTrick(
            {
                W: ["C", 2],
                N: ["C", 10],
                E: ["C", 12],
                S: ["C", 3],
            },
            "C",
            "NT",
        ),
        "E",
    );
});

Deno.test("notrump tricks (with discard)", () => {
    assertEquals(
        processTrick(
            {
                W: ["C", 10],
                N: ["C", 11],
                E: ["C", 3],
                S: ["H", 12],
            },
            "C",
            "NT",
        ),
        "N",
    );
});

Deno.test("notrump tricks (all discard)", () => {
    assertEquals(
        processTrick(
            {
                W: ["D", 3],
                N: ["C", 11],
                E: ["S", 2],
                S: ["H", 12],
            },
            "S",
            "NT",
        ),
        "E",
    );
});

Deno.test("notrump tricks (bad tricks)", () => {
    assertThrows(
        () => {
            processTrick(
                {
                    W: ["D", 9],
                    N: ["D", 8],
                    E: ["H", 12],
                    S: ["D", 9],
                },
                "D",
                "NT",
            );
        },
        Error,
        "AssertionError",
    );

    assertThrows(
        () => {
            processTrick(
                {
                    W: ["D", 9],
                    N: ["D", 8],
                    E: ["H", 12],
                    S: ["S", 9],
                },
                "C",
                "NT",
            );
        },
        Error,
        "AssertionError",
    );
});

Deno.test("trump tricks (no trump involved)", () => {
    assertEquals(
        processTrick(
            {
                W: ["C", 2],
                N: ["C", 10],
                E: ["C", 12],
                S: ["C", 3],
            },
            "C",
            "S",
        ),
        "E",
    );
});

Deno.test("trump tricks (no trump/with discard)", () => {
    assertEquals(
        processTrick(
            {
                W: ["C", 10],
                N: ["C", 11],
                E: ["C", 3],
                S: ["H", 12],
            },
            "C",
            "S",
        ),
        "N",
    );
});

Deno.test("trump tricks (ruff)", () => {
    assertEquals(
        processTrick(
            {
                W: ["D", 2],
                N: ["C", 11],
                E: ["S", 2],
                S: ["S", 12],
            },
            "S",
            "D",
        ),
        "W",
    );
});

Deno.test("trump tricks (ruff + overruff)", () => {
    assertEquals(
        processTrick(
            {
                W: ["D", 2],
                N: ["D", 3],
                E: ["S", 2],
                S: ["S", 12],
            },
            "S",
            "D",
        ),
        "N",
    );
});

Deno.test("trump tricks (trump suit)", () => {
    assertEquals(
        processTrick(
            {
                W: ["D", 2],
                N: ["D", 4],
                E: ["S", 2],
                S: ["S", 12],
            },
            "D",
            "D",
        ),
        "N",
    );
});

Deno.test("trump tricks (no lead suit)", () => {
    assertThrows(
        () => {
            processTrick(
                {
                    W: ["D", 9],
                    N: ["D", 8],
                    E: ["H", 12],
                    S: ["S", 9],
                },
                "C",
                "D",
            );
        },
        Error,
        "AssertionError",
    );
});

function createPlay(
    opts?: {
        nrTricks?: number;
        denom?: Denomination;
        cards?: Record<Side, Card>;
        turn?: Side;
    },
) {
    const p = __test__.createCardPlayImpl(
        {
            W: [],
            N: [],
            E: [],
            S: [],
        },
        "S",
        "NT",
    );

    if (!opts) {
        return p;
    }

    if (opts.nrTricks) {
        p.nrTricks = opts.nrTricks;
    }
    if (opts.denom) {
        p.denom = opts.denom;
    }
    if (opts.turn) {
        p.turn = opts.turn;
    }
    if (opts.cards) {
        for (const side of getAllSides()) {
            p.cards[side].push(opts.cards[side]);
        }
    }

    return p;
}

Deno.test("card play: game finished", () => {
    const p = createPlay({ nrTricks: 13 });
    for (const side of getAllSides()) {
        assertEquals(p.handle(side, ["S", 14]).kind, "error");
    }
});

Deno.test("card play: attack NT by South", () => {
    const p = createPlay({
        cards: {
            W: ["S", 2],
            N: ["S", 3],
            E: ["S", 13],
            S: ["C", 14],
        },
    });

    // only West can attack NT by south
    for (const side of ["S", "N", "E"]) {
        assertEquals(p.handle(side as Side, ["S", 14]).kind, "error");
    }

    // West attacks with 2 of spades
    const m1 = p.handle("W", ["S", 2]);
    assertObjectMatch(m1, { kind: "next" });

    // South plays low from the table
    const m2 = p.handle("S", ["S", 3]);
    assertObjectMatch(m2, { kind: "next" });

    // East covers with King
    const m3 = p.handle("E", ["S", 13]);
    assertObjectMatch(m3, { kind: "next" });

    // South discards an Ace from hand, East wins with his King
    const m4 = p.handle("S", ["C", 14]);
    assertObjectMatch(m4, {
        kind: "trick",
        winner: "E",
    });

    // trick has been accounted
    assertEquals(p.nrTricks, 1);
});

Deno.test("card play: suit contract with ruff", () => {
    const p = createPlay({
        denom: "D",
        cards: {
            W: ["H", 13],
            N: ["H", 2],
            E: ["H", 3],
            S: ["D", 2],
        },
    });
    p.handle("W", ["H", 13]);
    p.handle("S", ["H", 2]);
    p.handle("E", ["H", 3]);
    assertObjectMatch(p.handle("S", ["D", 2]), {
        kind: "trick",
        winner: "S",
    });
});

Deno.test("card play: dummy cannot play", () => {
    const p = createPlay({
        denom: "D",
        cards: {
            W: ["H", 13],
            N: ["H", 2],
            E: ["H", 3],
            S: ["D", 2],
        },
        turn: "N",
    });
    assertObjectMatch(p.handle("N", ["H", 2]), { kind: "error" });
    assertObjectMatch(p.handle("S", ["H", 2]), { kind: "next" });
});

Deno.test("card play: false discards not allowed", () => {
    const p = createPlay({
        cards: {
            W: ["S", 2],
            N: ["S", 3],
            E: ["S", 13],
            S: ["S", 4],
        },
    });
    p.cards.N.push(["C", 14]);

    // West attacks
    assertObjectMatch(p.handle("W", ["S", 2]), { kind: "next" });
    // North (as South) should follow the suit
    assertObjectMatch(p.handle("S", ["C", 14]), { kind: "error" });
    assertObjectMatch(p.handle("S", ["S", 3]), { kind: "next" });
});

Deno.test("card play: cheating is not allowed", () => {
    const p = createPlay({
        cards: {
            W: ["S", 2],
            N: ["S", 3],
            E: ["S", 13],
            S: ["S", 4],
        },
    });
    // West doesn't have an Ace
    assertObjectMatch(p.handle("W", ["S", 14]), { kind: "error" });
    // So please go with existing 2
    assertObjectMatch(p.handle("W", ["S", 2]), { kind: "next" });
});
