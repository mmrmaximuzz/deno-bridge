"use strict";

/**
 * @typedef { "W" | "N" | "E" | "S" } Side - player side
 * @typedef { 1 | 2 | 3 | 4 | 5 | 6 | 7 } Level - contract level
 * @typedef { "C" | "D" | "H" | "S" | "NT" } Denomination - contract denomination
 * @typedef { { level: Level; denom: Denomination } } Contract - contract bid
 * @typedef { "PASS" | "X" | "XX" | Contract } Bid - auction bid
 * @typedef { Bid[] } AuctionHistory - history of bids
 * @typedef { "C" | "D" | "H" | "S" } Suit - card suit
 * @typedef { 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 } Rank - card suit
 * @typedef { [Suit, Rank] } Card - playing card
 * @typedef { Record<Side, Card[]> } Deal - full deal
 * @typedef { "NONE" | "NS" | "WE" | "BOTH" } Vulnerability - vulnerability state
 * @typedef { "bottom" | "left" | "top" | "right" } Position - table positions
 *
 * @typedef {object} App - application data
 * @property {WebSocket} sock - WebSocket connection to the game server
 * @property {[Side, Bid, number][]} pending - pending updates if any
 * @property {string | null} nickname - the player's nick name
 * @property {Side | null} mySide - current's player table position
 * @property {boolean} needFlushTable - whether we need to flush table or not
 * @property {number} gen - current generation of the engine state
 */

/** @type {Suit[]} */
const ALL_SUITS_ORDERED = ["S", "H", "D", "C"];
/** @type {Position[]} */
const ALL_POSITIONS = ["bottom", "left", "top", "right"];

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
        case 13:
        case 14:
            return raw;
        default:
            return null;
    }
}

/**
 * @param {unknown} rawCard - card data from server
 * @return {Card | null}
 */
function parseCard(rawCard) {
    if (!(rawCard instanceof Array) || rawCard.length != 2) {
        return null;
    }
    const [rawSuit, rawRank] = rawCard;
    const suit = parseSuit(rawSuit);
    const rank = parseRank(rawRank);
    if (suit == null || rank == null) {
        return null;
    }
    return [suit, rank];
}

/**
 * @param {unknown} rawLead - lead data from server
 * @return {[Side, Card] | null}
 */
function parseLead(rawLead) {
    if (!(rawLead instanceof Array) || rawLead.length != 2) {
        return null;
    }
    const [rawSide, rawCard] = rawLead;
    const side = parseSide(rawSide);
    const card = parseCard(rawCard);
    if (!side || !card) {
        return null;
    }
    return [side, card];
}

/**
 * @param {unknown} rawHand - hand data from server
 * @return {Card[] | null}
 */
