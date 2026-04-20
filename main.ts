import { serveDir } from "@std/http/file-server";

import { ALL_SIDES, Side } from "./game/common.ts";
import { createEngine } from "./game/engine.ts";
import { ConnectionManager, createConnectionManager } from "./connection.ts";

import settings from "./settings.json" with { type: "json" };

type Tokens = Record<Side, string | null>;
type Table = {
    name: string;
    accessToken: string;
    playerTokens: Tokens;
    manager: ConnectionManager;
};
type App = {
    tables: Table[];
    hostname: string;
};

const ACCESS_ROUTE = new URLPattern({
    pathname: "/:access/:player/*",
});
const GAME_ROUTE = new URLPattern({
    pathname: "/:access/:player/game",
});
const FILE_ROUTE = new URLPattern({
    pathname: "/:access/:player/static/*",
});

function handleGameRoute(
    req: Request,
    player: Side,
    hostname: string,
    manager: ConnectionManager,
): Response {
    if (req.headers.get("origin") != hostname) {
        return new Response(null, { status: 400 });
    }

    if (req.headers.get("upgrade") != "websocket") {
        return new Response(null, { status: 426 });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    manager.register(player, socket);
    return response;
}

function handleFileRoute(
    req: Request,
    prefix: string,
): Response | Promise<Response> {
    return serveDir(req, {
        fsRoot: "static",
        urlRoot: `${prefix}/static`,
    });
}

function parseUrl(url: string): [string, string] | null {
    const match = ACCESS_ROUTE.exec(url);
    if (!match) {
        return null;
    }

    const accessToken = match.pathname.groups["access"];
    const playerToken = match.pathname.groups["player"];
    if (!accessToken || !playerToken) {
        return null;
    }

    return [accessToken, playerToken];
}

function matchesTable(access: string, player: string, table: Table): Side | null {
    if (access == table.accessToken) {
        for (const side of ALL_SIDES) {
            if (player === table.playerTokens[side]) {
                return side;
            }
        }
    }
    return null;
}

function handler(req: Request, app: App): Response | Promise<Response> {
    const res = parseUrl(req.url);
    if (!res) {
        return new Response("400 Bad Request", { status: 400 });
    }

    const [access, player] = res;
    for (const table of app.tables) {
        const side = matchesTable(access, player, table);
        if (side) {
            if (GAME_ROUTE.exec(req.url)) {
                return handleGameRoute(req, side, app.hostname, table.manager);
            }
            if (FILE_ROUTE.exec(req.url)) {
                return handleFileRoute(req, `${access}/${player}`);
            }
        }
    }

    return new Response("404 Not Found", { status: 404 });
}

function createTable(name: string, tweaks?: { biddingOnly: boolean }): Table {
    const accessToken = crypto.randomUUID();
    const playerTokens: Tokens = (() => {
        if (tweaks && tweaks.biddingOnly) {
            return {
                "N": crypto.randomUUID(),
                "S": crypto.randomUUID(),
                "W": null,
                "E": null,
            };
        } else {
            return {
                "N": crypto.randomUUID(),
                "E": crypto.randomUUID(),
                "S": crypto.randomUUID(),
                "W": crypto.randomUUID(),
            };
        }
    })();

    return {
        name,
        accessToken,
        playerTokens,
        manager: createConnectionManager(createEngine(), tweaks),
    };
}

function main() {
    const tables = [
        createTable("FullPlay A"),
        createTable("FullPlay B"),
        createTable("Bidding A", { biddingOnly: true }),
        createTable("Bidding B", { biddingOnly: true }),
    ];

    const hostname = `https://${settings.hostname}:${settings.port}`;
    const app = { tables, hostname };

    Deno.serve(
        {
            hostname: settings.hostname,
            port: settings.port,
            cert: Deno.readTextFileSync(settings.cert),
            key: Deno.readTextFileSync(settings.key),
        },
        (req) => handler(req, app),
    );

    // dump the invite URLs to the console
    for (const table of tables) {
        console.log(`table: ${table.name}`);
        const access = table.accessToken;
        for (const side of ALL_SIDES) {
            const token = table.playerTokens[side];
            if (!token) {
                continue;
            }
            const url = `${hostname}/${access}/${token}/static/index.html`;
            console.log(`${side}: ${url}`);
        }
    }
}

main();
