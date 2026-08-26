import { createEngine, EngineInput, GameEvent } from "./engine.ts";
import { Card, Deal, Rank, Suit } from "./types.ts";
import { AssertionError } from "@std/assert/assertion-error";
import { assertEquals } from "@std/assert/equals";

function pbnDecodeHand(pbnHand: string): Card[] {
    const [spades, hearts, diamonds, clubs] = pbnHand.split(".");
    const pairs: [Suit, string][] = [
        ["S", spades],
        ["H", hearts],
        ["D", diamonds],
        ["C", clubs],
    ];
    const hand: Card[] = [];
    for (const [suit, cards] of pairs) {
        for (const c of cards) {
            const rank: Rank = (() => {
                switch (c) {
                    case "A":
                        return 14;
                    case "K":
                        return 13;
                    case "Q":
                        return 12;
                    case "J":
                        return 11;
                    case "T":
                        return 10;
                    case "9":
                        return 9;
                    case "8":
                        return 8;
                    case "7":
                        return 7;
                    case "6":
                        return 6;
                    case "5":
                        return 5;
                    case "4":
                        return 4;
                    case "3":
                        return 3;
                    case "2":
                        return 2;
                    default:
                        throw new Error(`${c}`);
                }
            })();
            hand.push([suit, rank]);
        }
    }
    return hand;
}

Deno.test("run full deal from PBNv2.1 example game", () => {
    const events: GameEvent[] = [];

    const DEAL: Deal = {
        N: pbnDecodeHand(".63.AKQ987.A9732"),
        E: pbnDecodeHand("A8654.KQ5.T.QJT6"),
        S: pbnDecodeHand("J973.J98742.3.K4"),
        W: pbnDecodeHand("KQT2.AT.J6542.85"),
    };
    const GAME: EngineInput[] = [
        // bidding
        { side: "N", data: { kind: "bid", bid: { level: 1, denom: "D" } } },
        { side: "E", data: { kind: "bid", bid: { level: 1, denom: "S" } } },
        { side: "S", data: { kind: "bid", bid: { level: 3, denom: "H" } } },
        { side: "W", data: { kind: "bid", bid: { level: 4, denom: "S" } } },

        { side: "N", data: { kind: "bid", bid: { level: 4, denom: "NT" } } },
        { side: "E", data: { kind: "bid", bid: "X" } },
        { side: "S", data: { kind: "bid", bid: "PASS" } },
        { side: "W", data: { kind: "bid", bid: "PASS" } },

        { side: "N", data: { kind: "bid", bid: { level: 5, denom: "C" } } },
        { side: "E", data: { kind: "bid", bid: "X" } },
        { side: "S", data: { kind: "bid", bid: { level: 5, denom: "H" } } },
        { side: "W", data: { kind: "bid", bid: "X" } },

        { side: "N", data: { kind: "bid", bid: "PASS" } },
        { side: "E", data: { kind: "bid", bid: "PASS" } },
        { side: "S", data: { kind: "bid", bid: "PASS" } },

        // card play
        // (play just two rounds, as the engine does not support claims anyway)
        { side: "W", data: { kind: "cardplay", card: ["S", 13] } },
        { side: "S", data: { kind: "cardplay", card: ["H", 3] } },
        { side: "E", data: { kind: "cardplay", card: ["S", 4] } },
        { side: "S", data: { kind: "cardplay", card: ["S", 3] } },

        { side: "S", data: { kind: "cardplay", card: ["C", 2] } },
        { side: "E", data: { kind: "cardplay", card: ["C", 6] } },
        { side: "S", data: { kind: "cardplay", card: ["C", 13] } },
        { side: "W", data: { kind: "cardplay", card: ["C", 5] } },
    ];

    const engine = createEngine(DEAL, "N", "NONE");

    for (const input of GAME) {
        const res = engine.handle(input);
        switch (res.kind) {
            case "ok":
                events.push(...res.events);
                break;
            case "err":
                throw new AssertionError(res.err);
        }
    }

    const EXPECTED: GameEvent[] = [
        // auction
        { kind: "BidMade", side: "N", bid: { level: 1, denom: "D" } },
        { kind: "BidMade", side: "E", bid: { level: 1, denom: "S" } },
        { kind: "BidMade", side: "S", bid: { level: 3, denom: "H" } },
        { kind: "BidMade", side: "W", bid: { level: 4, denom: "S" } },
        { kind: "BidMade", side: "N", bid: { level: 4, denom: "NT" } },
        { kind: "BidMade", side: "E", bid: "X" },
        { kind: "BidMade", side: "S", bid: "PASS" },
        { kind: "BidMade", side: "W", bid: "PASS" },
        { kind: "BidMade", side: "N", bid: { level: 5, denom: "C" } },
        { kind: "BidMade", side: "E", bid: "X" },
        { kind: "BidMade", side: "S", bid: { level: 5, denom: "H" } },
        { kind: "BidMade", side: "W", bid: "X" },
        { kind: "BidMade", side: "N", bid: "PASS" },
        { kind: "BidMade", side: "E", bid: "PASS" },
        { kind: "BidMade", side: "S", bid: "PASS" },

        // contract
        {
            kind: "ContractReached",
            contract: {
                contract: { level: 5, denom: "H" },
                status: "X",
                declarer: "S",
            },
        },

        // tricks
        { kind: "CardPlayed", side: "W", card: ["S", 13] },
        { kind: "DummyRevealed", side: "N", hand: DEAL["N"] },
        { kind: "CardPlayed", side: "N", card: ["H", 3] },
        { kind: "CardPlayed", side: "E", card: ["S", 4] },
        { kind: "CardPlayed", side: "S", card: ["S", 3] },
        { kind: "TrickCompleted", winner: "N" },

        { kind: "CardPlayed", side: "N", card: ["C", 2] },
        { kind: "CardPlayed", side: "E", card: ["C", 6] },
        { kind: "CardPlayed", side: "S", card: ["C", 13] },
        { kind: "CardPlayed", side: "W", card: ["C", 5] },
        { kind: "TrickCompleted", winner: "S" },
    ];
    assertEquals(events, EXPECTED);
});