function parseHand(rawHand) {
    if (!(rawHand instanceof Array)) {
        return null;
    }

    /** @type {Card[]} */
    const result = [];
    for (const rawItem of rawHand) {
        const card = parseCard(rawItem);
        if (!card) {
            return null;
        }
        result.push(card);
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
 * @param {unknown} rawDeal - deal data from server
 * @return {Deal | null}
 */
function parseFullDeal(rawDeal) {
    if (
        !rawDeal || typeof rawDeal != "object" || !("W" in rawDeal) || !("N" in rawDeal) ||
        !("E" in rawDeal) || !("S" in rawDeal)
    ) {
        return null;
    }
    const W = parseHand(rawDeal.W);
    const N = parseHand(rawDeal.N);
    const E = parseHand(rawDeal.E);
    const S = parseHand(rawDeal.S);
    if (!W || !N || !E || !S) {
        return null;
    }
    return { W, N, E, S };
}

/**
 * @param {unknown} raw - raw input data
 * @return {Vulnerability | null}
 */
function parseVulnerability(raw) {
    switch (raw) {
        case "NONE":
        case "NS":
        case "WE":
        case "BOTH":
            return raw;
        default:
            return null;
    }
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
 * @return {HTMLTableElement}
 */
function assertGetAuctionHistory() {
    const history = assertGetElementById("auction-history");
    if (!(history instanceof HTMLTableElement)) {
        throw new Error("bad type");
    }
    return history;
}

/**
 * @param {Side} dealer - the dealer in this bidding
 * @return {void}
 */
function auctionHistorySetDealer(dealer) {
    const history = assertGetAuctionHistory();

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
    const history = assertGetAuctionHistory();

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
        case 2:
            return "2";
        case 3:
            return "3";
        case 4:
            return "4";
        case 5:
            return "5";
        case 6:
            return "6";
        case 7:
            return "7";
        case 8:
            return "8";
        case 9:
            return "9";
        case 10:
            return "t";
        case 11:
            return "J";
        case 12:
            return "Q";
        case 13:
            return "K";
        case 14:
            return "A";
        default:
            throw new Error("unreachable");
    }
}

/**
 * @param {Side} side - side to find position to
 * @param {Side} playerSide - the current Player
 * @return {Position} table position
 */
function getRelativePositionForSide(side, playerSide) {
    // the player is always in the "bottom" position
    let currSide = playerSide;
    for (const pos of ALL_POSITIONS) {
        if (currSide == side) {
            return pos;
        }
        currSide = nextSide(currSide);
    }
    throw new Error("unreachable");
}

/**
 * @param {Position} [pos] - position to set
 */
function setMovePosition(pos) {
    for (const p of ALL_POSITIONS) {
        if (p == pos) {
            assertGetElementById(`${p}-side`).style.border = "1px solid orange";
        } else {
            assertGetElementById(`${p}-side`).style.border = "";
        }
    }
}

/**
 * @return {void}
 */
function resetUI() {
    const auctionHistory = assertGetAuctionHistory();

    // remove all items from bid history except the header
    while (auctionHistory.rows.length != 1) {
        auctionHistory.rows[1].remove();
    }

    // make all bids visible again
    mapBidElems((elem) => elem.style["visibility"] = "visible");

    // remove all the cards from the players and unmark the dealer
    for (const pos of ALL_POSITIONS) {
        removePlayerHand(pos);
        const labelSide = assertGetElementById(`${pos}-side`);
        labelSide.style.removeProperty("text-decoration-line");
        labelSide.style.removeProperty("color");
        if (labelSide.innerText.length != 1) {
            labelSide.innerText = labelSide.innerText[0]; // remove any suffixes
        }
    }

    // clear the current contract
    assertGetElementById("auction-result").innerText = "";

    // flush the table and move markers
    flushTable();
    resetTrickCount();
    setMovePosition();
}

/**
 * @param {string} position - player position to erase
 * @return {void}
 */
function removePlayerHand(position) {
    assertGetElementById(`${position}-hand`).replaceChildren();
}

/**
 * @param {string} position - player position to remove card
 * @param {Card} card - player card to remove
 * @return {boolean}
 */
function removeCardFromPlayerHand(position, card) {
    const nodes = assertGetElementById(`${position}-hand`).children.item(0)?.childNodes;
    if (!nodes) {
        // this hand is hidden for this player
        return true;
    }
    for (const node of nodes) {
        for (const c of node.childNodes) {
            if (!(c instanceof HTMLElement)) {
                continue;
            }
            const [_, rawSuit, rawRank] = c.id.split("-");
            const suit = parseSuit(rawSuit);
            const rank = parseRank(Number(rawRank));
            if (!suit || !rank) {
                printErrorMessage(`AssertionError: bad card id ${c.id} in position ${position}`);
                return false;
            }
            if (card[0] == suit && card[1] == rank) {
                c.remove();
                return true;
            }
        }
    }
    printErrorMessage(`AssertionError: failed to find card ${card} in position ${position}`);
    return false;
}

/**
 * @param {Side} mySide - the client's side
 * @param {Side} side - player side to remove card
 * @param {Card} card - player card to remove
 * @return {string | null} - final table position
 */
function tryRemoveCardFromHand(mySide, side, card) {
    let currSide = mySide;
    for (const pos of ALL_POSITIONS) {
        if (currSide == side) {
            const res = removeCardFromPlayerHand(pos, card);
            if (!res) {
                printErrorMessage(`failed to remove card ${card} from ${side}`);
                return null;
            }
            return pos;
        }
        currSide = nextSide(currSide);
    }
    printErrorMessage(`AssertionError: failed to find pos to delete card: ${mySide}:${side}`);
    return null;
}

/**
 * @param {Side} side
 */
function increaseTrickCount(side) {
    const elem = (() => {
        switch (side) {
            case "W":
            case "E":
                return assertGetElementById("we-score");
            case "N":
            case "S":
                return assertGetElementById("ns-score");
            default:
                throw new Error("unreachable");
        }
    })();
    elem.innerText = `${Number(elem.innerText) + 1}`;
}

function resetTrickCount() {
    assertGetElementById("we-score").innerText = "0";
    assertGetElementById("ns-score").innerText = "0";
    assertGetElementById("scores").style.visibility = "hidden";
}

function flushTable() {
    for (const p of ALL_POSITIONS) {
        assertGetElementById(`${p}-card`).replaceChildren();
    }
}

/**
 * @param {App} app - application state
 * @param {string} pos - the table position
 * @param {Card} card - player card to place to table
 * @return {void}
 */
function placeCardToTable(app, pos, card) {
    if (app.needFlushTable) {
        flushTable();
        app.needFlushTable = false;
    }
    const cell = assertGetElementById(`${pos}-card`);

    const cardElem = document.createElement("span");
    const [suit, rank] = card;
    const rankSymbol = rankPrettyPrint(rank);
    const [suitSymbol, suitStyle] = suitPrettyPrint(suit);
    cardElem.className = suitStyle;
    cardElem.innerText = `${rankSymbol}${suitSymbol}`;

    const cardHolderElem = document.createElement("span");
    cardHolderElem.className = "singlecard";
    cardHolderElem.appendChild(cardElem);

    cell.appendChild(cardHolderElem);
}

/**
 * @param {App} app - the application state
 * @param {Side} side - player side to remove card
 * @param {Card} card - player card to remove
 * @return {void}
 */
function moveCardFromHandToTable(app, side, card) {
    if (!app.mySide) {
        printErrorMessage("app side is not set on moveCardFromHandToTable");
        return;
    }

    const pos = tryRemoveCardFromHand(app.mySide, side, card);
    if (!pos) {
        printErrorMessage(`AssertionError: failed to remove card ${card} from hand: ${side}`);
        return;
    }
    placeCardToTable(app, pos, card);
}

/**
 * @param {App} app - application data
 * @param {Suit} suit - card's suit
 * @param {Rank} rank - card's rank
 * @return {void}
 */
function handleCardClick(app, suit, rank) {
    app.sock.send(createCardPlayMessage(suit, rank));
}

/**
 * @param {App} app - application data
 * @param {[Suit, Rank][]} hand - player hand to display
 * @param {string} position - player position to display
 * @param {boolean} [makeClickable] - whether to make cards clickable or not
 * @return {void}
 */
function displayPlayerHand(app, hand, position, makeClickable) {
    const bHandElem = assertGetElementById(`${position}-hand`);

    /** @type {Record<Suit, [Rank, string][]>} */
    const template = {
        S: [],
        H: [],
        D: [],
        C: [],
    };

    for (const [suit, rank] of hand) {
        const repr = rankPrettyPrint(rank);
        template[suit].push([rank, repr]);
    }

    const handDiv = document.createElement("div");
    for (const suit of ALL_SUITS_ORDERED) {
        const [suitRepr, suitStyle] = suitPrettyPrint(suit);
        const suitDiv = document.createElement("div");
        suitDiv.className = suitStyle;
        suitDiv.innerText = `${suitRepr} `;
        for (const [rank, rankRepr] of template[suit]) {
            const card = document.createElement("span");
            card.id = `card-${suit}-${rank}`;
            card.className = "card-in-hand";
            card.innerText = rankRepr;
            suitDiv.appendChild(card);
            if (makeClickable) {
                card.onclick = () => {
                    handleCardClick(app, suit, rank);
                };
            }
        }
        handDiv.appendChild(suitDiv);
    }
    bHandElem.appendChild(handDiv);
}

/**
 * @param {App} app - application data
 * @param {Side} side - the player's side
 * @param {{ phase?: unknown; bidHistory?: unknown; deal?: unknown; vuln?: unknown }} raw - raw data
 * @return {boolean}
 */
function handleInitialState(app, side, raw) {
    if (!(raw.bidHistory instanceof Array) || raw.bidHistory.length != 2) {
        printErrorMessage(`init state: bad bid history: ${JSON.stringify(raw.bidHistory)}`);
        return false;
    }

    const [rawDealer, rawHistory] = raw.bidHistory;
    const dealer = parseSide(rawDealer);
    const history = parseAuctionHistory(rawHistory);
    const cards = parseHand(raw.deal);
    const vuln = parseVulnerability(raw.vuln);
    if (!dealer || !history || !cards || !vuln) {
        printErrorMessage(`init state: bad init object: ${JSON.stringify(raw)}`);
        return false;
    }

    labelPlayerSides(side, dealer, vuln);
    displayPlayerHand(app, cards, "bottom", true);
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
 * @return {string} - JSON representation of the message
 */
function createContractBidMessage(level, denom) {
    return JSON.stringify({
        kind: "engine",
        data: {
            kind: "bid",
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
            kind: "bid",
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
            kind: "bid",
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
            kind: "bid",
            bid: "XX",
        },
    });
}

/**
 * @param {Suit} suit - card's suit
 * @param {Rank} rank - card's rank
 * @return {string} - JSON representation of the message
 */
function createCardPlayMessage(suit, rank) {
    return JSON.stringify({
        kind: "engine",
        data: {
            kind: "cardplay",
            card: [suit, rank],
        },
    });
}

/**
 * @param {App} app - application data
 * @return {string} - JSON representation of the message
 */
function createInitMessage(app) {
    return JSON.stringify({
        kind: "engine",
        data: {
            kind: "init",
            nickname: app.nickname,
        },
    });
}

/**
 * Create text message for the chat.
 * @param {string} text - text message
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
 * @return {void}
 */
function printErrorMessage(message) {
    printMessage(message, "error");
}

/**
 * @param {string} message - error message to print
 * @return {void}
 */
function printNotificationMessage(message) {
    printMessage(message, "notification");
}

/**
 * @param {string} message - error message to print
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
 * @param {Side} dealer
 * @param {Vulnerability} vuln
 * @return {void}
 */
function labelPlayerSides(mySide, dealer, vuln) {
    let side = mySide;
    for (const pos of ALL_POSITIONS) {
        const elem = assertGetElementById(`${pos}-side`);
        elem.innerText = side;

        switch (vuln) {
            case "NONE":
                elem.style.backgroundColor = "";
                break;
            case "NS":
            case "WE":
                if (vuln.search(side) == -1) {
                    elem.style.backgroundColor = "";
                    break;
                }
                /* falls through */
            case "BOTH":
                elem.style.backgroundColor = "darkred";
                break;
        }
        side = nextSide(side);
    }

    setMovePosition(getRelativePositionForSide(dealer, mySide));
}

function playNotificationSound() {
    new Audio("mixkit-cool-interface-click-tone-2568.wav").play();
}

function playPopSound() {
    new Audio("mixkit-long-pop-2358.wav").play();
}

/**
 * @param {App} app - application data
 * @param {{ side?: unknown; state?: unknown; gen?: unknown }} data - current engine state
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
    const done = handleInitialState(app, side, data.state);
    if (!done) {
        printErrorMessage(`failed to handle init state: ${JSON.stringify(data.state)}`);
        return;
    }

    app.mySide = side;
    app.gen = data.gen;
    // apply pending updates if any
    for (const [side, pending, gen] of app.pending) {
        processBidMessage(app, side, pending, gen);
    }

    playNotificationSound();
}

/**
 * @param {App} app - application data
 * @param {Side} side - bid from this side
 * @param {Bid} bid - input bid
 * @param {number} gen - the message generation
 * @return {void}
 */
function processBidMessage(app, side, bid, gen) {
    if (app.gen == undefined) {
        // didn't receive the initial message, delay handling
        app.pending.push([side, bid, gen]);
        return;
    }
    if (app.gen >= gen) {
        // outdated message, ignore
        return;
    }
    disableInactiveBids(bid);
    auctionHistoryAdd(bid);

    if (!app.mySide) {
        throw new Error("unreachable");
    }
    setMovePosition(getRelativePositionForSide(nextSide(side), app.mySide));
}

/**
 * @param {App} app - application data
 * @param {Side} dealer - original dealer
 * @param {Deal} deal - the original deal
 * @param {[Side, Card] | undefined} lead - the opening lead
 */
function revealFullDeal(app, dealer, deal, lead) {
    let side = app.mySide;
    if (!side) {
        throw new Error("unreachable");
    }

    for (const pos of ALL_POSITIONS) {
        removePlayerHand(pos);
        displayPlayerHand(app, deal[side], pos, false);
        side = nextSide(side);
    }
    if (!app.mySide) {
        throw new Error("AssertionError");
    }

    // display the opening lead if present
    if (lead) {
        const [leader, openingLead] = lead;
        moveCardFromHandToTable(app, leader, openingLead);
    }
    // display the original dealer
    setMovePosition(getRelativePositionForSide(dealer, app.mySide));
}

/**
 * @param {string} contract - contract text representation
 */
function displayContract(contract) {
    assertGetElementById("auction-result").innerText = contract;
    assertGetElementById("scores").style.visibility = "visible";
}

/**
 * @param {App} app - application data
 * @param {{
       bid?: unknown;
       card?: unknown;
       contract?: unknown;
       dealer?: unknown;
       dummy?: unknown;
       gen?: unknown;
       kind?: unknown;
       leader?: unknown;
       lead?: unknown;
       reveal?: unknown;
       side?: unknown;
       table?: unknown;
       winner?: unknown;
   }} data - engine message
 * @return {void}
 */
function processEngineMessage(app, data) {
    switch (data.kind) {
        case "bid": {
            const bid = parseBid(data.bid);
            const side = parseSide(data.side);
            if (!bid || !side) {
                printErrorMessage(
                    `failed to parse data in 'engine' message: ${JSON.stringify(data.bid)}`,
                );
                return;
            }
            if (typeof data.gen != "number") {
                printErrorMessage(`bad generation number in engine message: ${data.gen}`);
                return;
            }
            processBidMessage(app, side, bid, data.gen);
            playNotificationSound();
            break;
        }
        case "contract": {
            const leader = parseSide(data.leader);
            if (!leader || typeof data.contract != "string" || !app.mySide) {
                printErrorMessage(`bad 'contract' message: ${JSON.stringify(data)}`);
                return;
            }
            displayContract(data.contract);
            setMovePosition(getRelativePositionForSide(leader, app.mySide));
            playPopSound();
            break;
        }
        case "startplay": {
            const dummy = parseSide(data.dummy);
            const table = parseHand(data.table);
            const lead = parseCard(data.lead);
            if (!dummy || !table || !lead) {
                printErrorMessage(`bad 'startplay' message: ${JSON.stringify(data)}`);
                return;
            }
            const declarer = nextSide(nextSide(dummy));
            const leader = nextSide(declarer);

            if (!app.mySide) {
                printErrorMessage("AssertionError: app not initialized");
                return;
            }

            moveCardFromHandToTable(app, leader, lead);
            setMovePosition(getRelativePositionForSide(dummy, app.mySide));

            if (app.mySide == dummy) {
                // we are already dummy, nothing new to draw
                return;
            }

            // find who is dummy and draw its hand
            displayPlayerHand(
                app,
                table,
                getRelativePositionForSide(dummy, app.mySide),
                app.mySide == declarer,
            );
            playPopSound();
            break;
        }
        case "playcard": {
            const side = parseSide(data.side);
            const card = parseCard(data.card);
            if (!side || !card) {
                printErrorMessage(`bad playcard message: ${JSON.stringify(data)}`);
                return;
            }
            if (!app.mySide) {
                printErrorMessage("AssertionError: no self side on 'playcard'");
                return;
            }
            moveCardFromHandToTable(app, side, card);
            setMovePosition(getRelativePositionForSide(nextSide(side), app.mySide));
            playNotificationSound();
            break;
        }
        case "trick": {
            const side = parseSide(data.side);
            const card = parseCard(data.card);
            const winner = parseSide(data.winner);
            if (!side || !card || !winner) {
                printErrorMessage(`bad 'trick' message: ${JSON.stringify(data)}`);
                return;
            }
            if (!app.mySide) {
                printErrorMessage("AssertionError: no self side on 'trick'");
                return;
            }
            moveCardFromHandToTable(app, side, card);
            app.needFlushTable = true; // need to flush after the last trick
            setMovePosition(getRelativePositionForSide(winner, app.mySide));
            increaseTrickCount(winner);
            playNotificationSound();
            break;
        }
        case "nextdeal": {
            const dealer = parseSide(data.dealer);
            const deal = parseFullDeal(data.reveal);
            const lead = data.lead != null ? parseLead(data.lead) : undefined;
            if (!deal || !dealer || lead === null) {
                printErrorMessage(`failed to parse 'nextdeal': ${JSON.stringify(data)}`);
                return;
            }
            setTimeout(() => {
                // give some time enough to view the last trick
                revealFullDeal(app, dealer, deal, lead);
                enableNextButton();
                playPopSound();
            }, 3000);
            return;
        }
        default:
            printErrorMessage(`bad engine message kind: ${data.kind}`);
            return;
    }
}

/**
 * @param {App} app - application data
 * @param {{ kind?: string; data?: unknown }} message - application data
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
        app.sock.send(createInitMessage(app));
    });
}

/**
 * @param {App} app - application data
 * @param {HTMLButtonElement} button - "next" button
 * @return {void}
 */
function handleNextClick(app, button) {
    resetUI();
    app.sock.send(createInitMessage(app));
    button.disabled = true;
}

function enableNextButton() {
    const button = assertGetElementById("next-deal");
    if (!(button instanceof HTMLButtonElement)) {
        throw new Error("bad next-deal type");
    }
    button.disabled = false;
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
    const nickname = prompt("Your nickname (for chat only)");
    const app = {
        sock: connectToGameServer(),
        pending: [],
        mySide: null,
        gen: -1,
        nickname,
        needFlushTable: false,
    };
    registerEvents(app);
}

globalThis.addEventListener("load", main);
