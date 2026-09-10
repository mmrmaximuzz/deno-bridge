import { assert, assertEquals, assertExists, assertThrows } from "@std/assert";

import { Bid, Side } from "../../shared/types.ts";

import { __test__, BiddingResult, createBidding, InvalidBid } from "./bidding.ts";
import { getAllSides, getPartner, nextSide } from "./utils.ts";

const denominationHigher = __test__.denominationHigher;
const contractHigher = __test__.contractHigher;

Deno.test("denomination comparisons", () => {
    assert(!denominationHigher("C", "C"));
    assert(denominationHigher("D", "C"));
    assert(denominationHigher("H", "C"));
    assert(denominationHigher("S", "C"));
    assert(denominationHigher("NT", "C"));

    assert(!denominationHigher("C", "D"));
    assert(!denominationHigher("D", "D"));
    assert(denominationHigher("H", "D"));
    assert(denominationHigher("S", "D"));
    assert(denominationHigher("NT", "D"));

    assert(!denominationHigher("C", "H"));
    assert(!denominationHigher("D", "H"));
    assert(!denominationHigher("H", "H"));
    assert(denominationHigher("S", "H"));
    assert(denominationHigher("NT", "H"));

    assert(!denominationHigher("C", "S"));
    assert(!denominationHigher("D", "S"));
    assert(!denominationHigher("H", "S"));
    assert(!denominationHigher("S", "S"));
    assert(denominationHigher("NT", "S"));

    assert(!denominationHigher("C", "NT"));
    assert(!denominationHigher("D", "NT"));
    assert(!denominationHigher("H", "NT"));
    assert(!denominationHigher("S", "NT"));
    assert(!denominationHigher("NT", "NT"));
});

Deno.test("contract bid comparisons", () => {
    assert(contractHigher({ level: 1, denom: "S" }, { level: 1, denom: "C" }));
    assert(!contractHigher({ level: 1, denom: "D" }, { level: 1, denom: "D" }));
    assert(!contractHigher({ level: 1, denom: "NT" }, { level: 1, denom: "NT" }));
    assert(contractHigher({ level: 2, denom: "C" }, { level: 1, denom: "D" }));
    assert(contractHigher({ level: 2, denom: "C" }, { level: 1, denom: "NT" }));
    assert(!contractHigher({ level: 2, denom: "D" }, { level: 3, denom: "C" }));
});

Deno.test("create bidding", () => {
    for (const side of getAllSides()) {
        const bidding = createBidding(side);
        assertExists(bidding);
        assertEquals(bidding.turn(), side);
    }
});

type BidVariant = {
    bids: Bid[];
    dealer: Side;
    opener: Side;
};

// helper function to test the same bid sequences from all dealers and with all pass preludes
function generateBidVariants(bids: Bid[]): BidVariant[] {
    const variants = [];
    for (const initSide of getAllSides()) {
        let side = initSide;
        const prefix: Bid[] = [];
        for (const _ of [1, 2, 3]) {
            variants.push({
                opener: side,
                dealer: initSide,
                bids: prefix.concat(bids),
            });
            prefix.push("PASS");
            side = nextSide(side);
        }
    }
    return variants;
}

function playBiddingWithDealer(bids: Bid[], dealer: Side): BiddingResult {
    assert(bids.length >= 1);

    const bidding = createBidding(dealer);

    // handle all but last
    for (let i = 0; i < bids.length - 1; ++i) {
        const bid = bids[i];
        const intermediate = bidding.handle(bid);
        assertEquals(intermediate, "inprogress");
    }

    // return the state after the last bid
    return bidding.handle(bids[bids.length - 1]);
}

Deno.test("bidding: -", () => {
    for (const side of getAllSides()) {
        assertEquals(playBiddingWithDealer(["PASS"], side), "inprogress");
    }
});

Deno.test("bidding: - -", () => {
    for (const side of getAllSides()) {
        assertEquals(playBiddingWithDealer(["PASS", "PASS"], side), "inprogress");
    }
});

Deno.test("bidding: - - -", () => {
    for (const side of getAllSides()) {
        assertEquals(playBiddingWithDealer(["PASS", "PASS", "PASS"], side), "inprogress");
    }
});

Deno.test("bidding: - - - -", () => {
    for (const side of getAllSides()) {
        assertEquals(playBiddingWithDealer(["PASS", "PASS", "PASS", "PASS"], side), "passout");
    }
});

