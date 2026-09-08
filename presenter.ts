import { FinalContract } from "./game/bidding.ts";
import { Bid, Card, Deal, Side } from "./game/types.ts";
import { nextSide } from "./game/utils.ts";

function prettyPrintFinalContract(contract: FinalContract) {
    const level = contract.contract.level;
    const suitSymbol = (() => {
        switch (contract.contract.denom) {
            case "C":
                return "♣";
            case "D":
                return "♦";
            case "H":
                return "♥";
            case "S":
                return "♠";
            case "NT":
                return "NT";
        }
    })();
    const statusSymbol = (() => {
        switch (contract.status) {
            case "FREE":
                return "";
            case "X":
                return "x";
            case "XX":
                return "xx";
        }
    })();
    return `${level}${suitSymbol}${statusSymbol} by ${contract.declarer}`;
}

export class Presenter {
    notification(msg: string): string {
        return JSON.stringify({ kind: "notify", data: `server: ${msg}` });
    }

    error(err: string): string {
        return JSON.stringify({ kind: "error", data: `server: ${err}` });
    }

    chatmsg(msg: string): string {
        return JSON.stringify({ kind: "chat", data: msg });
    }

    bid(side: Side, bid: Bid, gen: number): string {
        return JSON.stringify({
            kind: "engine",
            data: {
                kind: "bid",
                side,
                bid,
                gen,
            },
        });
    }

    contract(contract: FinalContract): string {
        return JSON.stringify({
            kind: "engine",
            data: {
                kind: "contract",
                contract: prettyPrintFinalContract(contract),
                leader: nextSide(contract.declarer),
            },
        });
    }

    finish(reveal: Deal, dealer: Side, lead: [Side, Card] | null): string {
        return JSON.stringify({
            kind: "engine",
            data: {
                kind: "nextdeal",
                reveal,
                dealer,
                lead,
            },
        });
    }

    startplay(dummy: Side, table: Card[]): string {
        return JSON.stringify({
            kind: "engine",
            data: {
                kind: "startplay",
                dummy,
                table,
            },
        });
    }

    playcard(side: Side, card: Card): string {
        return JSON.stringify({
            kind: "engine",
            data: {
                kind: "playcard",
                side,
                card,
            },
        });
    }

    trick(winner: Side): string {
        return JSON.stringify({
            kind: "engine",
            data: {
                kind: "trick",
                winner,
            },
        });
    }
}

export function createPresenter(): Presenter {
    return new Presenter();
}
