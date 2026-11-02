// SPDX-License-Identifier: GPL-3.0-or-later
import {
    Bid,
    Card,
    Contract,
    Deal,
    Denomination,
    Level,
    nextSide,
    Rank,
    Side,
    Suit,
    Vulnerability,
} from "../shared/types.ts";

import {
    parseDenomination,
    parseLevel,
    parseRank,
    parseServerMessage,
    parseSuit,
} from "../shared/parsing.ts";

import {
    ClientMessage,
    ServerEngineMessage,
    ServerMessage,
    ServerPlayerMessage,
} from "../shared/protocol.ts";

type Position = "bottom" | "left" | "top" | "right";
type Players = Record<Side, string | null>;
type NickStyle = "empty" | "anon" | "connected";

class App {
    sock: WebSocket;
    nickname: string;
    mySide: Side | null;
    needFlushTable: boolean;
    debug: boolean;

    constructor(sock: WebSocket, nickname: string, debug: boolean) {
        this.sock = sock;
        this.nickname = nickname;
        this.mySide = null;
        this.needFlushTable = false;
        this.debug = debug;
    }

    sendmsg(msg: ClientMessage): void {
        if (this.debug) {
            console.log("send:", msg);
        }
        this.sock.send(JSON.stringify(msg));
    }
}

const ALL_SUITS_ORDERED: Suit[] = ["S", "H", "D", "C"];
const ALL_POSITIONS: Position[] = ["bottom", "left", "top", "right"];

function die(message: string): never {
    printErrorMessage(message);
    throw new Error(`fatal error: ${message}`);
}

function assertGetElementById(id: string): HTMLElement {
    const elem = document.getElementById(id);
    if (!elem) {
        die(`failed to find html element for id ${id}`);
    }
    return elem;
}

function assertGetElementsByClassName(name: string): HTMLCollectionOf<Element> {
    const elem = document.getElementsByClassName(name);
    if (!elem) {
        die(`failed to find html element for class ${name}`);
    }
    return elem;
}

function printMessage(message: string, styleName: string): void {
    const messages = assertGetElementById("messages");
    const time = new Date().toLocaleTimeString();
    const line = document.createElement("div");
    line.innerText = `${time}: ${message}`;
    line.setAttribute("class", styleName);

    // append the line and scroll the messages window
    messages.appendChild(line);
    messages.scrollTop = line.offsetTop;
}

function printErrorMessage(message: string): void {
    printMessage(message, "error");
}

function printNotificationMessage(message: string): void {
    printMessage(message, "notification");
}

function printChatMessage(message: string): void {
    printMessage(message, "chat");
}

function contractGreaterOrEqual(b1: Contract, b2: Contract): boolean {
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

function suitPrettyPrint(suit: Suit): [string, string] {
    switch (suit) {
        case "C":
            return ["♣", "suit-c"];
        case "D":
            return ["♦", "suit-d"];
        case "H":
            return ["♥", "suit-h"];
        case "S":
            return ["♠", "suit-s"];
    }
}

function bidPrettyText(bid: Bid): [string, string | undefined] {
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
        }
    })();

    return [`${bid.level}${prettyDenom}`, style];
}

function assertGetAuctionHistory(): HTMLTableElement {
    const history = assertGetElementById("auction-history");
    if (!(history instanceof HTMLTableElement)) {
        die(`bad type: ${typeof history}`);
    }
    return history;
}

