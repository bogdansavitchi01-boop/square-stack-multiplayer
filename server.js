"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { WebSocketServer } = require("ws");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT) || 3000;
const scrypt = promisify(crypto.scrypt);
const allowedOrigins = new Set([
    "https://squerstackreal.netlify.app",
    "http://127.0.0.1:5500",
    "http://localhost:5500"
]);

if (!process.env.DATABASE_URL) {
    console.error("LIPSESTE DATABASE_URL. Configureaza Supabase Session Pooler in Render.");
    process.exit(1);
}

const database = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
});

database.on("error", error => console.error("Eroare PostgreSQL:", error.message));

const dataFolder = path.join(__dirname, "server-data");

function readJSON(name, fallback) {
    try {
        return JSON.parse(fs.readFileSync(path.join(dataFolder, name), "utf8"));
    } catch {
        return fallback;
    }
}

async function initializeDatabase() {
    await database.query(
        "CREATE TABLE IF NOT EXISTS square_accounts (" +
        "username_key TEXT PRIMARY KEY, display_name TEXT NOT NULL, salt TEXT NOT NULL, " +
        "password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );
    await database.query(
        "CREATE TABLE IF NOT EXISTS square_sessions (" +
        "token_hash TEXT PRIMARY KEY, username_key TEXT NOT NULL REFERENCES square_accounts(username_key) ON DELETE CASCADE, " +
        "expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );
    await database.query(
        "CREATE INDEX IF NOT EXISTS square_sessions_expiry_idx ON square_sessions(expires_at)"
    );
    await database.query(
        "CREATE TABLE IF NOT EXISTS square_rooms (" +
        "room_code TEXT PRIMARY KEY, seed INTEGER NOT NULL, blocks JSONB NOT NULL DEFAULT '{}'::jsonb, " +
        "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );
    await database.query(
        "CREATE TABLE IF NOT EXISTS square_skins (" +
        "username_key TEXT PRIMARY KEY REFERENCES square_accounts(username_key) ON DELETE CASCADE, " +
        "skin_data TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );

    // Importa vechile fisiere JSON fara sa suprascrie datele deja existente.
    const legacyAccounts = readJSON("accounts.json", {});
    for (const [key, account] of Object.entries(legacyAccounts)) {
        if (account && typeof account.name === "string" &&
            typeof account.salt === "string" && typeof account.hash === "string") {
            await database.query(
                "INSERT INTO square_accounts (username_key, display_name, salt, password_hash) " +
                "VALUES ($1, $2, $3, $4) ON CONFLICT (username_key) DO NOTHING",
                [key, account.name, account.salt, account.hash]
            );
        }
    }

    const legacyRooms = readJSON("rooms.json", {});
    for (const [code, room] of Object.entries(legacyRooms)) {
        if (/^[A-Z0-9]{4,10}$/.test(code) && room &&
            Number.isInteger(room.seed) && room.blocks &&
            typeof room.blocks === "object" && !Array.isArray(room.blocks)) {
            await database.query(
                "INSERT INTO square_rooms (room_code, seed, blocks) " +
                "VALUES ($1, $2, $3::jsonb) ON CONFLICT (room_code) DO NOTHING",
                [code, room.seed, JSON.stringify(room.blocks)]
            );
        }
    }

    await database.query("DELETE FROM square_sessions WHERE expires_at <= NOW()");
    console.log("Square Stack: Supabase pregatit.");
}

function reply(res, status, data) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    res.end(JSON.stringify(data));
}

async function bodyJSON(req) {
    let body = "";
    for await (const chunk of req) {
        body += chunk;
        if (body.length > 4096) throw new Error("Cerere prea mare.");
    }
    return JSON.parse(body);
}

async function makeHash(password, salt) {
    return (await scrypt(password, salt, 64)).toString("hex");
}

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

const attempts = new Map();

function limited(ip) {
    const now = Date.now();
    const recent = (attempts.get(ip) || []).filter(time => now - time < 600000);
    recent.push(now);
    attempts.set(ip, recent);
    return recent.length > 15;
}

async function accountRequest(req, res) {
    if (limited(req.socket.remoteAddress || "unknown")) {
        return reply(res, 429, { error: "Prea multe incercari. Incearca mai tarziu." });
    }

    try {
        const data = await bodyJSON(req);
        const name = String(data.name || "").trim();
        const password = String(data.password || "");
        const key = name.toLowerCase();

        if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) {
            return reply(res, 400, { error: "Numele trebuie sa aiba 3-20 caractere." });
        }
        if (password.length < 10 || password.length > 128) {
            return reply(res, 400, { error: "Parola trebuie sa aiba minimum 10 caractere." });
        }

        let account;
        if (data.action === "register") {
            const salt = crypto.randomBytes(16).toString("hex");
            const passwordHash = await makeHash(password, salt);
            const inserted = await database.query(
                "INSERT INTO square_accounts (username_key, display_name, salt, password_hash) " +
                "VALUES ($1, $2, $3, $4) ON CONFLICT (username_key) DO NOTHING " +
                "RETURNING username_key, display_name",
                [key, name, salt, passwordHash]
            );
            if (!inserted.rowCount) {
                return reply(res, 409, { error: "Acest nume este deja folosit." });
            }
            account = inserted.rows[0];
        } else if (data.action === "login") {
            const found = await database.query(
                "SELECT username_key, display_name, salt, password_hash " +
                "FROM square_accounts WHERE username_key = $1",
                [key]
            );
            if (!found.rowCount) {
                return reply(res, 401, { error: "Nume sau parola gresita." });
            }
            const stored = found.rows[0];
            const calculated = Buffer.from(await makeHash(password, stored.salt), "hex");
            const expected = Buffer.from(stored.password_hash, "hex");
            if (calculated.length !== expected.length ||
                !crypto.timingSafeEqual(calculated, expected)) {
                return reply(res, 401, { error: "Nume sau parola gresita." });
            }
            account = stored;
        } else {
            return reply(res, 400, { error: "Actiune necunoscuta." });
        }

        const token = crypto.randomBytes(32).toString("hex");
        await database.query(
            "INSERT INTO square_sessions (token_hash, username_key, expires_at) " +
            "VALUES ($1, $2, NOW() + INTERVAL '24 hours')",
            [hashToken(token), account.username_key]
        );
        return reply(res, 200, { token, name: account.display_name });
    } catch (error) {
        console.error("Eroare cont:", error.message);
        return reply(res, 400, { error: "Cerere invalida sau eroare la baza de date." });
    }
}

const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/account" && req.method === "POST") {
        await accountRequest(req, res);
        return;
    }

    const downloads = {
        "/download/windows": { file: "SquareStack-Setup.exe", type: "application/octet-stream" },
        "/download/android": { file: "SquareStack-Android.apk", type: "application/vnd.android.package-archive" }
    };
    const download = downloads[url.pathname];
    if (download) {
        const filePath = path.join(__dirname, "downloads", download.file);
        fs.stat(filePath, (error, stats) => {
            if (error || !stats.isFile()) {
                res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
                res.end("Aceasta versiune nu este inca disponibila.");
                return;
            }
            res.writeHead(200, {
                "Content-Type": download.type,
                "Content-Length": stats.size,
                "Content-Disposition": 'attachment; filename="' + download.file + '"'
            });
            fs.createReadStream(filePath).pipe(res);
        });
        return;
    }

    let filename = url.pathname.substring(1);
    if (!filename) filename = "index.html";
    const allowedFile = /^[a-zA-Z0-9_.-]+\.(html|js|css|png|jpg|jpeg|webp)$/;
    if (!allowedFile.test(filename) || filename === "server.js" ||
        filename === "package.json" || filename.startsWith(".")) {
        res.writeHead(404);
        res.end("Nu exista.");
        return;
    }

    const filePath = path.join(__dirname, filename);
    const extensions = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp"
    };
    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404);
            res.end("Fisier negasit.");
            return;
        }
        res.writeHead(200, {
            "Content-Type": extensions[path.extname(filename)] || "application/octet-stream"
        });
        res.end(content);
    });
});

