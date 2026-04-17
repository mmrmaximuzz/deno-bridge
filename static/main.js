"use strict";

/**
 * @typedef { "W" | "N" | "E" | "S" } Side - player side
 * @typedef { 1 | 2 | 3 | 4 | 5 | 6 | 7 } Level - contract level
 * @typedef { "C" | "D" | "H" | "S" | "NT" } Denomination - contract denomination
 * @typedef { { level: Level; denom: Denomination } } Contract - contract bid
 * @typedef { "PASS" | "X" | "XX" | Contract } Bid - auction bid
 * @typedef {Bid[]} AuctionHistory - history of bids
 * @typedef { "C" | "D" | "H" | "S" } Suit - card suit
 * @typedef { 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 } Rank - card suit
 * @typedef { [Suit, Rank] } Card - playing card
 *
 * @typedef {object} App - application data
 * @property {WebSocket} sock - WebSocket connection to the game server
 * @property {[Bid, number][]} pending - pending updates if any
 * @property {Side} [mySide] - current's player table position
 * @property {number} [gen] - current generation of the engine state
 */

/**
 * @param {string} id
 * @return {HTMLElement}
 */
function assertGetElementById(id) {
    const elem = document.getElementById(id);
    if (!elem) {
        throw new Error(`failed to find html element for id ${id}`);
    }
    return elem;
}

/**
 * @param {string} name
 * @return {HTMLCollectionOf<Element>}
 */
function assertGetElementsByClassName(name) {
    const elem = document.getElementsByClassName(name);
    if (!elem) {
        throw new Error(`failed to find html element for class ${name}`);
    }
    return elem;
}

/**
 * @param {Side} side
 * @return {Side}
 */
function nextSide(side) {
    switch (side) {
        case "W":
            return "N";
        case "N":
            return "E";
        case "E":
            return "S";
        case "S":
            return "W";
        default:
            throw new Error("unreachable");
    }
}

/**
 * @param {unknown} raw - input object
 * @return {Side | null}
 */
function parseSide(raw) {
    switch (raw) {
        case "W":
        case "N":
        case "E":
        case "S":
            return raw;
        default:
            return null;
    }
}

/**
 * @param {unknown} raw - input object
 * @return {Level | null}
 */
function parseLevel(raw) {
    switch (raw) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
            return raw;
        default:
            return null;
    }
}

/**
 * @param {unknown} raw - input object
 * @return {Denomination | null}
 */
function parseDenomination(raw) {
    switch (raw) {
        case "C":
        case "D":
        case "H":
        case "S":
        case "NT":
            return raw;
        default:
            return null;
    }
}

/**
 * @param {unknown} raw - raw data to parse
 * @return {Bid | null}
 */
function parseBid(raw) {
    switch (raw) {
        case "PASS":
        case "X":
        case "XX":
            return raw;
        default:
            if (!raw || typeof raw != "object" || !("level" in raw && "denom" in raw)) {
                return null;
            } else {
                const level = parseLevel(raw.level);
                const denom = parseDenomination(raw.denom);
                if (!level || !denom) {
                    return null;
                }
                return { level, denom };
            }
    }
}

/**
 * @param {unknown} raw - raw data to parse
 * @return {AuctionHistory | null}
 */
function parseAuctionHistory(raw) {
    /** @type AuctionHistory */
    const result = [];

    if (!(raw instanceof Array)) {
        return null;
    }
    for (const rawItem of raw) {
        const bid = parseBid(rawItem);
        if (!bid) {
            return null;
        }
        result.push(bid);
    }
    return result;
}

/**
 * @param {unknown} raw
 * @return {Suit | null}
 */
function parseSuit(raw) {
    switch (raw) {
        case "C":
        case "D":
        case "H":
        case "S":
            return raw;
        default:
            return null;
    }
}

/**
 * @param {unknown} raw
 * @return {Rank | null}
 */