Deno.test("bidding: 1 - - -", () => {
    for (
        const { bids, opener, dealer } of generateBidVariants([
            { level: 1, denom: "C" },
            "PASS",
            "PASS",
            "PASS",
        ])
    ) {
        assertEquals(playBiddingWithDealer(bids, dealer), {
            contract: { level: 1, denom: "C" },
            status: "FREE",
            declarer: opener,
        });
    }
});

Deno.test("bidding: 1 - 2 - - -", () => {
    for (
        const { bids, opener, dealer } of generateBidVariants([
            { level: 1, denom: "C" },
            "PASS",
            { level: 2, denom: "C" },
            "PASS",
            "PASS",
            "PASS",
        ])
    ) {
        assertEquals(playBiddingWithDealer(bids, dealer), {
            contract: { level: 2, denom: "C" },
            status: "FREE",
            declarer: opener,
        });
    }
});

Deno.test("bidding: 1 - 1o - 2 - - -", () => {
    for (
        const { bids, opener, dealer } of generateBidVariants([
            { level: 1, denom: "C" },
            "PASS",
            { level: 1, denom: "NT" },
            "PASS",
            { level: 2, denom: "NT" },
            "PASS",
            "PASS",
            "PASS",
        ])
    ) {
        assertEquals(playBiddingWithDealer(bids, dealer), {
            contract: { level: 2, denom: "NT" },
            status: "FREE",
            declarer: getPartner(opener),
        });
    }
});

Deno.test("bidding: 1 1o - 4 - - -", () => {
    for (
        const { bids, opener, dealer } of generateBidVariants([
            { level: 1, denom: "C" },
            { level: 1, denom: "H" },
            "PASS",
            { level: 4, denom: "H" },
            "PASS",
            "PASS",
            "PASS",
        ])
    ) {
        assertEquals(playBiddingWithDealer(bids, dealer), {
            contract: { level: 4, denom: "H" },
            status: "FREE",
            declarer: nextSide(opener),
        });
    }
});

Deno.test("bidding: 1 - - 1o - 4 - - -", () => {
    for (
        const { bids, opener, dealer } of generateBidVariants([
            { level: 1, denom: "C" },
            "PASS",
            "PASS",
            { level: 1, denom: "H" },
            "PASS",
            { level: 4, denom: "H" },
            "PASS",
            "PASS",
            "PASS",
        ])
    ) {
        assertEquals(playBiddingWithDealer(bids, dealer), {
            contract: { level: 4, denom: "H" },
            status: "FREE",
            declarer: getPartner(nextSide(opener)),
        });
    }
});

Deno.test("bidding: 1 X - - -", () => {
    for (
        const { bids, opener, dealer } of generateBidVariants([
            { level: 1, denom: "C" },
            "X",
            "PASS",
            "PASS",
            "PASS",
        ])
    ) {
        assertEquals(playBiddingWithDealer(bids, dealer), {
            contract: { level: 1, denom: "C" },
            status: "X",
            declarer: opener,
        });
    }
});

Deno.test("bidding: 1 - - X - - -", () => {
    for (
        const { bids, opener, dealer } of generateBidVariants([
            { level: 1, denom: "C" },
            "PASS",
            "PASS",
            "X",
            "PASS",
            "PASS",
            "PASS",
        ])
    ) {
        assertEquals(playBiddingWithDealer(bids, dealer), {
            contract: { level: 1, denom: "C" },
            status: "X",
            declarer: opener,
        });
    }
});

Deno.test("bidding: 1 X XX - - -", () => {
    for (
        const { bids, opener, dealer } of generateBidVariants([
            { level: 1, denom: "C" },
            "X",
            "XX",
            "PASS",
            "PASS",
            "PASS",
        ])
    ) {
        assertEquals(playBiddingWithDealer(bids, dealer), {
            contract: { level: 1, denom: "C" },
            status: "XX",
            declarer: opener,
        });
    }
});

Deno.test("bidding: 1 X - - XX - - -", () => {
    for (
        const { bids, opener, dealer } of generateBidVariants([
            { level: 1, denom: "C" },
            "X",
            "PASS",
            "PASS",
            "XX",
            "PASS",
            "PASS",
            "PASS",
        ])
    ) {
        assertEquals(playBiddingWithDealer(bids, dealer), {
            contract: { level: 1, denom: "C" },
            status: "XX",
            declarer: opener,
        });
    }
});

