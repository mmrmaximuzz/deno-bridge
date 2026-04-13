import { serveDir } from "@std/http/file-server";
import { ALL_SIDES, Side } from "./game/common.ts";

import settings from "./settings.json" with { type: "json" };

type Tokens = Record<Side, string>;

function verifyTokens(
    match: URLPatternResult | null,
    accessToken: string,
    playerTokens: Tokens,
): { player: Side; prefix: string } | null {
    if (!match) {
        return null;
    }
    const inputAccessToken = match.pathname.groups["access"];
    const playerAccessToken = match.pathname.groups["player"];
    if (!inputAccessToken || !playerAccessToken) {
        return null;
    }

    if (inputAccessToken != accessToken) {
        return null;
    }

    for (const player of ALL_SIDES) {
        const playerToken = playerTokens[player];
        if (playerAccessToken == playerToken) {
            return { player: player, prefix: `${accessToken}/${playerToken}` };
        }
    }
    return null;
}

const ACCESS_ROUTE = new URLPattern({
    pathname: "/:access/:player/*",
});
const GAME_ROUTE = new URLPattern({
    pathname: "/:access/:player/game",
});
const FILE_ROUTE = new URLPattern({
    pathname: "/:access/:player/static/*",
});

function handleGameRoute(req: Request, player: Side, hostname: string): Response {
    if (req.headers.get("upgrade") != "websocket") {
        return new Response(null, { status: 426 });
    }

    if (req.headers.get("origin") != hostname) {
        return new Response(null, { status: 400 });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.addEventListener("open", () => {
        console.log("a client connected!");
    });

    socket.addEventListener("message", (event) => {
        if (event.data === "ping") {
            socket.send("pong");
        }
    });
    return response;
}

function handleFileRoute(req: Request, prefix: string): Promise<Response> {
    return serveDir(req, {
        fsRoot: "static",
        urlRoot: `${prefix}/static`,
    });
}

function handler(
    req: Request,
    opts: { accessToken: string; playerTokens: Tokens; hostname: string },
): Response | Promise<Response> {
    const accessMatch = ACCESS_ROUTE.exec(req.url);
    const client = verifyTokens(accessMatch, opts.accessToken, opts.playerTokens);
    if (!client) {
        return new Response("400 Bad Request", { status: 400 });
    }

    if (GAME_ROUTE.exec(req.url)) {
        return handleGameRoute(req, client.player, opts.hostname);
    }
    if (FILE_ROUTE.exec(req.url)) {
        return handleFileRoute(req, client.prefix);
    }

    return new Response("404 Not Found", { status: 404 });
}

function main() {
    console.log(`Welcome to the Deno Bridge.`);

    const accessToken: string = crypto.randomUUID();
    const playerTokens: Tokens = {
        "N": crypto.randomUUID(),
        "E": crypto.randomUUID(),
        "S": crypto.randomUUID(),
        "W": crypto.randomUUID(),
    };

    // dump the invite URLs to the console
    for (const side of ALL_SIDES) {
        const playerToken = playerTokens[side];
        const url =
            `http://${settings.hostname}:${settings.port}/${accessToken}/${playerToken}/static/index.html`;
        console.log(`${side} - ${url}`);
    }

    Deno.serve(
        { hostname: settings.hostname, port: settings.port },
        (req) =>
            handler(req, {
                accessToken,
                playerTokens,
                hostname: `http://${settings.hostname}:${settings.port}`,
            }),
    );
}

main();
