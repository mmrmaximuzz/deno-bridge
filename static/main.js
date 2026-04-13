"use strict";

function main() {
    const path = location.pathname;
    const basePath = path.split("/static/")[0];
    const wsUrl = `ws://${location.host}${basePath}/game`;
    const wSock = new WebSocket(wsUrl);
}

globalThis.addEventListener("load", main);
