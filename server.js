
/* ==========================================
   SQUARE STACK - SERVER MULTIPLAYER
   CONTURI + LUMI + SKINURI 3D
   ========================================== */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { WebSocketServer } = require("ws");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const scrypt = promisify(crypto.scrypt);

/* ==========================================
   SUPABASE / POSTGRESQL
   ========================================== */

const database = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        },
        max: 5,
        connectionTimeoutMillis: 10000
    })
    : null;

if (database) {
    database.on("error", error => {
        console.error(
            "Eroare PostgreSQL:",
            error.message
        );
    });
}

async function testDatabase() {
    if (!database) return;

    try {
        await database.query("SELECT NOW()");

        console.log(
            "Square Stack: Supabase conectat!"
        );
    } catch (error) {
        console.error(
            "Conexiunea Supabase a esuat:",
            error.message
        );
    }
}

/* ==========================================
   SALVAREA DATELOR
   ========================================== */

const dataFolder = path.join(
    __dirname,
    "server-data"
);

fs.mkdirSync(dataFolder, {
    recursive: true
});

function readJSON(name, fallback) {
    try {
        const file = path.join(dataFolder, name);

        return JSON.parse(
            fs.readFileSync(file, "utf8")
        );
    } catch {
        return fallback;
    }
}

function saveJSON(name, data) {
    fs.writeFileSync(
        path.join(dataFolder, name),
        JSON.stringify(data, null, 2)
    );
}

const accounts = readJSON("accounts.json", {});
const rooms = readJSON("rooms.json", {});

const sessions = new Map();
const players = new Map();
const attempts = new Map();

/* ==========================================
   FUNCTII HTTP
   ========================================== */

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
    const buffer = await scrypt(
        password,
        salt,
        64
    );

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

/* ==========================================
   SERVER HTTP
   ========================================== */

const server = http.createServer(
    async (req, res) => {

        const allowedOrigins = [
            "https://squerstackreal.netlify.app",
            "http://127.0.0.1:5500",
            "http://localhost:5500"
        ];

        const origin = req.headers.origin;

        if (allowedOrigins.includes(origin)) {
            res.setHeader("Access-Control-Allow-Origin", origin);
        }

        res.setHeader("Vary", "Origin");

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
            res.end();
            return;
        }

        const url = new URL(
            req.url,
            "http://localhost"
        );

        /* ==============================
           DESCARCARE APK / EXE
           ============================== */

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
                __dirname,
                "downloads",
                download.file
            );

            fs.stat(filePath, (error, stats) => {
                if (error || !stats.isFile()) {
                    res.writeHead(404, {
                        "Content-Type":
                            "text/plain; charset=utf-8"
                    });

                    res.end(
                        "Aceasta versiune nu este inca disponibila."
                    );

                    return;
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

        /* ==============================
           CONTURI SQUARE STACK
           ============================== */

        if (
            url.pathname === "/api/account" &&
            req.method === "POST"
        ) {
            if (limited(req.socket.remoteAddress)) {
                return reply(res, 429, {
                    error:
                        "Prea multe incercari. Incearca mai tarziu."
                });
            }

            try {
                const data = await bodyJSON(req);

                const name = String(
                    data.name || ""
                ).trim();

                const password = String(
                    data.password || ""
                );

                const key = name.toLowerCase();

                if (
                    !/^[a-zA-Z0-9_]{3,20}$/.test(name)
                ) {
                    return reply(res, 400, {
                        error:
                            "Numele trebuie sa aiba 3-20 caractere."
                    });
                }

                if (
                    password.length < 10 ||
                    password.length > 128
                ) {
                    return reply(res, 400, {
                        error:
                            "Parola trebuie sa aiba minimum 10 caractere."
                    });
                }

                if (data.action === "register") {

                    if (accounts[key]) {
                        return reply(res, 409, {
                            error:
                                "Acest nume este deja folosit."
                        });
                    }

                    const salt = crypto
                        .randomBytes(16)
                        .toString("hex");

                    accounts[key] = {
                        name,
                        salt,
                        hash: await makeHash(
                            password,
                            salt
                        )
                    };

                    saveJSON(
                        "accounts.json",
                        accounts
                    );

                } else if (data.action === "login") {

                    const account = accounts[key];

                    if (!account) {
                        return reply(res, 401, {
                            error:
                                "Nume sau parola gresita."
                        });
                    }

                    const calculated = await makeHash(
                        password,
                        account.salt
                    );

                    const valid = crypto.timingSafeEqual(
                        Buffer.from(
                            calculated,
                            "hex"
                        ),
                        Buffer.from(
                            account.hash,
                            "hex"
                        )
                    );

                    if (!valid) {
                        return reply(res, 401, {
                            error:
                                "Nume sau parola gresita."
                        });
                    }

                } else {
                    return reply(res, 400, {
                        error:
                            "Actiune necunoscuta."
                    });
                }

                const token = crypto
                    .randomBytes(32)
                    .toString("hex");

                sessions.set(token, {
                    name: accounts[key].name,
                    expires:
                        Date.now() + 86400000
                });

                return reply(res, 200, {
                    token,
                    name: accounts[key].name
                });

            } catch (error) {
                console.error(error);

                return reply(res, 400, {
                    error: "Cerere invalida."
                });
            }
        }

        /* ==============================
           FISIERELE JOCULUI
           ============================== */

        let filename =
            url.pathname.substring(1);

        if (!filename) {
            filename = "site.html";
        }

        const allowed =
            /^[a-zA-Z0-9_.-]+\.(html|js|css|png|jpg|jpeg|webp)$/;

        if (
            !allowed.test(filename) ||
            filename === "server.js" ||
            filename === "package.json" ||
            filename.startsWith(".")
        ) {
            res.writeHead(404);
            res.end("Nu exista.");
            return;
        }

        const filePath = path.join(
            __dirname,
            filename
        );

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
                "Content-Type":
                    extensions[path.extname(filename)] ||
                    "application/octet-stream"
            });

            res.end(content);
        });
    }
);

