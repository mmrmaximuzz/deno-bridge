// SPDX-License-Identifier: GPL-3.0-or-later
import { assertEquals } from "@std/assert/equals";

import { ContractStatus, Denomination, Level, Vulnerability } from "../../shared/types.ts";

import { scoreContract } from "./scoring.ts";
import { FinalContract } from "./bidding.ts";

const ALL_VULNS: Vulnerability[] = ["NONE", "NS", "WE", "BOTH"];
const ALL_NS_VULNS: Vulnerability[] = ["NS", "BOTH"];
const ALL_NS_NONVULNS: Vulnerability[] = ["WE", "NONE"];

// helper to shorten test description
function s(cfg: string, vuln: Vulnerability): number {
    if (cfg.length < 3) {
        throw new Error(`AssertionError: ${cfg}`);
    }

    // parse level and denom
    const level: Level = (() => {
        const rawlevel = Number(cfg[0]);
        if (rawlevel >= 1 && rawlevel <= 7) {
            return rawlevel as Level;
        }
        throw new Error(`AssertionError: ${cfg}`);
    })();
    const denom: Denomination = (() => {
        const rawdenom = cfg[1];
        if (rawdenom == "C" || rawdenom == "D" || rawdenom == "H" || rawdenom == "S") {
            return rawdenom;
        }
        if (rawdenom == "N") {
            return "NT";
        }
        throw new Error(`AssertionError: ${cfg}`);
    })();

    // parse double/redouble if given
    const [pos, status]: [number, ContractStatus] = (() => {
        if (cfg[2] != "x") {
            return [2, "FREE"];
        }

        if (cfg[2] == "x" && cfg[3] != "x") {
            return [3, "X"];
        }

        if (cfg[2] == "x" && cfg[3] == "x" && cfg[4] != "x") {
            return [4, "XX"];
        }

        throw new Error(`AssertionError: ${cfg}`);
    })();

    const contract: FinalContract = { contract: { level, denom }, status, declarer: "S" };
    const tricksRequired = level + 6;
    if (tricksRequired > 13) {
        throw new Error(`AssertionError: ${cfg}`);
    }

    switch (cfg[pos]) {
        case "=":
            return scoreContract(contract, vuln, tricksRequired);
        case "+":
        case "-": {
            const delta = Number(cfg.slice(pos));
            return scoreContract(contract, vuln, tricksRequired + delta);
        }
        default:
            throw new Error(`AssertionError: ${cfg}`);
    }
}

Deno.test("first-level contracts", () => {
    for (const vuln of ALL_VULNS) {
        assertEquals(s("1C=", vuln), 70);
        assertEquals(s("1D=", vuln), 70);
        assertEquals(s("1H=", vuln), 80);
        assertEquals(s("1S=", vuln), 80);
        assertEquals(s("1N=", vuln), 90);
    }
});

Deno.test("pre-game contracts", () => {
    for (const vuln of ALL_VULNS) {
        assertEquals(s("2N=", vuln), 120);
        assertEquals(s("3S=", vuln), 140);
        assertEquals(s("3H=", vuln), 140);
        assertEquals(s("4D=", vuln), 130);
        assertEquals(s("4C=", vuln), 130);
    }
});

Deno.test("all game contracts", () => {
    for (const vuln of ALL_NS_NONVULNS) {
        assertEquals(s("3N=", vuln), 400);
        assertEquals(s("4S=", vuln), 420);
        assertEquals(s("4H=", vuln), 420);
        assertEquals(s("5D=", vuln), 400);
        assertEquals(s("5C=", vuln), 400);
    }

    for (const vuln of ALL_NS_VULNS) {
        assertEquals(s("3N=", vuln), 600);
        assertEquals(s("4S=", vuln), 620);
        assertEquals(s("4H=", vuln), 620);
        assertEquals(s("5D=", vuln), 600);
        assertEquals(s("5C=", vuln), 600);
    }
});

Deno.test("all small slams", () => {
    for (const vuln of ALL_NS_NONVULNS) {
        assertEquals(s("6C=", vuln), 920);
        assertEquals(s("6D=", vuln), 920);
        assertEquals(s("6H=", vuln), 980);
        assertEquals(s("6S=", vuln), 980);
        assertEquals(s("6N=", vuln), 990);
    }

    for (const vuln of ALL_NS_VULNS) {
        assertEquals(s("6C=", vuln), 1370);
        assertEquals(s("6D=", vuln), 1370);
        assertEquals(s("6H=", vuln), 1430);
        assertEquals(s("6S=", vuln), 1430);
        assertEquals(s("6N=", vuln), 1440);
    }
});

