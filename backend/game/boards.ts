// SPDX-License-Identifier: GPL-3.0-or-later
import { Side, Vulnerability } from "../../shared/types.ts";

// The canonical bridge boards' dealers and vulnerabilities
// Taken verbatim from "Laws of Duplicate Bridge 2017"
const CANONICAL_BOARDS: [Side, Vulnerability][] = [
    // boards 1-4
    ["N", "NONE"],
    ["E", "NS"],
    ["S", "WE"],
    ["W", "BOTH"],
    // boards 5-8
    ["N", "NS"],
    ["E", "WE"],
    ["S", "BOTH"],
    ["W", "NONE"],
    // boards 9-12
    ["N", "WE"],
    ["E", "BOTH"],
    ["S", "NONE"],
    ["W", "NS"],
    // boards 13-16
    ["N", "BOTH"],
    ["E", "NONE"],
    ["S", "NS"],
    ["W", "WE"],
];

export function canonicalBoardParams(board: number): [Side, Vulnerability] {
    // bridge boards are 1-based
    const idx = (board - 1) % 16;
    return CANONICAL_BOARDS[idx];
}
