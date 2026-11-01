// SPDX-License-Identifier: GPL-3.0-or-later
import { assert } from "@std/assert";

import { Side, Vulnerability } from "../../shared/types.ts";

import { canonicalBoardParams } from "./boards.ts";
import { allDifferent, compare2Tuples } from "./utils.ts";

Deno.test("all canonical boards are different", () => {
    const BOARDS: [Side, Vulnerability][] = [];
    for (let i = 0; i < 16; ++i) {
        BOARDS.push(canonicalBoardParams(i + 1));
    }
    assert(allDifferent(BOARDS, compare2Tuples));
});