/* ==========================================
   WEBSOCKET MULTIPLAYER
   ========================================== */

const wss = new WebSocketServer({
    server,
    maxPayload: 120000
});

function send(ws, message) {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(message));
    }
}

function broadcast(room, message, except) {
    for (const [ws, info] of players) {
        if (
            info.room === room &&
            ws !== except
        ) {
            send(ws, message);
        }
    }
}

/* ==========================================
   VERIFICAREA SKINURILOR PNG
   ========================================== */

function validSkin(skin) {
    if (
        typeof skin !== "string" ||
        skin.length > 90000 ||
        !skin.startsWith(
            "data:image/png;base64,"
        )
    ) {
        return false;
    }

    const encoded = skin.substring(
        "data:image/png;base64,".length
    );

    if (
        !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
    ) {
        return false;
    }

    const buffer = Buffer.from(
        encoded,
        "base64"
    );

    if (
        buffer.length < 24 ||
        buffer.length > 65536
    ) {
        return false;
    }

    const pngSignature = Buffer.from(
        "89504e470d0a1a0a",
        "hex"
    );

    if (
        !buffer.subarray(0, 8)
            .equals(pngSignature)
    ) {
        return false;
    }

    if (
        buffer.toString("ascii", 12, 16) !==
        "IHDR"
    ) {
        return false;
    }

    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);

    const validDimensions =
        (width === 64 && height === 64) ||
        (width === 64 && height === 32) ||
        (width === 128 && height === 128) ||
        (width === 128 && height === 64);

    return validDimensions;
}

/* ==========================================
   CONEXIUNI MULTIPLAYER
   ========================================== */

