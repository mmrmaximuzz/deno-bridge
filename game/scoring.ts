import { FinalContract } from "./bidding.ts";
import { Level, Vulnerability } from "./types.ts";
import { getPair } from "./utils.ts";

function levelToTricks(level: Level): number {
    return level + 6;
}

function scoreContractFailed(
    contract: FinalContract,
    isVuln: boolean,
    underTricks: number,
): number {
    if (underTricks <= 0) {
        throw new Error(`AssertionError: ${underTricks}`);
    }

    switch (contract.status) {
        case "FREE":
            if (!isVuln) {
                return underTricks * (-50);
            } else {
                return underTricks * (-100);
            }
        case "X":
            if (!isVuln) {
                switch (underTricks) {
                    case 1:
                        return -100;
                    case 2:
                        return -300;
                    case 3:
                        return -500;
                    default:
                        return -500 + (-300) * (underTricks - 3);
                }
            } else {
                switch (underTricks) {
                    case 1:
                        return -200;
                    case 2:
                        return -500;
                    default:
                        return -500 + (-300) * (underTricks - 2);
                }
            }
        case "XX":
            if (!isVuln) {
                switch (underTricks) {
                    case 1:
                        return -200;
                    case 2:
                        return -600;
                    case 3:
                        return -1000;
                    default:
                        return -1000 + (-600) * (underTricks - 3);
                }
            } else {
                switch (underTricks) {
                    case 1:
                        return -400;
                    default:
                        return -400 + (-600) * (underTricks - 1);
                }
            }
    }
}

function scoreBaseContract(contract: FinalContract) {
    const denom = contract.contract.denom;
    const level = contract.contract.level;

    const base = (() => {
        switch (denom) {
            case "C":
            case "D":
                // minor suit contracts
                return level * 20;
            case "H":
            case "S":
                // major suit contracts
                return level * 30;
            case "NT":
                // notrump contracts
                return level * 30 + 10;
        }
    })();

    // doubled or redoubled
    switch (contract.status) {
        case "FREE":
            return base;
        case "X":
            return base * 2;
        case "XX":
            return base * 4;
    }
}

function scoreBonuses(contract: FinalContract, isVuln: boolean, baseScore: number): number {
    let bonus = 0;

    if (baseScore >= 100) {
        if (!isVuln) {
            bonus += 300; // nonvulnerable game
        } else {
            bonus += 500; // vulnerable game
        }
    } else {
        bonus += 50; // partial bonus
    }

    // slam / grand-slam bonuses
    switch (contract.contract.level) {
        case 6:
            if (!isVuln) {
                bonus += 500;
            } else {
                bonus += 750;
            }
            break;
        case 7:
            if (!isVuln) {
                bonus += 1000;
            } else {
                bonus += 1500;
            }
            break;
    }

    // insult bonuses
    if (contract.status == "X") {
        bonus += 50;
    } else if (contract.status == "XX") {
        bonus += 100;
    }

    return bonus;
}

function scoreOvertricks(contract: FinalContract, isVuln: boolean, overTricks: number): number {
    if (contract.status == "FREE") {
        switch (contract.contract.denom) {
            case "C":
            case "D":
                return overTricks * 20;
            case "H":
            case "S":
            case "NT":
                return overTricks * 30;
        }
    } else if (contract.status == "X") {
        if (!isVuln) {
            return overTricks * 100;
        } else {
            return overTricks * 200;
        }
    } else if (contract.status == "XX") {
        if (!isVuln) {
            return overTricks * 200;
        } else {
            return overTricks * 400;
        }
    }
    throw new Error("AssertionError: unreachable");
}

function scoreContractSuccess(
    contract: FinalContract,
    isVuln: boolean,
    overTricks: number,
): number {
    if (overTricks < 0) {
        throw new Error(`AssertionError: ${overTricks}`);
    }

    const baseScore = scoreBaseContract(contract);
    const bonusScore = scoreBonuses(contract, isVuln, baseScore);
    const overtrickScore = scoreOvertricks(contract, isVuln, overTricks);
    return baseScore + bonusScore + overtrickScore;
}

export function scoreContract(
    contract: FinalContract,
    vuln: Vulnerability,
    declarerTricks: number,
): number {
    const tricksRequired = levelToTricks(contract.contract.level);
    const isVuln = getPair(contract.declarer) == vuln || vuln == "BOTH";
    if (declarerTricks < tricksRequired) {
        const diff = tricksRequired - declarerTricks;
        return scoreContractFailed(contract, isVuln, diff);
    } else {
        const diff = declarerTricks - tricksRequired;
        return scoreContractSuccess(contract, isVuln, diff);
    }
}
