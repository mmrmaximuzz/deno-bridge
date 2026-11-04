// SPDX-License-Identifier: GPL-3.0-or-later
import { assertObjectMatch } from "@std/assert/object-match";
import { parsePbnSingleDeal } from "./pbn.ts";
import { assert } from "@std/assert/assert";

Deno.test("parse single PBN deal", () => {
    const PBNDEAL = `[Event "Hand simulated by dealer with file test.dealer, seed 0000000000"]
[Site "-"]
[Date "2026.11.04"]
[Board "1"]
[West "-"]
[North "-"]
[East "-"]
[South "-"]
[Dealer "N"]
[Vulnerable "None"]
[Deal "N:J.9854.QT654.QT6 AQT.Q6.KJ82.J943 98632.AKT73.93.5 K754.J2.A7.AK872"]
[Declarer "?"]
[Contract "?"]
[Result "?"]`;

    const deal = parsePbnSingleDeal(PBNDEAL);
    assert(deal != null);
    assertObjectMatch(deal, {
        N: [
            // spades
            ["S", 11],
            // hearts
            ["H", 9],
            ["H", 8],
            ["H", 5],
            ["H", 4],
            // diamonds
            ["D", 12],
            ["D", 10],
            ["D", 6],
            ["D", 5],
            ["D", 4],
            // clubs
            ["C", 12],
            ["C", 10],
            ["C", 6],
        ],
        E: [
            // spades
            ["S", 14],
            ["S", 12],
            ["S", 10],
            // hearts
            ["H", 12],
            ["H", 6],
            // diamonds
            ["D", 13],
            ["D", 11],
            ["D", 8],
            ["D", 2],
            // clubs
            ["C", 11],
            ["C", 9],
            ["C", 4],
            ["C", 3],
        ],
        S: [
            // spades
            ["S", 9],
            ["S", 8],
            ["S", 6],
            ["S", 3],
            ["S", 2],
            // hearts
            ["H", 14],
            ["H", 13],
            ["H", 10],
            ["H", 7],
            ["H", 3],
            // diamonds
            ["D", 9],
            ["D", 3],
            // clubs
            ["C", 5],
        ],
        W: [
            // spades
            ["S", 13],
            ["S", 7],
            ["S", 5],
            ["S", 4],
            // hearts
            ["H", 11],
            ["H", 2],
            // diamonds
            ["D", 14],
            ["D", 7],
            // clubs
            ["C", 14],
            ["C", 13],
            ["C", 8],
            ["C", 7],
            ["C", 2],
        ],
    });
});
