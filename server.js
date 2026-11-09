
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const scrypt = promisify(crypto.scrypt);

const dataFolder = path.join(__dirname, "server-data");
fs.mkdirSync(dataFolder, { recursive: true });

function readJSON(name, fallback) {
    try {
        return JSON.parse(
            fs.readFileSync(
                path.join(dataFolder, name),
                "utf8"
            )
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

    const url = new URL(
        req.url,
        "http://localhost"
    );
    
    // DESCARCARE SQUARE STACK

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
                    "Content-Type": "text/plain; charset=utf-8"
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


    // CONTURI
    if (
        url.pathname === "/api/account" &&
        req.method === "POST"
    ) {
        if (limited(req.socket.remoteAddress)) {
            return reply(res, 429, {
                error: "Prea multe încercări. Încearcă mai târziu."
            });
        }

        try {
            const data = await bodyJSON(req);

            const name = String(data.name || "").trim();
            const password = String(data.password || "");
            const key = name.toLowerCase();

            if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) {
                return reply(res, 400, {
                    error: "Numele trebuie să aibă 3-20 caractere."
                });
            }

            if (
                password.length < 10 ||
                password.length > 128
            ) {
                return reply(res, 400, {
                    error: "Parola trebuie să aibă minimum 10 caractere."
                });
            }

            if (data.action === "register") {
                if (accounts[key]) {
                    return reply(res, 409, {
                        error: "Acest nume este deja folosit."
                    });
                }

                const salt =
                    crypto.randomBytes(16).toString("hex");

                accounts[key] = {
                    name,
                    salt,
                    hash: await makeHash(password, salt)
                };

                saveJSON("accounts.json", accounts);

            } else if (data.action === "login") {
                const account = accounts[key];

                if (!account) {
                    return reply(res, 401, {
                        error: "Nume sau parolă greșită."
                    });
                }

                const calculated =
                    await makeHash(password, account.salt);

                const valid = crypto.timingSafeEqual(
                    Buffer.from(calculated, "hex"),
                    Buffer.from(account.hash, "hex")
                );

                if (!valid) {
                    return reply(res, 401, {
                        error: "Nume sau parolă greșită."
                    });
                }

            } else {
                return reply(res, 400, {
                    error: "Acțiune necunoscută."
                });
            }

            const token =
                crypto.randomBytes(32).toString("hex");

            sessions.set(token, {
                name: accounts[key].name,
                expires: Date.now() + 86400000
            });

            return reply(res, 200, {
                token,
                name: accounts[key].name
            });

        } catch (error) {
            console.error(error);

            return reply(res, 400, {
                error: "Cerere invalidă."
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
            return res.end("Fișier negăsit.");
        }

        res.writeHead(200, {
            "Content-Type":
                extensions[path.extname(filename)] ||
                "application/octet-stream"
        });

        res.end(content);
    });
});

// MULTIPLAYER
const wss = new WebSocketServer({
    server,
    maxPayload: 2048
});

function send(ws, message) {
    if (ws.readyState === 1) {
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

wss.on("connection", ws => {
    ws.on("error", console.error);

    ws.on("message", raw => {
        let data;

        try {
            data = JSON.parse(raw.toString());
        } catch {
            return;
        }

        let info = players.get(ws);

        // INTRĂ ÎN LUME
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

            if (!rooms[room]) {
                rooms[room] = {
                    seed: crypto.randomInt(1, 1000000),
                    blocks: {}
                };

                saveJSON("rooms.json", rooms);
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
                seed: rooms[room].seed,
                blocks: rooms[room].blocks,
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

        // BLOCURI CONSTRUITE SAU MINATE
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

            const blocks = rooms[info.room].blocks;
            const key = `${x},${y},${z}`;

            if (
                !(key in blocks) &&
                Object.keys(blocks).length >= 20000
            ) {
                return;
            }

            blocks[key] = blockType;
            saveJSON("rooms.json", rooms);

            broadcast(info.room, {
                type: "block",
                x, y, z, blockType
            }, ws);
        }
    });

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

server.listen(PORT, "0.0.0.0", () => {
    console.log(
        "Square Stack multiplayer: http://localhost:" + PORT
    );
});
