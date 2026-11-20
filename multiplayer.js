/* SQUARE STACK - MULTIPLAYER + SKINURI 3D */

const MP_SERVER_URL = "https://square-stack-multiplayer-1.onrender.com";

const mpServerOrigin =
    MP_SERVER_URL.trim().replace(/\/$/, "") ||
    location.origin;

const mpWebSocketUrl = mpServerOrigin
    .replace(/^http:/, "ws:")
    .replace(/^https:/, "wss:");

let mpSocket = null;
let mpActive = false;
let mpNetworkApplying = false;

let mpToken = sessionStorage.getItem("square_token") || "";
let mpUsername = sessionStorage.getItem("square_name") || "";

const mpAvatars = new Map();

function mpStatus(message) {
    const element = document.getElementById("mp-status");
    if (element) element.textContent = message;
}

// CONTURI
async function mpAccount(action) {
    const name = document.getElementById("mp-name").value.trim();
    const password = document.getElementById("mp-password").value;

    try {
        mpStatus("Se conectează...");

        const response = await fetch(mpServerOrigin + "/api/account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, name, password })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Eroare de conectare.");

        mpToken = data.token;
        mpUsername = data.name;
        sessionStorage.setItem("square_token", mpToken);
        sessionStorage.setItem("square_name", mpUsername);
        document.getElementById("mp-password").value = "";
        mpStatus("✅ Conectat: " + mpUsername);
    } catch (error) {
        mpStatus("❌ " + error.message);
    }
}

// UV-URI PENTRU SKIN MINECRAFT
function mpSetSkinUV(geometry, region, legacy) {
    let [x, y, w, h, d] = region;

    if (legacy && y >= 32) {
        x = x === 32 ? 40 : 0;
        y = 16;
    }

    const atlasHeight = legacy ? 32 : 64;
    const faces = [
        [x + d + w, y + d, d, h],
        [x, y + d, d, h],
        [x + d, y, w, d],
        [x + d + w, y, w, d],
        [x + 2 * d + w, y + d, w, h],
        [x + d, y + d, w, h]
    ];

    const uv = geometry.attributes.uv;
    for (let face = 0; face < 6; face++) {
        const [fx, fy, fw, fh] = faces[face];
        const u0 = fx / 64;
        const u1 = (fx + fw) / 64;
        const v0 = 1 - (fy + fh) / atlasHeight;
        const v1 = 1 - fy / atlasHeight;
        const i = face * 4;

        uv.setXY(i, u0, v1);
        uv.setXY(i + 1, u1, v1);
        uv.setXY(i + 2, u0, v0);
        uv.setXY(i + 3, u1, v0);
    }
    uv.needsUpdate = true;
}

function mpApplyAvatarSkin(avatar, skinData) {
    if (!avatar || !skinData || !avatar.userData.skinParts) return;

    const image = new Image();
    image.onload = () => {
        if (!avatar.parent) return;

        const modern = image.width === image.height;
        const legacy = image.width === image.height * 2;
        if (![64, 128].includes(image.width) || (!modern && !legacy)) return;

        const texture = new THREE.Texture(image);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;

        const material = new THREE.MeshLambertMaterial({
            map: texture,
            color: 0xffffff
        });

        for (const mesh of avatar.userData.skinParts) {
            mpSetSkinUV(mesh.geometry, mesh.userData.skinUV, legacy);
            mesh.material = material;
        }
        avatar.userData.skinTexture = texture;
    };
    image.src = skinData;
}

// PERSONAJELE PRIETENILOR
function mpClearAvatars() {
    for (const object of mpAvatars.values()) {
        if (scene) scene.remove(object);
        object.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material && child.material !== undefined) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(material => {
                    if (material.map) material.map.dispose();
                    material.dispose();
                });
            }
        });
    }
    mpAvatars.clear();
}