Deno.test("bidding: 1 - - X XX - - -", () => {
    for (
        const { bids, opener, dealer } of generateBidVariants([
            { level: 1, denom: "C" },
            "PASS",
            "PASS",
            "X",
            "XX",
            "PASS",
            "PASS",
            "PASS",
        ])
    ) {
        assertEquals(playBiddingWithDealer(bids, dealer), {
            contract: { level: 1, denom: "C" },
            status: "XX",
            declarer: opener,
        });
    }
});

Deno.test("bidding: 1 - - X - - XX - - -", () => {
    for (
        const { bids, opener, dealer } of generateBidVariants([
            { level: 1, denom: "C" },
            "PASS",
            "PASS",
            "X",
            "PASS",
            "PASS",
            "XX",
            "PASS",
            "PASS",
            "PASS",
        ])
    ) {
        assertEquals(playBiddingWithDealer(bids, dealer), {
            contract: { level: 1, denom: "C" },
            status: "XX",
            declarer: opener,
        });
    }
});

Deno.test("bidding: X(err)", () => {
    for (const { bids, dealer } of generateBidVariants(["X"])) {
        assertThrows(
            () => {
                playBiddingWithDealer(bids, dealer);
            },
            InvalidBid,
            "double on no contract",
        );
    }
});

Deno.test("bidding: 1 - X(err)", () => {
    for (
        const { bids, dealer } of generateBidVariants(
            [{ level: 1, denom: "C" }, "PASS", "X"],
        )
    ) {
        assertThrows(
            () => {
                playBiddingWithDealer(bids, dealer);
            },
            InvalidBid,
            "double on own contract",
        );
    }
});

Deno.test("bidding: XX(err)", () => {
    for (const { bids, dealer } of generateBidVariants(["XX"])) {
        assertThrows(
            () => {
                playBiddingWithDealer(bids, dealer);
            },
            InvalidBid,
            "redouble on no contract",
        );
    }
});

Deno.test("bidding: 1 XX(err)", () => {
    for (
        const { bids, dealer } of generateBidVariants([
            { level: 1, denom: "C" },
            "XX",
        ])
    ) {
        assertThrows(
            () => {
                playBiddingWithDealer(bids, dealer);
            },
            InvalidBid,
            "redouble on non-doubled contract",
        );
    }
});

Deno.test("bidding: 1 - XX(err)", () => {
    for (
        const { bids, dealer } of generateBidVariants([
            { level: 1, denom: "C" },
            "PASS",
            "XX",
        ])
    ) {
        assertThrows(
            () => {
                playBiddingWithDealer(bids, dealer);
            },
            InvalidBid,
            "redouble on non-doubled contract",
        );
    }
});

Deno.test("bidding: 1 - - XX(err)", () => {
    for (
        const { bids, dealer } of generateBidVariants([
            { level: 1, denom: "C" },
            "PASS",
            "PASS",
            "XX",
        ])
    ) {
        assertThrows(
            () => {
                playBiddingWithDealer(bids, dealer);
            },
            InvalidBid,
            "redouble on non-doubled contract",
        );
    }
});

Deno.test("bidding: 1D 1D(err)", () => {
    for (
        const { bids, dealer } of generateBidVariants([
            { level: 1, denom: "D" },
            { level: 1, denom: "D" },
        ])
    ) {
        assertThrows(
            () => {
                playBiddingWithDealer(bids, dealer);
            },
            InvalidBid,
            "the contract is not higher",
        );
    }
});

Deno.test("bidding: 1D 1C(err)", () => {
    for (
        const { bids, dealer } of generateBidVariants([
            { level: 1, denom: "D" },
            { level: 1, denom: "C" },
        ])
    ) {
        assertThrows(
            () => {
                playBiddingWithDealer(bids, dealer);
            },
            InvalidBid,
            "the contract is not higher",
        );
    }
});

Deno.test("bidding: demo from PBN2.1 spec", () => {
    assertEquals(
        playBiddingWithDealer([
            // T1
            { level: 1, denom: "D" },
            { level: 1, denom: "S" },
            { level: 3, denom: "H" },
            { level: 4, denom: "S" },

            // T2
            { level: 4, denom: "NT" },
            "X",
            "PASS",
            "PASS",

            // T3
            { level: 5, denom: "C" },
            "X",
            { level: 5, denom: "H" },
            "X",

            // T4
            "PASS",
            "PASS",
            "PASS",
        ], "N"),
        {
            contract: { level: 5, denom: "H" },
            status: "X",
            declarer: "S",
        },
    );
});
