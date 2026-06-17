//helper function

import WebSocket, { WebSocketServer } from "ws";
import { wsArcjet } from "../arcjet.js";

const MAX_SUBSCRIPTIONS_PER_SOCKET = 100;

const matchSubscribers = new Map();

function subscribe(matchId, socket) {
    console.log("SUBSCRIBE", matchId);

    if (!matchSubscribers.has(matchId)) {
        matchSubscribers.set(matchId, new Set());
    }

    matchSubscribers.get(matchId).add(socket);
    console.log("Subscribers:", matchSubscribers.get(matchId).size);
}

function unsubscribe(matchId, socket) {
    const subscribers = matchSubscribers.get(matchId);

    if (!subscribers) return;

    subscribers.delete(socket);

    if (subscribers.size === 0) {
        matchSubscribers.delete(matchId);
    }
}

function cleanUpSubcriptions(socket) {
    for (const matchId of socket.subscriptions) {
        unsubscribe(matchId, socket);
    }
}

function broadcastToMatch(matchId, payload) {
    console.log("BROADCAST MATCH ID:", matchId);
    console.log("ALL KEYS:", [...matchSubscribers.keys()]);

    const subscribers = matchSubscribers.get(matchId);

    console.log("FOUND SUBSCRIBERS:", subscribers?.size);

    if (!subscribers || subscribers.size === 0) {
        console.log("NO SUBSCRIBERS FOUND");
        return;
    }

    for (const client of subscribers) {
        console.log("READY STATE:", client.readyState, "OPEN:", WebSocket.OPEN);

        if (client.readyState === WebSocket.OPEN) {
            console.log("SENDING TO CLIENT");
            client.send(JSON.stringify(payload));
        }
    }
}

function sendJson(socket, payload) {
    if (socket.readyState !== WebSocket.OPEN) {
        return;
    }

    socket.send(JSON.stringify(payload));
}

function broadcastToAll(wss, payload) {
    for (const client of wss.clients) {
        if (client.readyState !== WebSocket.OPEN) continue;

        client.send(JSON.stringify(payload));
    }
}

function handleMessage(socket, data) {


    let message;

    try {
        message = JSON.parse(data.toString());

        
    } catch (err) {
        console.log("JSON ERROR", err);
        return;
    }

    if (
        message.type === "subscribe" &&
        Number.isInteger(message.matchId) &&
        message.matchId > 0
    ) {
        if (socket.subscriptions.size >= MAX_SUBSCRIPTIONS_PER_SOCKET) {
            sendJson(socket, {
                type: "error",
                code: "subscription_limit_reached",
            });
            return;
        }

        subscribe(message.matchId, socket);

        socket.subscriptions.add(message.matchId);

        console.log(
            "CURRENT SUBSCRIBERS:",
            matchSubscribers.get(message.matchId)?.size,
        );

        sendJson(socket, {
            type: "subscribed",
            matchId: message.matchId,
        });

        return;
    }
}

export function attachWebSocketServer(server) {
    const wss = new WebSocketServer({
        server,
        path: "/ws",
        maxPayload: 1024 * 1024,
    });

    wss.on("connection", async (socket, req) => {
        console.log("🔥 NEW CONNECTION");

        socket.on("message", (data) => {
            console.log("📨 RAW MESSAGE:", data.toString());
        });
        try {
            const decision = await wsArcjet.protect(req);

            if (decision.isDenied()) {
                const code = decision.reason.isRateLimit() ? 1013 : 1008;

                const reason = decision.reason.isRateLimit()
                    ? "Rate limit exceeded"
                    : "Access Denied";

                socket.close(code, reason);

                return;
            }
        } catch (error) {
            console.error("Ws Connection Error", error);
            socket.close(1011, "Server Security is invalid");
            return;
        }

        socket.isAlive = true;

        socket.on("pong", () => {
            socket.isAlive = true;
        });

        socket.subscriptions = new Set();

        sendJson(socket, { type: "welcome" });

        socket.on("message", (data) => {
            handleMessage(socket, data);
        });

        socket.on("error", () => {
            socket.terminate();
        });

        socket.on("close", () => {
            cleanUpSubcriptions(socket);
        });
    });

    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) return ws.terminate();

            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on("close", () => clearInterval(interval));

    function broadcastMatchCreated(match) {
        broadcastToAll(wss, { type: "match_created", data: match });
    }

    function broadcastCommentary(matchId, comment) {
        broadcastToMatch(matchId, { type: "commentary", data: comment });
    }

    return { broadcastMatchCreated, broadcastCommentary };
}