function mpCreateAvatar(name) {
    const group = new THREE.Group();
    group.name = "SquareStack_Player_" + name;
    group.userData.skinParts = [];

    const parts = [
        { size: [0.7, 0.7, 0.7], pos: [0, -0.35, 0], uv: [0, 0, 8, 8, 8] },
        { size: [0.7, 0.8, 0.35], pos: [0, -1.05, 0], uv: [16, 16, 8, 12, 4] },
        { size: [0.3, 0.8, 0.35], pos: [-0.5, -1.05, 0], uv: [40, 16, 4, 12, 4] },
        { size: [0.3, 0.8, 0.35], pos: [0.5, -1.05, 0], uv: [32, 48, 4, 12, 4] },
        { size: [0.3, 0.6, 0.35], pos: [-0.2, -1.75, 0], uv: [0, 16, 4, 12, 4] },
        { size: [0.3, 0.6, 0.35], pos: [0.2, -1.75, 0], uv: [16, 48, 4, 12, 4] }
    ];

    const fallback = new THREE.MeshLambertMaterial({ color: 0x3388ee });

    for (const part of parts) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...part.size), fallback);
        mesh.position.set(...part.pos);
        mesh.userData.skinUV = part.uv;
        group.add(mesh);
        group.userData.skinParts.push(mesh);
    }

    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 256;
    labelCanvas.height = 64;
    const context = labelCanvas.getContext("2d");
    context.clearRect(0, 0, 256, 64);
    context.font = "bold 28px Arial";
    context.textAlign = "center";
    context.lineWidth = 5;
    context.strokeStyle = "rgba(0,0,0,.85)";
    context.strokeText(name, 128, 42);
    context.fillStyle = "#ffffff";
    context.fillText(name, 128, 42);

    const label = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(labelCanvas),
        transparent: true,
        depthTest: false
    }));
    label.scale.set(2.5, 0.6, 1);
    label.position.y = 0.65;
    group.add(label);

    scene.add(group);
    mpAvatars.set(name, group);
    return group;
}

function mpUpdateAvatar(name, position, yaw) {
    if (name === mpUsername || !scene || !position) return;

    let avatar = mpAvatars.get(name);
    if (!avatar) avatar = mpCreateAvatar(name);

    avatar.position.set(position.x, position.y, position.z);
    if (Number.isFinite(yaw)) avatar.rotation.y = yaw + Math.PI;
}

function mpSetRemoteSkin(name, skin) {
    if (!name || !skin || name === mpUsername) return;
    let avatar = mpAvatars.get(name);
    if (!avatar) avatar = mpCreateAvatar(name);
    mpApplyAvatarSkin(avatar, skin);
}

function mpSendMySkin() {
    if (!mpSocket || mpSocket.readyState !== WebSocket.OPEN) return;
    let skin = null;
    try { skin = localStorage.getItem("squareStackSkin"); } catch {}
    if (skin) mpSocket.send(JSON.stringify({ type: "skin", skin }));
}

// INTRĂ ÎN LUME
function mpJoin() {
    if (!mpToken) {
        mpStatus("Creează un cont sau conectează-te!");
        return;
    }

    const room = document.getElementById("mp-room").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,10}$/.test(room)) {
        mpStatus("Codul trebuie să aibă 4-10 caractere.");
        return;
    }

    if (mpSocket) mpSocket.close();
    mpActive = false;
    const socket = new WebSocket(mpWebSocketUrl);
    mpSocket = socket;
    mpStatus("Se conectează la lumea " + room + "...");

    socket.onopen = () => {
        socket.send(JSON.stringify({ type: "join", token: mpToken, room }));
    };

    socket.onmessage = event => {
        if (socket !== mpSocket) return;
        const data = JSON.parse(event.data);

        if (data.type === "error") {
            mpStatus("❌ " + data.message);
            return;
        }

        if (data.type === "joined") {
            mpClearAvatars();
            startWorld({
                id: "online-" + data.room,
                name: data.room,
                type: "normal",
                mode: "creative",
                seed: data.seed,
                data: null
            });

            mpNetworkApplying = true;
            WORLD_EDITS.clear();
            for (const [key, value] of Object.entries(data.blocks || {})) {
                WORLD_EDITS.set(key, value);
            }
            clearLoadedChunks();
            updateWorldChunks(player.x, player.z);
            mpNetworkApplying = false;
            mpActive = true;

            for (const other of data.players || []) {
                mpUpdateAvatar(other.name, other.position, other.yaw);
            }

            mpSendMySkin();
            mpStatus("✅ Ai intrat în lumea " + data.room);
        }

        if (data.type === "player") {
            mpUpdateAvatar(data.name, data.position, data.yaw);
        }

        if (data.type === "skin") {
            mpSetRemoteSkin(data.name, data.skin);
        }

        if (data.type === "leave") {
            const avatar = mpAvatars.get(data.name);
            if (avatar) {
                scene.remove(avatar);
                mpAvatars.delete(data.name);
            }
        }

        if (data.type === "block" && mpActive) {
            mpNetworkApplying = true;
            setWorldBlock(data.x, data.y, data.z, data.blockType);
            mpNetworkApplying = false;
        }
    };

    socket.onerror = () => mpStatus("❌ Nu putem contacta serverul.");

    socket.onclose = () => {
        if (socket !== mpSocket) return;
        mpActive = false;
        mpClearAvatars();
        mpStatus("Conexiunea multiplayer s-a închis.");
    };
}