wss.on("connection", ws => {

    ws.on("error", console.error);

    ws.on("message", raw => {

        let data;

        try {
            data = JSON.parse(
                raw.toString()
            );
        } catch {
            return;
        }

        if (
            !data ||
            typeof data !== "object"
        ) {
            return;
        }

        let info = players.get(ws);

        /* ==============================
           INTRARE IN LUME
           ============================== */

        if (
            data.type === "join" &&
            !info
        ) {
            const session = sessions.get(
                data.token
            );

            if (
                !session ||
                session.expires < Date.now()
            ) {
                send(ws, {
                    type: "error",
                    message:
                        "Conecteaza-te din nou la cont."
                });

                return;
            }

            const room = String(
                data.room || ""
            ).toUpperCase();

            if (
                !/^[A-Z0-9]{4,10}$/.test(room)
            ) {
                send(ws, {
                    type: "error",
                    message:
                        "Codul lumii trebuie sa aiba 4-10 caractere."
                });

                return;
            }

            if (!rooms[room]) {
                rooms[room] = {
                    seed: crypto.randomInt(
                        1,
                        1000000
                    ),
                    blocks: {}
                };

                saveJSON(
                    "rooms.json",
                    rooms
                );
            }

            info = {
                name: session.name,
                room,
                position: {
                    x: 0,
                    y: 10,
                    z: 0
                },
                yaw: 0,
                skin: null,
                lastSkinAt: 0
            };

            // Jucatorii deja conectati
            const others = [...players.values()]
                .filter(p => p.room === room)
                .map(p => ({
                    name: p.name,
                    position: p.position,
                    yaw: p.yaw
                }));

            players.set(ws, info);

            // Trimitem lumea si jucatorii
            send(ws, {
                type: "joined",
                room,
                seed: rooms[room].seed,
                blocks: rooms[room].blocks,
                players: others
            });

            // Trimitem separat skinurile
            // jucatorilor deja conectati
            for (const other of players.values()) {
                if (
                    other !== info &&
                    other.room === room &&
                    other.skin
                ) {
                    send(ws, {
                        type: "skin",
                        name: other.name,
                        skin: other.skin
                    });
                }
            }

            // Anuntam prietenii
            broadcast(room, {
                type: "player",
                name: info.name,
                position: info.position,
                yaw: info.yaw
            }, ws);

            console.log(
                info.name +
                " a intrat in lumea " +
                room
            );

            return;
        }

        // Fara cont conectat nu se continua
        if (!info) return;

        /* ==============================
           SKINURI MINECRAFT
           ============================== */

        if (data.type === "skin") {

            const skin = data.skin;

            if (!validSkin(skin)) {
                send(ws, {
                    type: "error",
                    message:
                        "Skin PNG invalid sau prea mare."
                });

                return;
            }

            const now = Date.now();

            if (
                now - info.lastSkinAt < 1000
            ) {
                return;
            }

            info.lastSkinAt = now;

            // Skinul este pastrat
            // pentru aceasta conexiune
            info.skin = skin;

            // Prietenii primesc skinul
            broadcast(info.room, {
                type: "skin",
                name: info.name,
                skin: info.skin
            }, ws);

            console.log(
                "Skin actualizat: " +
                info.name
            );

            return;
        }

        /* ==============================
           CHAT MULTIPLAYER
           ============================== */

        if (data.type === "chat") {

            if (
                typeof data.text !== "string"
            ) {
                return;
            }

            const message = data.text
                .trim()
                .slice(0, 200);

            if (!message) return;

            const now = Date.now();

            if (
                now - (info.lastChatAt || 0) <
                500
            ) {
                return;
            }

            info.lastChatAt = now;

            broadcast(info.room, {
                type: "chat",
                name: info.name,
                text: message
            });

            return;
        }

        /* ==============================
           MISCAREA JUCATORILOR
           ============================== */

        if (data.type === "move") {

            const p = data.position;

            if (
                !p ||
                ![p.x, p.y, p.z].every(
                    v =>
                        Number.isFinite(v) &&
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

            // Rotatia personajului
            if (
                Number.isFinite(data.yaw)
            ) {
                info.yaw = data.yaw;
            }

            broadcast(info.room, {
                type: "player",
                name: info.name,
                position: info.position,
                yaw: info.yaw
            }, ws);

            return;
        }

        /* ==============================
           BLOCURI CONSTRUITE / MINATE
           ============================== */

        if (data.type === "block") {

            const {
                x,
                y,
                z,
                blockType
            } = data;

            if (
                ![x, y, z, blockType]
                    .every(Number.isInteger) ||
                Math.abs(x) > 5000 ||
                Math.abs(z) > 5000 ||
                y < -12 ||
                y > 256 ||
                blockType < -1 ||
                blockType > 255
            ) {
                return;
            }

            const blocks =
                rooms[info.room].blocks;

            const key =
                `${x},${y},${z}`;

            if (
                !(key in blocks) &&
                Object.keys(blocks).length >=
                20000
            ) {
                return;
            }

            blocks[key] = blockType;

            saveJSON(
                "rooms.json",
                rooms
            );

            broadcast(info.room, {
                type: "block",
                x,
                y,
                z,
                blockType
            }, ws);

            return;
        }
    });

    /* ==============================
       IESIREA JUCATORULUI
       ============================== */

    ws.on("close", () => {

        const info = players.get(ws);

        if (!info) return;

        players.delete(ws);

        broadcast(info.room, {
            type: "leave",
            name: info.name
        });

        console.log(
            info.name +
            " a iesit din lumea " +
            info.room
        );
    });
});

/* ==========================================
   PORNIREA SERVERULUI
   ========================================== */

server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            "================================"
        );

        console.log(
            "SQUARE STACK MULTIPLAYER"
        );

        console.log(
            "Server: http://localhost:" + PORT
        );

        console.log(
            "Skinuri Minecraft: activate"
        );

        console.log(
            "Conturi: activate"
        );

        console.log(
            "Lumi multiplayer: activate"
        );

        console.log(
            "================================"
        );
    }
);

if (database) {
    testDatabase();
}