function auctionHistorySetDealer(dealer: Side): void {
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

function auctionHistoryAdd(bid: Bid): void {
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

const ALL_CARDS_PRETTY = {
    S: ["🂢", "🂣", "🂤", "🂥", "🂦", "🂧", "🂨", "🂩", "🂪", "🂫", "🂭", "🂮", "🂡"],
    H: ["🂲", "🂳", "🂴", "🂵", "🂶", "🂷", "🂸", "🂹", "🂺", "🂻", "🂽", "🂾", "🂱"],
    D: ["🃂", "🃃", "🃄", "🃅", "🃆", "🃇", "🃈", "🃉", "🃊", "🃋", "🃍", "🃎", "🃁"],
    C: ["🃒", "🃓", "🃔", "🃕", "🃖", "🃗", "🃘", "🃙", "🃚", "🃛", "🃝", "🃞", "🃑"],
};

function cardPrettyPrint(rank: Rank, suit: Suit): string {
    const rankOffset = rank - 2;
    return ALL_CARDS_PRETTY[suit][rankOffset];
}

function getRelativePositionForSide(side: Side, playerSide: Side): Position {
    // the player is always in the "bottom" position
    let currSide = playerSide;
    for (const pos of ALL_POSITIONS) {
        if (currSide == side) {
            return pos;
        }
        currSide = nextSide(currSide);
    }
    die(`unreachable: ${side}, ${playerSide}`);
}

function setMovePosition(pos: Position | null) {
    for (const p of ALL_POSITIONS) {
        if (p == pos) {
            assertGetElementById(`${p}-side`).style.border = "1px solid orange";
        } else {
            assertGetElementById(`${p}-side`).style.border = "";
        }
    }
}

function resetUI(): void {
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
    setMovePosition(null);
}

function removePlayerHand(position: string): void {
    assertGetElementById(`${position}-hand`).replaceChildren();
}

function removeCardFromPlayerHand(position: string, card: Card): boolean {
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

function tryRemoveCardFromHand(mySide: Side, side: Side, card: Card): string | null {
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

function increaseTrickCount(side: Side) {
    const elem = (() => {
        switch (side) {
            case "W":
            case "E":
                return assertGetElementById("we-score");
            case "N":
            case "S":
                return assertGetElementById("ns-score");
        }
    })();
    elem.innerText = `${Number(elem.innerText) + 1}`;
}

function setDealResult(nsResult: number): void {
    const elem = assertGetElementById("ns-points");
    elem.innerText = String(nsResult);
}

function clearDealResult(): void {
    const elem = assertGetElementById("ns-points");
    elem.innerText = "";
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

function placeCardToTable(app: App, pos: string, card: Card): void {
    if (app.needFlushTable) {
        flushTable();
        app.needFlushTable = false;
    }
    const cell = assertGetElementById(`${pos}-card`);

    const cardElem = document.createElement("span");
    const [suit, rank] = card;
    const cardSymbol = cardPrettyPrint(rank, suit);
    const [_, suitStyle] = suitPrettyPrint(suit);
    cardElem.className = suitStyle;
    cardElem.innerText = `${cardSymbol}`;

    const cardHolderElem = document.createElement("span");
    cardHolderElem.className = "singlecard";
    cardHolderElem.appendChild(cardElem);

    cell.appendChild(cardHolderElem);
}

function moveCardFromHandToTable(app: App, side: Side, card: Card): void {
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

function handleCardClick(app: App, suit: Suit, rank: Rank): void {
    app.sendmsg(createCardPlayMessage(suit, rank));
}

function displayBoardNumber(boardNum: number): void {
    const boardNumElem = assertGetElementById("board-number");
    boardNumElem.innerText = String(boardNum);
}

function displayPlayerHand(
    app: App,
    hand: [Suit, Rank][],
    position: string,
    makeClickable: boolean,
): void {
    const bHandElem = assertGetElementById(`${position}-hand`);

    const template: Record<Suit, [Rank, string][]> = {
        S: [],
        H: [],
        D: [],
        C: [],
    };

    for (const [suit, rank] of hand) {
        const repr = cardPrettyPrint(rank, suit);
        template[suit].push([rank, repr]);
    }

    const handDiv = document.createElement("div");
    for (const suit of ALL_SUITS_ORDERED) {
        const [_, suitStyle] = suitPrettyPrint(suit);
        const suitDiv = document.createElement("div");
        suitDiv.className = suitStyle;
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

function handleInitialState(
    app: App,
    side: Side,
    boardNum: number,
    bidHistory: [Side, Bid[]],
    hand: Card[],
    vuln: Vulnerability,
    players: Players,
): void {
    const [dealer, history] = bidHistory;
    labelPlayerSides(side, dealer, vuln, players);
    displayBoardNumber(boardNum);
    displayPlayerHand(app, hand, "bottom", true);
    auctionHistorySetDealer(dealer);

    let currSide = dealer;
    for (const bid of history) {
        processBidMessage(app, currSide, bid);
        currSide = nextSide(currSide);
    }
}

function connectToGameServer(): WebSocket {
    const path = location.pathname;
    const basePath = path.split("/static/")[0];
    const wsUrl = `wss://${location.host}${basePath}/game`;
    return new WebSocket(wsUrl);
}

function createContractBidMessage(level: Level, denom: Denomination): ClientMessage {
    return {
        kind: "engine",
        data: {
            kind: "bid",
            bid: { level, denom },
        },
    };
}

function createPassMessage(): ClientMessage {
    return {
        kind: "engine",
        data: {
            kind: "bid",
            bid: "PASS",
        },
    };
}

function createDoubleMessage(): ClientMessage {
    return {
        kind: "engine",
        data: {
            kind: "bid",
            bid: "X",
        },
    };
}

function createRedoubleMessage(): ClientMessage {
    return {
        kind: "engine",
        data: {
            kind: "bid",
            bid: "XX",
        },
    };
}

function createCardPlayMessage(suit: Suit, rank: Rank): ClientMessage {
    return {
        kind: "engine",
        data: {
            kind: "cardplay",
            card: [suit, rank],
        },
    };
}

function createInitMessage(app: App): ClientMessage {
    return {
        kind: "engine",
        data: {
            kind: "init",
            nickname: app.nickname,
        },
    };
}

function createTextMessage(text: string): ClientMessage {
    return {
        kind: "chat",
        data: text,
    };
}

function handleBidClick(elem: Element, app: App) {
    const items = elem.id.replace("bid-", "").split("-");
    const rawLevel = Number(items[0]);
    if (rawLevel) {
        // normal contract bids
        const rawDenom = items[1] == "n" ? "NT" : items[1].toUpperCase();
        const level = parseLevel(rawLevel);
        const denom = parseDenomination(rawDenom);
        if (!level || !denom) {
            die(`${elem.id}:${rawLevel}:${rawDenom}`);
        }
        app.sendmsg(createContractBidMessage(level, denom));
    } else {
        // special bids
        const special = items[1];
        switch (special) {
            case "pass":
                app.sendmsg(createPassMessage());
                break;
            case "x":
                app.sendmsg(createDoubleMessage());
                break;
            case "xx":
                app.sendmsg(createRedoubleMessage());
                break;
            default:
                die(`${special}`);
        }
    }
}

function assertElem2Contract(id: string): Contract {
    const [_, rawLevel, rawDenom] = id.split("-");
    const level = parseLevel(Number(rawLevel));
    const denom = parseDenomination(rawDenom == "n" ? "NT" : rawDenom.toUpperCase());
    if (!level || !denom) {
        die(`${id}`);
    }
    return { level, denom };
}

function disableInactiveBids(bid: Bid) {
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

function processPlayerNick(pos: Position, raw: string | null): void {
    const [nickText, style]: [string, NickStyle] = (() => {
        if (raw == null) {
            return ["(empty)", "empty"];
        }

        if (raw == "") {
            return ["[anonymous]", "anon"];
        }

        return [raw, "connected"];
    })();

    const nickElem = assertGetElementById(`${pos}-nick`);
    nickElem.innerText = nickText;
    switch (style) {
        case "empty":
            nickElem.style.color = "grey";
            nickElem.style.fontWeight = "normal";
            nickElem.style.fontStyle = "normal";
            break;
        case "anon":
            nickElem.style.color = "black";
            nickElem.style.fontStyle = "italic";
            nickElem.style.fontWeight = "normal";
            break;
        case "connected":
            nickElem.style.color = "black";
            nickElem.style.fontWeight = "bold";
            nickElem.style.fontStyle = "normal";
            break;
    }
}

function labelPlayerSides(mySide: Side, dealer: Side, vuln: Vulnerability, players: Players): void {
    let side = mySide; // we are always on the bottom
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

        processPlayerNick(pos, players[side]);
        side = nextSide(side);
    }

    setMovePosition(getRelativePositionForSide(dealer, mySide));
}

function playSound(sound: string): void {
    new Audio(sound).play().catch((_err) => {
        // ignore sound play exceptions, they could be caused by blocked autoplay
    });
}

function playNotificationSound(): void {
    playSound("mixkit-cool-interface-click-tone-2568.wav");
}

function playPopSound(): void {
    playSound("mixkit-long-pop-2358.wav");
}

function processInitMessage(
    app: App,
    side: Side,
    boardNum: number,
    bidHistory: [Side, Bid[]],
    hand: Card[],
    vuln: Vulnerability,
    players: Players,
): void {
    app.mySide = side;
    handleInitialState(app, side, boardNum, bidHistory, hand, vuln, players);
    playNotificationSound();
}

function processBidMessage(app: App, side: Side, bid: Bid): void {
    if (!app.mySide) {
        die("unreachable");
    }
    disableInactiveBids(bid);
    auctionHistoryAdd(bid);
    setMovePosition(getRelativePositionForSide(nextSide(side), app.mySide));
}

function revealFullDeal(app: App, dealer: Side, deal: Deal, lead: [Side, Card] | null) {
    let side = app.mySide;
    if (!side) {
        die("unreachable");
    }

    for (const pos of ALL_POSITIONS) {
        removePlayerHand(pos);
        displayPlayerHand(app, deal[side], pos, false);
        side = nextSide(side);
    }
    if (!app.mySide) {
        die("unreachable");
    }

    // display the opening lead if present
    if (lead) {
        const [leader, openingLead] = lead;
        moveCardFromHandToTable(app, leader, openingLead);
    }
    // display the original dealer
    setMovePosition(getRelativePositionForSide(dealer, app.mySide));
}

function displayContract(contract: string) {
    assertGetElementById("auction-result").innerText = contract;
    assertGetElementById("scores").style.visibility = "visible";
}

function processEngineMessage(app: App, data: ServerEngineMessage): void {
    switch (data.kind) {
        case "bid": {
            processBidMessage(app, data.side, data.bid);
            playNotificationSound();
            break;
        }
        case "contract": {
            if (!app.mySide) {
                printErrorMessage("AssertionError: app not initialized");
                return;
            }
            displayContract(data.contract);
            setMovePosition(getRelativePositionForSide(data.leader, app.mySide));
            playPopSound();
            break;
        }
        case "startplay": {
            if (!app.mySide) {
                printErrorMessage("AssertionError: app not initialized");
                return;
            }

            const declarer = nextSide(nextSide(data.dummy));
            setMovePosition(getRelativePositionForSide(data.dummy, app.mySide));
            if (app.mySide == data.dummy) {
                // we are already dummy, nothing new to draw
                return;
            }

            // find who is dummy and draw its hand
            displayPlayerHand(
                app,
                data.table,
                getRelativePositionForSide(data.dummy, app.mySide),
                app.mySide == declarer,
            );
            playPopSound();
            break;
        }
        case "playcard": {
            if (!app.mySide) {
                printErrorMessage("AssertionError: no self side on 'playcard'");
                return;
            }
            moveCardFromHandToTable(app, data.side, data.card);
            setMovePosition(getRelativePositionForSide(nextSide(data.side), app.mySide));
            playNotificationSound();
            break;
        }
        case "trick": {
            if (!app.mySide) {
                printErrorMessage("AssertionError: no self side on 'trick'");
                return;
            }
            app.needFlushTable = true; // need to flush after the last trick
            setMovePosition(getRelativePositionForSide(data.winner, app.mySide));
            increaseTrickCount(data.winner);
            break;
        }
        case "nextdeal": {
            setDealResult(data.nsResult);
            setTimeout(() => {
                // give some time enough to view the last trick
                revealFullDeal(app, data.dealer, data.reveal, data.lead);
                enableNextButton();
                playPopSound();
            }, 3000);
            break;
        }
        case "init":
            clearDealResult();
            processInitMessage(
                app,
                data.side,
                data.boardNum,
                data.bidHistory,
                data.hand,
                data.vuln,
                data.players,
            );
            break;
    }
}

function processPlayerMessage(app: App, data: ServerPlayerMessage): void {
    switch (data.kind) {
        case "connect": {
            const side = app.mySide;
            if (!side) {
                // out-of-order message before init is done
                return;
            }

            const seat = data.seat;
            const nickname = data.nickname;
            const pos = getRelativePositionForSide(seat, side);
            processPlayerNick(pos, nickname);

            const player = nickname ? `player ${nickname}` : "(anonymous)";
            printNotificationMessage(`${player} connected to ${seat}`);
            break;
        }
        case "disconnect": {
            const side = app.mySide;
            if (!side) {
                // out-of-order message before init is done
                return;
            }
            const seat = data.seat;
            const pos = getRelativePositionForSide(seat, side);
            processPlayerNick(pos, null);
            printNotificationMessage(`${seat} disconnected`);
            break;
        }
    }
}

function processMessage(app: App, message: ServerMessage): void {
    switch (message.kind) {
        case "chat":
            printChatMessage(message.data);
            break;
        case "error":
            printErrorMessage(message.data);
            break;
        case "notify":
            printNotificationMessage(message.data);
            break;
        case "engine":
            processEngineMessage(app, message.data);
            break;
        case "player":
            processPlayerMessage(app, message.data);
            break;
    }
}

function handleSubmit(app: App): void {
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

    app.sendmsg(createTextMessage(text));
}

function handleServerMessage(app: App, event: MessageEvent): void {
    const res = parseServerMessage(event.data);
    if (typeof res == "string") {
        printErrorMessage(`failed to parse server message: ${res}`);
        return;
    }
    if (app.debug) {
        console.log("recv:", res);
    }
    processMessage(app, res);
}

function handleSocketConnect(app: App): void {
    app.sendmsg(createInitMessage(app));
}

function handleSocketError(event: Event): void {
    printErrorMessage(`socket error ${event}: reload the page`);
}

function handleSocketClose(): void {
    printErrorMessage(`connection lost: reload the page`);
}

function handleNextClick(app: App, button: HTMLButtonElement): void {
    resetUI();
    app.sendmsg(createInitMessage(app));
    button.disabled = true;
}

function enableNextButton() {
    const button = assertGetElementById("next-deal");
    if (!(button instanceof HTMLButtonElement)) {
        die("bad 'next-deal' type");
    }
    button.disabled = false;
}

function mapBidElems(f: (arg0: HTMLElement) => void): void {
    const bidElems = assertGetElementsByClassName("bid");
    for (let i = 0; i < bidElems.length; ++i) {
        const elem = bidElems[i];
        // dynamic cast
        if (!(elem instanceof HTMLElement)) {
            die(`AssertionError: bid ${elem.id} is not HTMLElement`);
        }
        f(elem);
    }
}

function registerEvents(app: App): void {
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
        die("bad 'next-deal' type");
    }
    next.onclick = () => handleNextClick(app, next);

    // attach websocket hooks
    app.sock.onmessage = (e) => handleServerMessage(app, e);
    app.sock.onopen = () => handleSocketConnect(app);
    app.sock.onerror = (e) => handleSocketError(e);
    app.sock.onclose = () => handleSocketClose();
}

function getNickname(): string {
    // get seat identifier
    const seatId = location.pathname.split("/static/")[0];
    const nickKey = `nick${seatId}`;

    // get saved nick for this seat first
    const nickname = localStorage.getItem(nickKey);
    if (nickname !== null) {
        return nickname;
    }

    // otherwise ask user directly
    const res = prompt("Your nickname (for chat only)");
    if (res !== null && res !== "") {
        localStorage.setItem(nickKey, res);
        return res;
    }

    // use empty string to mark 'anonymous' players
    return "";
}

function main(): App {
    const nickname = getNickname();
    const sock = connectToGameServer();
    const debug = new URLSearchParams(location.search).has("debug");
    const app = new App(sock, nickname, debug);
    registerEvents(app);
    return app;
}

globalThis.addEventListener("load", () => {
    const app = main();
    if (app.debug) {
        // save in global object to catch it in browser debuggers
        (globalThis as Record<string, unknown>).app = app;
    }
});
