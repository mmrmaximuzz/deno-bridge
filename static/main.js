"use strict";

/**
 * @typedef {object} App - application data
 * @property {WebSocket} sock - WebSocket connection to the game server
 */

/**
 * @return {WebSocket}
 */
function connectToGameServer() {
    const path = location.pathname;
    const basePath = path.split("/static/")[0];
    const wsUrl = `ws://${location.host}${basePath}/game`;
    return new WebSocket(wsUrl);
}

/**
 * @param {number} level - contract level
 * @param {string} denom - contract denomination (suit or NT)
 *
 * @return {string} - JSON representation of the message
 */
function createContractBidMessage(level, denom) {
    return JSON.stringify({
        kind: "engine",
        data: {
            kind: "auction",
            bid: { level, denom },
        },
    });
}

/**
 * @return {string} - JSON representation of the message
 */
function createPassMessage() {
    return JSON.stringify({
        kind: "engine",
        data: {
            kind: "auction",
            bid: "pass",
        },
    });
}

/**
 * @return {string} - JSON representation of the message
 */
function createDoubleMessage() {
    return JSON.stringify({
        kind: "engine",
        data: {
            kind: "auction",
            bid: "X",
        },
    });
}

/**
 * @return {string} - JSON representation of the message
 */
function createRedoubleMessage() {
    return JSON.stringify({
        kind: "engine",
        data: {
            kind: "auction",
            bid: "XX",
        },
    });
}

/**
 * Create text message for the chat.
 * @param {string} text - text message
 *
 * @return {string} - JSON representation of the message
 */
function createTextMessage(text) {
    return JSON.stringify({
        kind: "chat",
        data: text,
    });
}

/**
 * @return {string} - JSON representation of the message
 */
function createInitMessage() {
    return JSON.stringify({
        kind: "init",
    });
}

/**
 * @param {Element} elem - Bid Element
 *
 * @param {App} app - application data
 */
function handleBidClick(elem, app) {
    const items = elem.id.replace("bid-", "").split("-");
    const level = Number(items[0]);
    if (level) {
        // normal contract bids
        const rawDenom = items[1];
        const denom = rawDenom == "n" ? "NT" : rawDenom.toUpperCase();
        app.sock.send(createContractBidMessage(level, denom));
    } else {
        // special bids
        const special = items[1];
        switch (special) {
            case "pass":
                app.sock.send(createPassMessage());
                break;
            case "x":
                app.sock.send(createDoubleMessage());
                break;
            case "xx":
                app.sock.send(createRedoubleMessage());
                break;
            default:
                throw new Error(`AssertionError: bad special bid: ${special}`);
        }
    }
}

/**
 * @param {string} message - message to print
 * @param {string} styleName - additional style name for the message
 *
 * @return {void}
 */
function printMessage(message, styleName) {
    const messages = document.getElementById("messages");
    if (!messages) {
        throw new Error("Fatal: messages element not found");
    }

    const time = new Date().toLocaleTimeString();
    const line = document.createElement("div");
    line.innerText = `${time}: ${message}`;
    line.setAttribute("class", styleName);

    // append the line and scroll the messages window
    messages.appendChild(line);
    messages.scrollTop = line.offsetTop;
}

/**
 * @param {string} message - error message to print
 *
 * @return {void}
 */
function printErrorMessage(message) {
    printMessage(message, "error");
}

/**
 * @param {string} message - error message to print
 *
 * @return {void}
 */
function printNotificationMessage(message) {
    printMessage(message, "notification");
}

/**
 * @param {string} message - error message to print
 *
 * @return {void}
 */
function printChatMessage(message) {
    printMessage(message, "chat");
}

/**
 * @param {{ kind?: string; data?: unknown }} message - application data
 *
 * @return {void}
 */
function processMessage(message) {
    switch (message.kind) {
        case "chat":
            if (typeof (message.data) != "string") {
                printErrorMessage(`invalid chat data from server: ${message.data}`);
                return;
            }
            printChatMessage(message.data);
            return;
        case "error":
            if (typeof (message.data) != "string") {
                printErrorMessage(`invalid error message from server: ${message.data}`);
                return;
            }
            printErrorMessage(message.data);
            return;
        case "notify":
            if (typeof (message.data) != "string") {
                printErrorMessage(`invalid notification message from server: ${message.data}`);
                return;
            }
            printNotificationMessage(message.data);
            return;
        default:
            printErrorMessage(`invalid message kind from server: ${message.kind}`);
            return;
    }
}

/**
 * @param {App} app - application data
 *
 * @return {void}
 */
function handleSubmit(app) {
    const input = document.getElementById("chat-input");
    if (!input) {
        printErrorMessage("AssertionError: failed to find chat input element");
        return;
    }
    if (!(input instanceof HTMLInputElement)) {
        printErrorMessage("AssertionError: bad input element type");
        return;
    }

    const text = input.value;
    input.value = ""; // flush the message text

    app.sock.send(createTextMessage(text));
}

/**
 * @param {MessageEvent} event - application data
 *
 * @return {void}
 */
function handleServerMessage(event) {
    /** @type {unknown} */
    const data = event.data;
    if (typeof data != "string") {
        printErrorMessage(`got non-string data from server: ${data}`);
        return;
    }

    /** @type {unknown} */
    let rawMessage = null;
    try {
        rawMessage = JSON.parse(data);
    } catch (e) {
        if (e instanceof SyntaxError) {
            printErrorMessage(`failed to parse JSON string from server: ${data}`);
        } else {
            printErrorMessage(`unknown exception on ${data}: ${e}`);
            throw e;
        }
        return;
    }

    if (typeof rawMessage != "object" || rawMessage == null) {
        printErrorMessage(`got bad message type from server: ${typeof rawMessage} (${data})`);
        return;
    }

    processMessage(rawMessage);
}

/**
 * @param {App} app - application data
 *
 * @return {void}
 */
function handleSocketConnect(app) {
    // schedule initialization event immediately after handling open
    setTimeout(() => {
        app.sock.send(createInitMessage());
    });
}

/**
 * @param {App} app - application data
 *
 * @return {void}
 */
function registerEvents(app) {
    // register UI clicks
    const bidElems = document.getElementsByClassName("bid");
    if (!bidElems) {
        printErrorMessage("AssertionError: bid elements not found");
        return;
    }
    for (let i = 0; i < bidElems.length; ++i) {
        const elem = bidElems[i];
        elem.addEventListener("click", () => {
            handleBidClick(elem, app);
        });
    }

    // register chat input form
    const form = document.getElementById("chat-form");
    if (!form) {
        printErrorMessage("AssertionError: chat form not found");
        return;
    }
    form.onsubmit = () => {
        handleSubmit(app);
        // the form is sent via the websocket, prevent default browser submit
        return false;
    };

    // attach websocket hooks
    app.sock.onmessage = handleServerMessage;
    app.sock.onopen = () => handleSocketConnect(app);
}

function main() {
    /** @type {App} */
    const app = {
        sock: connectToGameServer(),
    };
    registerEvents(app);
}

globalThis.addEventListener("load", main);