function parseRank(raw) {
    switch (raw) {
        case 0:
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
        case 8:
        case 9:
        case 10:
        case 11:
        case 12:
            return raw;
        default:
            return null;
    }
}

/**
 * @param {unknown} rawDeal - deal object from server
 * @return {[Suit, Rank][] | null}
 */
function parseDeal(rawDeal) {
    if (!(rawDeal instanceof Array)) {
        return null;
    }

    /** @type [Suit, Rank][] */
    const result = [];
    for (const rawItem of rawDeal) {
        if (!(rawItem instanceof Array) || rawItem.length != 2) {
            return null;
        }
        const [rawSuit, rawRank] = rawItem;
        const suit = parseSuit(rawSuit);
        const rank = parseRank(rawRank);
        if (suit == null || rank == null) {
            return null;
        }
        result.push([suit, rank]);
    }
    return result.sort((a, b) => {
        if (a[0] > b[0]) {
            return 1;
        }
        if (a[0] < b[0]) {
            return -1;
        }
        if (a[1] > b[1]) {
            return 1;
        }
        if (a[1] < b[1]) {
            return -1;
        }
        return 0;
    }).reverse();
}

/**
 * @param {Contract} b1 - 1st operand of >=
 * @param {Contract} b2 - 2nd operand of >=
 * @return {boolean}
 */
function contractGreaterOrEqual(b1, b2) {
    if (b1.level > b2.level) {
        return true;
    }

    if (b1.level == b2.level) {
        switch (b1.denom) {
            case "NT":
                return true;
            default:
                return b2.denom != "NT" && b1.denom >= b2.denom;
        }
    }

    return false;
}

/**
 * @param {Suit} suit - suit to print
 * @return {[string, string]}
 */
function suitPrettyPrint(suit) {
    switch (suit) {
        case "C":
            return ["♣", "suit-c"];
        case "D":
            return ["♦", "suit-d"];
        case "H":
            return ["♥", "suit-h"];
        case "S":
            return ["♠", "suit-s"];
        default:
            throw new Error("unreachable");
    }
}

/**
 * @param {Bid} bid - bid to print
 * @return {[string, string | undefined]}
 */
function bidPrettyText(bid) {
    if (typeof bid == "string") {
        return [bid, undefined];
    }

    const [prettyDenom, style] = (() => {
        switch (bid.denom) {
            case "C":
            case "D":
            case "H":
            case "S":
                return suitPrettyPrint(bid.denom);
            case "NT":
                return ["NT", undefined];
            default:
                throw new Error("AssertionError: unreachable");
        }
    })();

    return [`${bid.level}${prettyDenom}`, style];
}

/**
 * @param {Side} dealer - the dealer in this bidding
 * @return {void}
 */
function auctionHistorySetDealer(dealer) {
    const history = assertGetElementById("auction-history");
    if (!(history instanceof HTMLTableElement)) {
        throw new Error("bad type");
    }

    // initialize the first row
    const firstRow = history.insertRow(-1);
    for (let i = 0; i < 4; ++i) {
        // FIXME: this hack forces table to display the new row when West deals
        firstRow.insertCell(-1).innerHTML = "&nbsp;";
    }

    // stab skipped cells with a dash
    for (let i = 0; i < firstRow.cells.length; ++i) {
        const headerCell = history.rows[0].cells[i];
        if (headerCell.innerText == dealer) {
            break;
        }
        firstRow.cells[i].innerText = "-";
    }
}

/**
 * @param {Bid} bid - bid
 * @return {void}
 */
