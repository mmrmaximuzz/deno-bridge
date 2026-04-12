import {
    getPair,
    nextSide,
    samePairs,
    Side,
    sideNSDynamicCast,
    sideWEDynamicCast,
} from "./common.ts";

// exported types
export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Denomination = "C" | "D" | "H" | "S" | "NT";
export type Contract = { level: Level; denom: Denomination };
export type ContractStatus = "free" | "X" | "XX";
export type Bid = "pass" | "X" | "XX" | Contract;
export type FinalContract = {
    contract: Contract;
    status: ContractStatus;
    declarer: Side;
};
export class InvalidBid extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidBid";
    }
}
export type BiddingResult = "inprogress" | "passout" | FinalContract;
export interface Bidding {
    handle(bid: Bid): BiddingResult;
    turn(): Side;
}

type ActiveContract = {
    contract: Contract;
    side: Side;
    status: ContractStatus;
};
type BiddingState = {
    finished: boolean;
    currentSide: Side;
    nrPasses: 0 | 1 | 2 | 3;
    nsDeclares: Record<Denomination, "N" | "S" | null>;
    weDeclares: Record<Denomination, "W" | "E" | null>;
    activeContract: ActiveContract | null;
};

function denominationHigher(dNew: Denomination, dOld: Denomination): boolean {
    if (dNew == "NT") {
        // notrump is higher than other denominations
        return dOld != "NT";
    } else {
        // if both not NT, compare as strings
        return dOld != "NT" && dNew > dOld;
    }
}

function contractHigher(cNew: Contract, cOld: Contract): boolean {
    return cNew.level > cOld.level ||
        cNew.level == cOld.level && denominationHigher(cNew.denom, cOld.denom);
}

function newBiddingState(dealer: Side): BiddingState {
    return {
        finished: false,
        currentSide: dealer,
        nsDeclares: { C: null, D: null, H: null, S: null, NT: null },
        weDeclares: { C: null, D: null, H: null, S: null, NT: null },
        activeContract: null,
        nrPasses: 0,
    };
}

class BiddingImpl implements Bidding {
    state: BiddingState;

    constructor(dealer: Side) {
        this.state = newBiddingState(dealer);
    }

    next(): void {
        this.state.currentSide = nextSide(this.state.currentSide);
    }

    clearPasses(): void {
        this.state.nrPasses = 0;
    }

    setContractFromBid(contract: Contract): void {
        const side = this.state.currentSide;
        const denom = contract.denom;

        switch (getPair(side)) {
            case "WE": {
                const weSide = sideWEDynamicCast(side);
                if (this.state.weDeclares[denom] == null) {
                    this.state.weDeclares[denom] = weSide;
                }
                break;
            }
            case "NS": {
                const nsSide = sideNSDynamicCast(side);
                if (this.state.nsDeclares[denom] == null) {
                    this.state.nsDeclares[denom] = nsSide;
                }
                break;
            }
        }

        this.state.activeContract = {
            contract: { level: contract.level, denom: contract.denom },
            side: side,
            status: "free",
        };
    }

    getFinalContract(): FinalContract {
        if (this.state.activeContract == null) {
            throw new Error("assertion error: activeContract is null");
        }

        const denom = this.state.activeContract.contract.denom;
        const side = this.state.activeContract.side;

        // decide who is declarer by the history of declares
        let declarer = null;
        switch (side) {
            case "W":
            case "E":
                declarer = this.state.weDeclares[denom];
                if (declarer == null) {
                    throw new Error("assertion error: contract with no declarer");
                }
                break;
            case "N":
            case "S":
                declarer = this.state.nsDeclares[denom];
                if (declarer == null) {
                    throw new Error("assertion error: contract with no declarer");
                }
                break;
        }

        return {
            contract: {
                level: this.state.activeContract.contract.level,
                denom: this.state.activeContract.contract.denom,
            },
            status: this.state.activeContract.status,
            declarer: declarer,
        };
    }

    handle(bid: Bid): BiddingResult {
        if (this.state.finished) {
            throw new InvalidBid("the bidding is over");
        }

        if (bid == "pass") {
            switch (this.state.nrPasses) {
                case 0:
                    this.state.nrPasses = 1;
                    this.next();
                    return "inprogress";
                case 1:
                    this.state.nrPasses = 2;
                    this.next();
                    return "inprogress";
                case 2:
                    // if contract bid has been made, then 3 passes stops the bidding
                    if (this.state.activeContract != null) {
                        this.state.finished = true;
                        return this.getFinalContract();
                    }
                    // else give the forth player the right to make its bid
                    this.state.nrPasses = 3;
                    this.next();
                    return "inprogress";
                case 3:
                    // sanity check
                    if (this.state.activeContract != null) {
                        throw new Error(
                            "assertion failed: 4 passes with active contract",
                        );
                    }
                    this.state.finished = true;
                    return "passout";
            }
        }

        if (bid == "X") {
            // double could be done only on existing contract
            if (this.state.activeContract == null) {
                throw new InvalidBid("double on no contract");
            }

            if (this.state.activeContract.status != "free") {
                throw new InvalidBid("double on non-free contract");
            }

            if (samePairs(this.state.activeContract.side, this.state.currentSide)) {
                throw new InvalidBid("double on own contract");
            }

            this.state.activeContract.status = "X";
            this.clearPasses();
            this.next();
            return "inprogress";
        }

        if (bid == "XX") {
            // redouble could be done only on existing contract
            if (this.state.activeContract == null) {
                throw new InvalidBid("redouble on no contract");
            }

            if (this.state.activeContract.status != "X") {
                throw new InvalidBid("redouble on non-doubled contract");
            }

            if (!samePairs(this.state.activeContract.side, this.state.currentSide)) {
                throw new InvalidBid("redouble on non-own contract");
            }

            this.state.activeContract.status = "XX";
            this.clearPasses();
            this.next();
            return "inprogress";
        }

        // the rest is a contract bid
        if (this.state.activeContract == null) {
            this.setContractFromBid(bid);
            this.clearPasses();
            this.next();
            return "inprogress";
        } else {
            // sanity check
            if (
                this.state.activeContract.side == this.state.currentSide &&
                this.state.activeContract.status == "free"
            ) {
                throw new Error("assertion error: free bid reached its declarer");
            }

            // contracts can only go up
            if (!contractHigher(bid, this.state.activeContract.contract)) {
                throw new InvalidBid("the contract is not higher than previous");
            }

            this.setContractFromBid(bid);
            this.clearPasses();
            this.next();
            return "inprogress";
        }
    }

    turn(): Side {
        return this.state.currentSide;
    }
}

export function createBidding(dealer: Side): Bidding {
    return new BiddingImpl(dealer);
}

export const __test__ = {
    denominationHigher,
    contractHigher,
};
