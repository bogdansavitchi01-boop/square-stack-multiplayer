
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { WebSocketServer, WebSocket } = require("ws");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const scrypt = promisify(crypto.scrypt);

// BAZA DE DATE SUPABASE
if (!process.env.DATABASE_URL) {
    console.error("Lipsește DATABASE_URL!");
    process.exit(1);
}

const database = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    connectionTimeoutMillis: 10000
});

database.on("error", error => {
    console.error("Eroare PostgreSQL:", error.message);
});

const sessions = new Map();
const players = new Map();
const attempts = new Map();

// RĂSPUNS JSON
function reply(res, status, data) {
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
    });
    res.end(JSON.stringify(data));
}

async function bodyJSON(req) {
    let body = "";

    for await (const chunk of req) {
        body += chunk;
        if (body.length > 4096) {
            throw new Error("Cerere prea mare.");
        }
    }

    return JSON.parse(body);
}

async function makeHash(password, salt) {
    const buffer = await scrypt(password, salt, 64);
    return buffer.toString("hex");
}

function limited(ip) {
    const now = Date.now();
    const previous = attempts.get(ip) || [];
    const recent = previous.filter(
        time => now - time < 600000
    );

    recent.push(now);
    attempts.set(ip, recent);
    return recent.length > 15;
}

// SERVER HTTP
const server = http.createServer(async (req, res) => {
    res.setHeader(
        "Access-Control-Allow-Origin",
        "https://squerstack.netlify.app"
    );
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
    );
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
    }

    const url = new URL(req.url, "http://localhost");

    // DESCĂRCARE JOC
    const downloads = {
        "/download/windows": {
            file: "SquareStack-Setup.exe",
            type: "application/octet-stream"
        },
        "/download/android": {
            file: "SquareStack-Android.apk",
            type: "application/vnd.android.package-archive"
        }
    };

    const download = downloads[url.pathname];

    if (download) {
        const filePath = path.join(
            __dirname, "downloads", download.file
        );

        fs.stat(filePath, (error, stats) => {
            if (error || !stats.isFile()) {
                res.writeHead(404);
                return res.end("Versiune indisponibilă.");
            }

            res.writeHead(200, {
                "Content-Type": download.type,
                "Content-Length": stats.size,
                "Content-Disposition":
                    `attachment; filename="${download.file}"`
            });

            fs.createReadStream(filePath).pipe(res);
        });

        return;
    }

    // CONTURI SUPABASE
    if (
        url.pathname === "/api/account" &&
        req.method === "POST"
    ) {
        if (limited(req.socket.remoteAddress)) {
            return reply(res, 429, {
                error: "Prea multe încercări."
            });
        }

        let data;

        try {
            data = await bodyJSON(req);
        } catch {
            return reply(res, 400, {
                error: "Cerere invalidă."
            });
        }

        const name = String(data.name || "").trim();
        const password = String(data.password || "");
        const key = name.toLowerCase();

        if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) {
            return reply(res, 400, {
                error: "Numele trebuie să aibă 3-20 caractere."
            });
        }

        if (password.length < 10 ||
            password.length > 128) {
            return reply(res, 400, {
                error: "Parola trebuie să aibă 10-128 caractere."
            });
        }

        try {
            let account;

            if (data.action === "register") {
                const salt = crypto.randomBytes(16)
                    .toString("hex");

                const hash = await makeHash(password, salt);

                const result = await database.query(
                    `INSERT INTO public.accounts
                     (username, name, salt, hash)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (username) DO NOTHING
                     RETURNING name`,
                    [key, name, salt, hash]
                );

                if (!result.rowCount) {
                    return reply(res, 409, {
                        error: "Acest nume este deja folosit."
                    });
                }

                account = result.rows[0];

            } else if (data.action === "login") {
                const result = await database.query(
                    `SELECT name, salt, hash
                     FROM public.accounts
                     WHERE username = $1`,
                    [key]
                );

                account = result.rows[0];

                if (!account) {
                    return reply(res, 401, {
                        error: "Nume sau parolă greșită."
                    });
                }

                const calculated = Buffer.from(
                    await makeHash(password, account.salt),
                    "hex"
                );

                const stored = Buffer.from(
                    account.hash, "hex"
                );

                if (
                    calculated.length !== stored.length ||
                    !crypto.timingSafeEqual(calculated, stored)
                ) {
                    return reply(res, 401, {
                        error: "Nume sau parolă greșită."
                    });
                }

            } else {
                return reply(res, 400, {
                    error: "Acțiune necunoscută."
                });
            }

            const token = crypto.randomBytes(32)
                .toString("hex");

            sessions.set(token, {
                name: account.name,
                expires: Date.now() + 86400000
            });

            return reply(res, 200, {
                token,
                name: account.name
            });

        } catch (error) {
            console.error("Eroare cont:", error.message);

            return reply(res, 503, {
                error: "Baza de date este indisponibilă."
            });
        }
    }

    // FIȘIERELE JOCULUI
    let filename = url.pathname.substring(1);
    if (!filename) filename = "site.html";

    const allowed =
        /^[a-zA-Z0-9_.-]+\.(html|js|css|png|jpg|jpeg|webp)$/;

    if (
        !allowed.test(filename) ||
        filename === "server.js" ||
        filename === "package.json" ||
        filename.startsWith(".")
    ) {
        res.writeHead(404);
        return res.end("Nu există.");
    }

    const extensions = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp"
    };

    fs.readFile(
        path.join(__dirname, filename),
        (error, content) => {
            if (error) {
                res.writeHead(404);
                return res.end("Fișier negăsit.");
            }

            res.writeHead(200, {
                "Content-Type":
                    extensions[path.extname(filename)] ||
                    "application/octet-stream"
            });

            res.end(content);
        }
    );
});