function auctionHistoryAdd(bid) {
    const history = assertGetElementById("auction-history");
    if (!history || !(history instanceof HTMLTableElement)) {
        throw new Error("failed to find auction-history element");
    }

    // check if the last row is full
    let lastRow = history.rows[history.rows.length - 1];
    if (lastRow.cells[3].innerHTML != "&nbsp;") {
        lastRow = history.insertRow(-1);
        for (let i = 0; i < 4; ++i) {
            lastRow.insertCell(-1).innerHTML = "&nbsp;";
        }
    }

    for (let i = 0; i < lastRow.cells.length; ++i) {
        if (lastRow.cells[i].innerHTML == "&nbsp;") {
            const [prettyText, style] = bidPrettyText(bid);
            lastRow.cells[i].innerText = prettyText;
            if (style) {
                lastRow.cells[i].className = style;
            }
            break;
        }
    }
}

/**
 * @param {Rank} rank
 * @return {string}
 */
function rankPrettyPrint(rank) {
    switch (rank) {
        case 0:
            return "2";
        case 1:
            return "3";
        case 2:
            return "4";
        case 3:
            return "5";
        case 4:
            return "6";
        case 5:
            return "7";
        case 6:
            return "8";
        case 7:
            return "9";
        case 8:
            return "t";
        case 9:
            return "J";
        case 10:
            return "Q";
        case 11:
            return "K";
        case 12:
            return "A";
        default:
            throw new Error("unreachable");
    }
}

/**
 * @return {void}
 */
function resetUI() {
    const auctionHistory = assertGetElementById("auction-history");
    if (!(auctionHistory instanceof HTMLTableElement)) {
        throw new Error("bad auction-history elem");
    }

    // remove all items from bid history except the header
    while (auctionHistory.rows.length != 1) {
        auctionHistory.rows[1].remove();
    }

    // make all bids visible again
    mapBidElems((elem) => elem.style["visibility"] = "visible");

    // remove all the cards from the players
    for (const pos of ["bottom", "left", "top", "right"]) {
        const playerHand = assertGetElementById(`${pos}-hand`);
        playerHand.replaceChildren();
    }
}

/**
 * @param {[Suit, Rank][]} hand - player hand to display
 */
function displayPlayerHand(hand) {
    const bHandElem = assertGetElementById("bottom-hand");

    /** @type {Record<Suit, [Rank, string][]>} */
    const template = {
        S: [],
        H: [],
        D: [],
        C: [],
    };

    /** @type {Suit[]} */
    const ALL_SUITS_ORDERED = ["S", "H", "D", "C"];

    for (const [suit, rank] of hand) {
        const repr = rankPrettyPrint(rank);
        template[suit].push([rank, repr]);
    }

    const handDiv = document.createElement("div");
    for (const suit of ALL_SUITS_ORDERED) {
        const [suitRepr, suitStyle] = suitPrettyPrint(suit);
        const suitDiv = document.createElement("div");
        suitDiv.className = suitStyle;
        suitDiv.innerText = suitRepr;
        for (const [_, rankRepr] of template[suit]) {
            suitDiv.innerText += ` ${rankRepr}`;
        }
        handDiv.appendChild(suitDiv);
    }
    bHandElem.appendChild(handDiv);
}

/**
 * @param {{ phase?: unknown; bidHistory?: unknown; deal?: unknown }} raw - raw data
 * @return {boolean}
 */
function handleInitialState(raw) {
    if (!(raw.bidHistory instanceof Array) || raw.bidHistory.length != 2) {
        printErrorMessage(`init state: bad bid history: ${JSON.stringify(raw.bidHistory)}`);
        return false;
    }

    const [rawDealer, rawHistory] = raw.bidHistory;
    const dealer = parseSide(rawDealer);
    const history = parseAuctionHistory(rawHistory);
    const cards = parseDeal(raw.deal);
    if (!dealer || !history || !cards) {
        printErrorMessage(`init state: bad init object: ${JSON.stringify(raw)}`);
        return false;
    }

    displayPlayerHand(cards);
    auctionHistorySetDealer(dealer);

    let lastContract = null;
    for (const bid of history) {
        auctionHistoryAdd(bid);

        // if bid is a contract, save the last item to disable lesser bids
        if (typeof bid != "string") {
            lastContract = bid;
        }
    }

    if (lastContract) {
        disableInactiveBids(lastContract);
    }
    return true;
}