// SINCRONIZĂM BLOCURILE
const mpOriginalSetBlock = setWorldBlock;
setWorldBlock = function (x, y, z, blockType) {
    mpOriginalSetBlock(x, y, z, blockType);
    if (mpActive && !mpNetworkApplying && mpSocket?.readyState === WebSocket.OPEN) {
        mpSocket.send(JSON.stringify({ type: "block", x, y, z, blockType }));
    }
};

// POZIȚIA ȘI ORIENTAREA JUCĂTORULUI
setInterval(() => {
    if (!mpActive || !gameRunning || mpSocket?.readyState !== WebSocket.OPEN) return;
    mpSocket.send(JSON.stringify({
        type: "move",
        position: { x: player.x, y: player.y, z: player.z },
        yaw: player.yaw
    }));
}, 120);

// IEȘIRE DIN MULTIPLAYER
const mpOriginalPause = pauseGame;
pauseGame = function () {
    mpActive = false;
    if (mpSocket) {
        mpSocket.close();
        mpSocket = null;
    }
    mpClearAvatars();
    mpOriginalPause();
};

document.getElementById("mp-register").addEventListener("click", () => mpAccount("register"));
document.getElementById("mp-login").addEventListener("click", () => mpAccount("login"));
document.getElementById("mp-join").addEventListener("click", mpJoin);

if (mpUsername) mpStatus("Cont memorat: " + mpUsername);

// ÎNCĂRCARE ȘI SALVARE SKIN
let selectedSkin = null;

document.querySelectorAll("#skin-file").forEach(input => {
    input.addEventListener("change", function () {
        const file = this.files && this.files[0];
        if (!file) return;

        if (file.type !== "image/png") {
            alert("Alege un skin PNG!");
            this.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => {
                const valid =
                    (image.width === 64 && (image.height === 64 || image.height === 32)) ||
                    (image.width === 128 && (image.height === 128 || image.height === 64));

                if (!valid) {
                    alert("Skinul trebuie să fie 64x64, 64x32, 128x128 sau 128x64 pixeli!");
                    return;
                }

                selectedSkin = reader.result;
                document.querySelectorAll("#skin-preview").forEach(preview => {
                    preview.src = selectedSkin;
                    preview.style.display = "block";
                });
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
});

function saveSkin() {
    if (!selectedSkin) {
        try { selectedSkin = localStorage.getItem("squareStackSkin"); } catch {}
    }
    if (!selectedSkin) {
        alert("Alege mai întâi un skin!");
        return;
    }

    try {
        localStorage.setItem("squareStackSkin", selectedSkin);
        if (mpActive) mpSendMySkin();
        alert(mpActive
            ? "Skinul a fost salvat și trimis jucătorilor din lume!"
            : "Skinul a fost salvat! Va fi trimis când intri în multiplayer.");
    } catch {
        alert("Skinul nu a putut fi salvat. Încearcă un PNG mai mic.");
    }
}

// Reîncarcă preview-ul skinului salvat la pornirea jocului.
try {
    const savedSkin = localStorage.getItem("squareStackSkin");
    if (savedSkin) {
        document.querySelectorAll("#skin-preview").forEach(preview => {
            preview.src = savedSkin;
            preview.style.display = "block";
        });
    }
} catch {}