// MULTIPLAYER
const wss = new WebSocketServer({
    server,
    maxPayload: 2048
});

function send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

function broadcast(room, message, except) {
    for (const [ws, info] of players) {
        if (info.room === room && ws !== except) {
            send(ws, message);
        }
    }
}

// ÎNCARCĂ SAU CREEAZĂ LUMEA ÎN SUPABASE
async function getRoom(code) {
    const seed = crypto.randomInt(1, 1000000);

    await database.query(
        `INSERT INTO public.rooms (code, seed, blocks)
         VALUES ($1, $2, '{}'::jsonb)
         ON CONFLICT (code) DO NOTHING`,
        [code, seed]
    );

    const result = await database.query(
        "SELECT seed, blocks FROM public.rooms WHERE code = $1",
        [code]
    );

    if (!result.rows.length) {
        throw new Error("Lumea nu a fost găsită.");
    }

    return result.rows[0];
}

// SALVEAZĂ BLOCURILE ÎN SUPABASE
async function saveBlock(room, x, y, z, blockType) {
    const key = `${x},${y},${z}`;
    const client = await database.connect();

    try {
        await client.query("BEGIN");

        const result = await client.query(
            `SELECT blocks FROM public.rooms
             WHERE code = $1 FOR UPDATE`,
            [room]
        );

        if (!result.rows.length) {
            await client.query("ROLLBACK");
            return false;
        }

        const blocks = result.rows[0].blocks || {};

        if (
            !Object.prototype.hasOwnProperty.call(blocks, key) &&
            Object.keys(blocks).length >= 20000
        ) {
            await client.query("ROLLBACK");
            return false;
        }

        blocks[key] = blockType;

        await client.query(
            `UPDATE public.rooms
             SET blocks = $2::jsonb
             WHERE code = $1`,
            [room, JSON.stringify(blocks)]
        );

        await client.query("COMMIT");
        return true;

    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

// CONEXIUNI JUCĂTORI
wss.on("connection", ws => {
    ws.on("error", console.error);

    let queue = Promise.resolve();

    ws.on("message", raw => {
        queue = queue.then(async () => {
            let data;

            try {
                data = JSON.parse(raw.toString());
            } catch {
                return;
            }

            let info = players.get(ws);

            // INTRARE ÎN LUME
            if (data.type === "join" && !info) {
                const session = sessions.get(data.token);

                if (
                    !session ||
                    session.expires < Date.now()
                ) {
                    send(ws, {
                        type: "error",
                        message: "Conectează-te din nou la cont."
                    });
                    return;
                }

                const room = String(
                    data.room || ""
                ).toUpperCase();

                if (!/^[A-Z0-9]{4,10}$/.test(room)) {
                    send(ws, {
                        type: "error",
                        message: "Codul lumii trebuie să aibă 4-10 caractere."
                    });
                    return;
                }

                const saved = await getRoom(room);

                if (ws.readyState !== WebSocket.OPEN) {
                    return;
                }

                info = {
                    name: session.name,
                    room,
                    position: { x: 0, y: 10, z: 0 }
                };

                const others = [...players.values()]
                    .filter(p => p.room === room)
                    .map(p => ({
                        name: p.name,
                        position: p.position
                    }));

                players.set(ws, info);

                send(ws, {
                    type: "joined",
                    room,
                    seed: saved.seed,
                    blocks: saved.blocks,
                    players: others
                });

                broadcast(room, {
                    type: "player",
                    name: info.name,
                    position: info.position
                }, ws);

                return;
            }

            if (!info) return;

            // MIȘCAREA JUCĂTORILOR
            if (data.type === "move") {
                const p = data.position;

                if (
                    !p ||
                    ![p.x, p.y, p.z].every(
                        v => Number.isFinite(v) &&
                             Math.abs(v) < 100000
                    )
                ) {
                    return;
                }

                info.position = {
                    x: p.x,
                    y: p.y,
                    z: p.z
                };

                broadcast(info.room, {
                    type: "player",
                    name: info.name,
                    position: info.position
                }, ws);
            }

            // CONSTRUIRE ȘI MINARE
            if (data.type === "block") {
                const { x, y, z, blockType } = data;

                if (
                    ![x, y, z, blockType].every(Number.isInteger) ||
                    Math.abs(x) > 5000 ||
                    Math.abs(z) > 5000 ||
                    y < -12 ||
                    y > 256 ||
                    blockType < -1 ||
                    blockType > 255
                ) {
                    return;
                }

                const saved = await saveBlock(
                    info.room, x, y, z, blockType
                );

                if (saved) {
                    broadcast(info.room, {
                        type: "block",
                        x, y, z, blockType
                    }, ws);
                } else {
                    send(ws, {
                        type: "error",
                        message: "Limita lumii a fost atinsă."
                    });
                }
            }

        }).catch(error => {
            console.error(
                "Eroare multiplayer:",
                error.message
            );

            send(ws, {
                type: "error",
                message: "Eroare la salvarea lumii."
            });
        });
    });

    // JUCĂTOR DECONECTAT
    ws.on("close", () => {
        const info = players.get(ws);
        if (!info) return;

        players.delete(ws);

        broadcast(info.room, {
            type: "leave",
            name: info.name
        });
    });
});

// PORNIRE SERVER
async function start() {
    try {
        await database.query(
            "SELECT 1 FROM public.accounts LIMIT 1"
        );

        await database.query(
            "SELECT 1 FROM public.rooms LIMIT 1"
        );

        console.log(
            "Square Stack: Supabase conectat!"
        );

        console.log(
            "Tabelele accounts și rooms funcționează!"
        );

        server.listen(PORT, "0.0.0.0", () => {
            console.log(
                "Square Stack multiplayer: http://localhost:" +
                PORT
            );
        });

    } catch (error) {
        console.error(
            "Eroare la pornirea serverului:",
            error.message
        );

        await database.end().catch(() => {});
        process.exitCode = 1;
    }
}

start();