const wss = new WebSocketServer({ server, maxPayload: 120000 });
const players = new Map();

function send(ws, message) {
    if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

function broadcast(room, message, except) {
    for (const [ws, info] of players) {
        if (info.room === room && ws !== except) send(ws, message);
    }
}

function validSkin(skin) {
    if (typeof skin !== "string" || skin.length > 90000 ||
        !skin.startsWith("data:image/png;base64,")) return false;
    const encoded = skin.substring("data:image/png;base64,".length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return false;
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.length < 24 || buffer.length > 65536) return false;
    const signature = Buffer.from("89504e470d0a1a0a", "hex");
    if (!buffer.subarray(0, 8).equals(signature) ||
        buffer.toString("ascii", 12, 16) !== "IHDR") return false;
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return (width === 64 && height === 64) ||
        (width === 64 && height === 32) ||
        (width === 128 && height === 128) ||
        (width === 128 && height === 64);
}

async function handleJoin(ws, data) {
    const token = String(data.token || "");
    if (!/^[a-f0-9]{64}$/.test(token)) {
        send(ws, { type: "error", message: "Conecteaza-te din nou la cont." });
        return;
    }

    const sessionResult = await database.query(
        "SELECT a.username_key, a.display_name FROM square_sessions s " +
        "JOIN square_accounts a ON a.username_key = s.username_key " +
        "WHERE s.token_hash = $1 AND s.expires_at > NOW()",
        [hashToken(token)]
    );
    if (!sessionResult.rowCount) {
        send(ws, { type: "error", message: "Conecteaza-te din nou la cont." });
        return;
    }

    const room = String(data.room || "").toUpperCase();
    if (!/^[A-Z0-9]{4,10}$/.test(room)) {
        send(ws, { type: "error", message: "Codul lumii trebuie sa aiba 4-10 caractere." });
        return;
    }

    await database.query(
        "INSERT INTO square_rooms (room_code, seed, blocks) " +
        "VALUES ($1, $2, '{}'::jsonb) ON CONFLICT (room_code) DO NOTHING",
        [room, crypto.randomInt(1, 1000000)]
    );
    const roomResult = await database.query(
        "SELECT seed, blocks FROM square_rooms WHERE room_code = $1",
        [room]
    );

    const account = sessionResult.rows[0];
    const skinResult = await database.query(
        "SELECT skin_data FROM square_skins WHERE username_key = $1",
        [account.username_key]
    );
    const info = {
        name: account.display_name,
        usernameKey: account.username_key,
        room: room,
        position: { x: 0, y: 10, z: 0 },
        yaw: 0,
        skin: skinResult.rows[0] ? skinResult.rows[0].skin_data : null,
        lastSkinAt: 0,
        lastChatAt: 0
    };

    const others = Array.from(players.values())
        .filter(player => player.room === room)
        .map(player => ({ name: player.name, position: player.position, yaw: player.yaw }));
    players.set(ws, info);

    send(ws, {
        type: "joined",
        room: room,
        seed: roomResult.rows[0].seed,
        blocks: roomResult.rows[0].blocks || {},
        players: others
    });

    for (const other of players.values()) {
        if (other !== info && other.room === room && other.skin) {
            send(ws, { type: "skin", name: other.name, skin: other.skin });
        }
    }
    if (info.skin) {
        broadcast(room, { type: "skin", name: info.name, skin: info.skin }, ws);
    }
    broadcast(room, {
        type: "player",
        name: info.name,
        position: info.position,
        yaw: info.yaw
    }, ws);
    console.log(info.name + " a intrat in lumea " + room);
}

wss.on("connection", (ws, request) => {
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
        ws.close(1008, "Origin not allowed");
        return;
    }
    ws.on("error", error => console.error("WebSocket:", error.message));

    ws.on("message", async raw => {
        try {
            const data = JSON.parse(raw.toString());
            if (!data || typeof data !== "object") return;
            const info = players.get(ws);

            if (data.type === "join" && !info) {
                await handleJoin(ws, data);
                return;
            }
            if (!info) return;

            if (data.type === "skin") {
                if (!validSkin(data.skin)) {
                    send(ws, { type: "error", message: "Skin PNG invalid sau prea mare." });
                    return;
                }
                if (Date.now() - info.lastSkinAt < 1000) return;
                info.lastSkinAt = Date.now();
                info.skin = data.skin;

                await database.query(
                    "INSERT INTO square_skins (username_key, skin_data, updated_at) " +
                    "VALUES ($1, $2, NOW()) ON CONFLICT (username_key) " +
                    "DO UPDATE SET skin_data = EXCLUDED.skin_data, updated_at = NOW()",
                    [info.usernameKey, info.skin]
                );
                broadcast(info.room, {
                    type: "skin",
                    name: info.name,
                    skin: info.skin
                }, ws);
                return;
            }

            if (data.type === "chat") {
                if (typeof data.text !== "string") return;
                const message = data.text.trim().slice(0, 200);
                if (!message || Date.now() - info.lastChatAt < 500) return;
                info.lastChatAt = Date.now();
                broadcast(info.room, { type: "chat", name: info.name, text: message });
                return;
            }

            if (data.type === "move") {
                const p = data.position;
                if (!p || ![p.x, p.y, p.z].every(
                    value => Number.isFinite(value) && Math.abs(value) < 100000
                )) return;
                info.position = { x: p.x, y: p.y, z: p.z };
                if (Number.isFinite(data.yaw)) info.yaw = data.yaw;
                broadcast(info.room, {
                    type: "player",
                    name: info.name,
                    position: info.position,
                    yaw: info.yaw
                }, ws);
                return;
            }

            if (data.type === "block") {
                const { x, y, z, blockType } = data;
                if (![x, y, z, blockType].every(Number.isInteger) ||
                    Math.abs(x) > 5000 || Math.abs(z) > 5000 ||
                    y < -12 || y > 256 || blockType < -1 || blockType > 255) return;

                const key = String(x) + "," + String(y) + "," + String(z);
                const saved = await database.query(
                    "UPDATE square_rooms " +
                    "SET blocks = jsonb_set(blocks, ARRAY[$2]::text[], to_jsonb($3::integer), true), " +
                    "updated_at = NOW() " +
                    "WHERE room_code = $1 AND (blocks ? $2 OR (SELECT COUNT(*) FROM jsonb_object_keys(square_rooms.blocks)) < 20000)",
                    [info.room, key, blockType]
                );
                if (!saved.rowCount) return;
                broadcast(info.room, { type: "block", x, y, z, blockType }, ws);
            }
        } catch (error) {
            console.error("Eroare mesaj multiplayer:", error.message);
            send(ws, {
                type: "error",
                message: "A aparut o eroare la sincronizarea multiplayer."
            });
        }
    });

    ws.on("close", () => {
        const info = players.get(ws);
        if (!info) return;
        players.delete(ws);
        broadcast(info.room, { type: "leave", name: info.name });
        console.log(info.name + " a iesit din lumea " + info.room);
    });
});

async function start() {
    await initializeDatabase();
    server.listen(PORT, "0.0.0.0", () => {
        console.log("SQUARE STACK MULTIPLAYER");
        console.log("Supabase: conectat");
        console.log("Conturi, sesiuni, lumi si skinuri: PostgreSQL");
        console.log("Port: " + PORT);
    });
}

start().catch(error => {
    console.error("Serverul nu a putut porni:", error.message);
    process.exit(1);
});