Deno.test("all grand slams", () => {
    for (const vuln of ALL_NS_NONVULNS) {
        assertEquals(s("7C=", vuln), 1440);
        assertEquals(s("7D=", vuln), 1440);
        assertEquals(s("7H=", vuln), 1510);
        assertEquals(s("7S=", vuln), 1510);
        assertEquals(s("7N=", vuln), 1520);
    }

    for (const vuln of ALL_NS_VULNS) {
        assertEquals(s("7C=", vuln), 2140);
        assertEquals(s("7D=", vuln), 2140);
        assertEquals(s("7H=", vuln), 2210);
        assertEquals(s("7S=", vuln), 2210);
        assertEquals(s("7N=", vuln), 2220);
    }
});

Deno.test("doubles and game promotion", () => {
    for (const vuln of ALL_NS_NONVULNS) {
        // base score of doubled 1-level
        assertEquals(s("1Cx=", vuln), 140);
        assertEquals(s("1Dx=", vuln), 140);
        assertEquals(s("1Hx=", vuln), 160);
        assertEquals(s("1Sx=", vuln), 160);
        assertEquals(s("1Nx=", vuln), 180);
        // 2maj/2nt doubled are games
        assertEquals(s("2Hx=", vuln), 470);
        assertEquals(s("2Sx=", vuln), 470);
        assertEquals(s("2Nx=", vuln), 490);
        // 3min doubled are games
        assertEquals(s("3Cx=", vuln), 470);
        assertEquals(s("3Dx=", vuln), 470);
    }

    for (const vuln of ALL_NS_VULNS) {
        // base score of doubled 1-level
        assertEquals(s("1Cx=", vuln), 140);
        assertEquals(s("1Dx=", vuln), 140);
        assertEquals(s("1Hx=", vuln), 160);
        assertEquals(s("1Sx=", vuln), 160);
        assertEquals(s("1Nx=", vuln), 180);
        // 2maj/2nt doubled are games
        assertEquals(s("2Hx=", vuln), 670);
        assertEquals(s("2Sx=", vuln), 670);
        assertEquals(s("2Nx=", vuln), 690);
        // 3min doubled are games
        assertEquals(s("3Cx=", vuln), 670);
        assertEquals(s("3Dx=", vuln), 670);
    }
});

Deno.test("redoubles and game promotion", () => {
    for (const vuln of ALL_NS_NONVULNS) {
        // 1min redoubled are still partials
        assertEquals(s("1Cxx=", vuln), 230);
        assertEquals(s("1Dxx=", vuln), 230);
        // 1maj/1nt redoubled are games
        assertEquals(s("1Hxx=", vuln), 520);
        assertEquals(s("1Sxx=", vuln), 520);
        assertEquals(s("1Nxx=", vuln), 560);
    }

    for (const vuln of ALL_NS_VULNS) {
        // 1min redoubled are still partials
        assertEquals(s("1Cxx=", vuln), 230);
        assertEquals(s("1Dxx=", vuln), 230);
        // 1maj/1nt redoubled are games
        assertEquals(s("1Hxx=", vuln), 720);
        assertEquals(s("1Sxx=", vuln), 720);
        assertEquals(s("1Nxx=", vuln), 760);
    }
});

Deno.test("undertricks/overtricks - free", () => {
    for (const vuln of ALL_NS_NONVULNS) {
        // undertricks
        assertEquals(s("3N-1", vuln), -50);
        assertEquals(s("4S-2", vuln), -100);
        assertEquals(s("3H-3", vuln), -150);
        assertEquals(s("5D-4", vuln), -200);
        // overtricks
        assertEquals(s("3N+1", vuln), 430);
        assertEquals(s("4S+1", vuln), 450);
        assertEquals(s("4H+2", vuln), 480);
        assertEquals(s("5D+1", vuln), 420);
    }

    for (const vuln of ALL_NS_VULNS) {
        // undertricks
        assertEquals(s("3N-1", vuln), -100);
        assertEquals(s("4S-2", vuln), -200);
        assertEquals(s("3H-3", vuln), -300);
        assertEquals(s("5D-4", vuln), -400);
        // overtricks
        assertEquals(s("3N+1", vuln), 630);
        assertEquals(s("4S+1", vuln), 650);
        assertEquals(s("4H+2", vuln), 680);
        assertEquals(s("5D+1", vuln), 620);
    }
});