/**
 * @return {WebSocket}
 */
function connectToGameServer() {
    const path = location.pathname;
    const basePath = path.split("/static/")[0];
    const wsUrl = `wss://${location.host}${basePath}/game`;
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
            bid: "PASS",
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
 * @return {string} - JSON representation of the message
 */
function createInitMessage() {
    return JSON.stringify({
        kind: "engine",
        data: {
            kind: "init",
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
 * @param {Element} elem - Bid Element
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
    const messages = assertGetElementById("messages");
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
 * @param {string} id
 * @return {Contract}
 */
function assertElem2Contract(id) {
    const [_, rawLevel, rawDenom] = id.split("-");
    const level = parseLevel(Number(rawLevel));
    const denom = parseDenomination(rawDenom == "n" ? "NT" : rawDenom.toUpperCase());
    if (!level || !denom) {
        throw new Error(`AssertionError: failed to parse ${id}`);
    }
    return { level, denom };
}

/**
 * @param {Bid} bid - the latest bid
 */
function disableInactiveBids(bid) {
    if (typeof bid == "string") {
        // non-contract bids
        return;
    }
    mapBidElems((elem) => {
        if (elem.id.search("0") != -1) {
            // skip non-contract elems
            return;
        }
        const elemContract = assertElem2Contract(elem.id);
        if (contractGreaterOrEqual(bid, elemContract)) {
            elem.style["visibility"] = "hidden";
        }
    });
}

/**
 * @param {Side} mySide
 * @return {void}
 */
function labelPlayerSides(mySide) {
    let side = mySide;
    for (const pos of ["bottom", "left", "top", "right"]) {
        assertGetElementById(`${pos}-side`).innerText = side;
        side = nextSide(side);
    }
}

/**
 * @param {App} app - application data
 * @param {{ side?: unknown; state?: unknown; gen?: unknown }} data - current engine state
 *
 * @return {void}
 */
function processInitMessage(app, data) {
    const side = parseSide(data.side);
    if (!side) {
        printErrorMessage(`bad initialization state: bad side ${side}`);
        return;
    }

    if (typeof data.gen != "number") {
        printErrorMessage(`bad init state: gen number is ${data.gen}`);
        return;
    }
    if (!data.state || typeof data.state != "object") {
        printErrorMessage(`bad initialization state: ${JSON.stringify(data.state)}`);
        return;
    }
    const done = handleInitialState(data.state);
    if (!done) {
        printErrorMessage(`failed to handle init state: ${JSON.stringify(data.state)}`);
        return;
    }

    labelPlayerSides(side);
    app.mySide = side;
    app.gen = data.gen;
    // apply pending updates if any
    for (const [pending, gen] of app.pending) {
        processBidMessage(app, pending, gen);
    }
}

/**
 * @param {App} app - application data
 * @param {Bid} bid - input bid
 * @param {number} gen - the message generation
 * @return {void}
 */
function processBidMessage(app, bid, gen) {
    if (app.gen == undefined) {
        // didn't receive the initial message, delay handling
        app.pending.push([bid, gen]);
        return;
    }
    if (app.gen >= gen) {
        // outdated message, ignore
        return;
    }
    disableInactiveBids(bid);
    auctionHistoryAdd(bid);
}

/**
 * @param {App} app - application data
 * @param {{ kind?: unknown; bid?: unknown; gen?: unknown }} data - engine message
 * @return {void}
 */
function processEngineMessage(app, data) {
    switch (data.kind) {
        case "auction": {
            const bid = parseBid(data.bid);
            if (!bid) {
                printErrorMessage(
                    `failed to parse bid in engine message: ${JSON.stringify(data.bid)}`,
                );
                return;
            }
            if (typeof data.gen != "number") {
                printErrorMessage(`bad generation number in engine message: ${data.gen}`);
                return;
            }
            processBidMessage(app, bid, data.gen);
            break;
        }
        default:
            printErrorMessage(`bad engine message kind: ${data.kind}`);
            return;
    }
}

/**
 * @param {App} app - application data
 * @param {{ kind?: string; data?: unknown }} message - application data
 *
 * @return {void}
 */
function processMessage(app, message) {
    switch (message.kind) {
        case "chat":
            if (typeof message.data != "string") {
                printErrorMessage(`invalid chat data from server: ${message.data}`);
                return;
            }
            printChatMessage(message.data);
            return;
        case "error":
            if (typeof message.data != "string") {
                printErrorMessage(`invalid error message from server: ${message.data}`);
                return;
            }
            printErrorMessage(message.data);
            return;
        case "notify":
            if (typeof message.data != "string") {
                printErrorMessage(`invalid notification message from server: ${message.data}`);
                return;
            }
            printNotificationMessage(message.data);
            return;
        case "init":
            if (typeof message.data != "object" || message.data == null) {
                printErrorMessage(
                    `invalid initialization state from server: ${JSON.stringify(message.data)}`,
                );
                return;
            }
            processInitMessage(app, message.data);
            return;
        case "engine":
            if (typeof message.data != "object" || message.data == null) {
                printErrorMessage(
                    `invalid engine data from server: ${JSON.stringify(message.data)}`,
                );
                return;
            }
            processEngineMessage(app, message.data);
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
    const input = assertGetElementById("chat-input");
    if (!(input instanceof HTMLInputElement)) {
        printErrorMessage("AssertionError: bad input element type");
        return;
    }

    const text = input.value;
    if (input.value.trim() == "") {
        // protect against whitespaces message submit
        return;
    }
    input.value = ""; // flush the message text

    app.sock.send(createTextMessage(text));
}

/**
 * @param {App} app - application data
 * @param {MessageEvent} event - application data
 *
 * @return {void}
 */
function handleServerMessage(app, event) {
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

    processMessage(app, rawMessage);
}

/**
 * @param {App} app - application data
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
 * @param {HTMLButtonElement} button - "next" button
 * @return {void}
 */
function handleNextClick(app, button) {
    resetUI();
    app.sock.send(createInitMessage());
    button.disabled = true;
}

/**
 * @param { (arg0: HTMLElement) => void } f - function to apply
 * @return {void}
 */
function mapBidElems(f) {
    const bidElems = assertGetElementsByClassName("bid");
    for (let i = 0; i < bidElems.length; ++i) {
        const elem = bidElems[i];
        // dynamic cast
        if (!(elem instanceof HTMLElement)) {
            throw new Error("AssertionError: bid is not HTMLElement");
        }
        f(elem);
    }
}

/**
 * @param {App} app - application data
 *
 * @return {void}
 */
function registerEvents(app) {
    // register UI clicks
    mapBidElems((elem) => {
        elem.addEventListener("click", () => {
            handleBidClick(elem, app);
        });
    });

    // register chat input form
    const form = assertGetElementById("chat-form");
    form.onsubmit = () => {
        handleSubmit(app);
        // the form is sent via the websocket, prevent default browser submit
        return false;
    };

    // register next button
    const next = assertGetElementById("next-deal");
    if (!(next instanceof HTMLButtonElement)) {
        throw new Error("bad button type");
    }
    next.onclick = () => handleNextClick(app, next);

    // attach websocket hooks
    app.sock.onmessage = (e) => handleServerMessage(app, e);
    app.sock.onopen = () => handleSocketConnect(app);
}

function main() {
    const app = {
        sock: connectToGameServer(),
        pending: [],
        mySide: undefined,
        gen: undefined,
    };
    registerEvents(app);
}

globalThis.addEventListener("load", main);