Deno.test("undertricks/overtricks - double", () => {
    for (const vuln of ALL_NS_NONVULNS) {
        // undertricks
        assertEquals(s("3Nx-1", vuln), -100);
        assertEquals(s("4Sx-2", vuln), -300);
        assertEquals(s("3Hx-3", vuln), -500);
        assertEquals(s("5Dx-4", vuln), -800);
        assertEquals(s("5Dx-5", vuln), -1100);
        // overtricks
        assertEquals(s("3Nx+1", vuln), 650);
        assertEquals(s("4Sx+1", vuln), 690);
        assertEquals(s("4Hx+2", vuln), 790);
        assertEquals(s("5Dx+1", vuln), 650);
    }

    for (const vuln of ALL_NS_VULNS) {
        // undertricks
        assertEquals(s("3Nx-1", vuln), -200);
        assertEquals(s("4Sx-2", vuln), -500);
        assertEquals(s("3Hx-3", vuln), -800);
        assertEquals(s("5Dx-4", vuln), -1100);
        assertEquals(s("5Dx-5", vuln), -1400);
        // overtricks
        assertEquals(s("3Nx+1", vuln), 950);
        assertEquals(s("4Sx+1", vuln), 990);
        assertEquals(s("4Hx+2", vuln), 1190);
        assertEquals(s("5Dx+1", vuln), 950);
    }
});

Deno.test("undertricks/overtricks - redouble", () => {
    for (const vuln of ALL_NS_NONVULNS) {
        // undertricks
        assertEquals(s("3Nxx-1", vuln), -200);
        assertEquals(s("4Sxx-2", vuln), -600);
        assertEquals(s("3Hxx-3", vuln), -1000);
        assertEquals(s("5Dxx-4", vuln), -1600);
        assertEquals(s("5Dxx-5", vuln), -2200);
        // overtricks
        assertEquals(s("3Nxx+1", vuln), 1000);
        assertEquals(s("4Sxx+1", vuln), 1080);
        assertEquals(s("4Hxx+2", vuln), 1280);
        assertEquals(s("5Dxx+1", vuln), 1000);
    }

    for (const vuln of ALL_NS_VULNS) {
        // undertricks
        assertEquals(s("3Nxx-1", vuln), -400);
        assertEquals(s("4Sxx-2", vuln), -1000);
        assertEquals(s("3Hxx-3", vuln), -1600);
        assertEquals(s("5Dxx-4", vuln), -2200);
        assertEquals(s("5Dxx-5", vuln), -2800);
        // overtricks
        assertEquals(s("3Nxx+1", vuln), 1400);
        assertEquals(s("4Sxx+1", vuln), 1480);
        assertEquals(s("4Hxx+2", vuln), 1880);
        assertEquals(s("5Dxx+1", vuln), 1400);
    }
});

Deno.test("limit cases", () => {
    for (const vuln of ALL_NS_NONVULNS) {
        // 1min
        assertEquals(s("1C+6", vuln), 190);
        assertEquals(s("1Cx+6", vuln), 740);
        assertEquals(s("1Cxx+6", vuln), 1430);
        // 1maj
        assertEquals(s("1H+6", vuln), 260);
        assertEquals(s("1Hx+6", vuln), 760);
        assertEquals(s("1Hxx+6", vuln), 1720);
        // 1nt
        assertEquals(s("1N+6", vuln), 270);
        assertEquals(s("1Nx+6", vuln), 780);
        assertEquals(s("1Nxx+6", vuln), 1760);

        // all-down
        assertEquals(s("7N-13", vuln), -650);
        assertEquals(s("7Nx-13", vuln), -3500);
        assertEquals(s("7Nxx-13", vuln), -7000);
    }

    for (const vuln of ALL_NS_VULNS) {
        // 1min
        assertEquals(s("1D+6", vuln), 190);
        assertEquals(s("1Dx+6", vuln), 1340);
        assertEquals(s("1Dxx+6", vuln), 2630);
        // 1maj
        assertEquals(s("1S+6", vuln), 260);
        assertEquals(s("1Sx+6", vuln), 1360);
        assertEquals(s("1Sxx+6", vuln), 3120);
        // 1nt
        assertEquals(s("1N+6", vuln), 270);
        assertEquals(s("1Nx+6", vuln), 1380);
        assertEquals(s("1Nxx+6", vuln), 3160);

        // all-down
        assertEquals(s("7N-13", vuln), -1300);
        assertEquals(s("7Nx-13", vuln), -3800);
        assertEquals(s("7Nxx-13", vuln), -7600);
    }
});
