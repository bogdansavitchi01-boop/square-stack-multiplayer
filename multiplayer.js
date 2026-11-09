
/* SQUARE STACK - MULTIPLAYER */


const MP_SERVER_URL = "";

const mpServerOrigin =
    MP_SERVER_URL.trim().replace(/\/$/, "") ||
    location.origin;

const mpWebSocketUrl = mpServerOrigin
    .replace(/^http:/, "ws:")
    .replace(/^https:/, "wss:");

let mpSocket = null;
let mpActive = false;
let mpNetworkApplying = false;

let mpToken =
    sessionStorage.getItem("square_token") || "";

let mpUsername =
    sessionStorage.getItem("square_name") || "";

const mpAvatars = new Map();

function mpStatus(message) {
    const element = document.getElementById("mp-status");
    if (element) element.textContent = message;
}

// CONTURI
async function mpAccount(action) {
    const name = document.getElementById("mp-name")
        .value.trim();

    const password = document.getElementById("mp-password")
        .value;

    try {
        mpStatus("Se conectează...");

        const response = await fetch(mpServerOrigin + "/api/account", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                action,
                name,
                password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error);
        }

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

// PERSONAJELE PRIETENILOR
function mpClearAvatars() {
    for (const object of mpAvatars.values()) {
        if (scene) scene.remove(object);
    }

    mpAvatars.clear();
}

function mpCreateAvatar(name) {
    const group = new THREE.Group();

    const material = new THREE.MeshLambertMaterial({
        color: 0x3388ee
    });

    const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.7, 0.7),
        material
    );
    head.position.y = -0.3;
    group.add(head);

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.8, 0.35),
        material
    );
    body.position.y = -1.05;
    group.add(body);

    for (const x of [-0.2, 0.2]) {
        const leg = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.55, 0.35),
            material
        );
        leg.position.set(x, -1.65, 0);
        group.add(leg);
    }

    // Numele deasupra jucătorului
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 256;
    labelCanvas.height = 64;

    const context = labelCanvas.getContext("2d");
    context.fillStyle = "white";
    context.font = "bold 28px Arial";
    context.textAlign = "center";
    context.fillText(name, 128, 42);

    const texture = new THREE.CanvasTexture(labelCanvas);
    const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        })
    );

    label.scale.set(2.5, 0.6, 1);
    label.position.y = 0.65;
    group.add(label);

    scene.add(group);
    mpAvatars.set(name, group);

    return group;
}

function mpUpdateAvatar(name, position) {
    if (name === mpUsername) return;
    if (!scene || !position) return;

    let avatar = mpAvatars.get(name);

    if (!avatar) {
        avatar = mpCreateAvatar(name);
    }

    avatar.position.set(
        position.x,
        position.y,
        position.z
    );
}

// INTRĂ ÎN LUME
function mpJoin() {
    if (!mpToken) {
        mpStatus("Creează un cont sau conectează-te!");
        return;
    }

    const room = document.getElementById("mp-room")
        .value.trim().toUpperCase();

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
        socket.send(JSON.stringify({
            type: "join",
            token: mpToken,
            room
        }));
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

            // Pornim aceeași lume pentru toți
            startWorld({
                id: "online-" + data.room,
                name: data.room,
                type: "normal",
                mode: "creative",
                seed: data.seed,
                data: null
            });

            mpNetworkApplying = true;

            // Încărcăm blocurile comune
            WORLD_EDITS.clear();

            for (const [key, value] of Object.entries(
                data.blocks || {}
            )) {
                WORLD_EDITS.set(key, value);
            }

            clearLoadedChunks();
            updateWorldChunks(player.x, player.z);

            mpNetworkApplying = false;
            mpActive = true;

            for (const other of data.players) {
                mpUpdateAvatar(
                    other.name,
                    other.position
                );
            }

            mpStatus("✅ Ai intrat în lumea " + data.room);
        }

        if (data.type === "player") {
            mpUpdateAvatar(
                data.name,
                data.position
            );
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

            setWorldBlock(
                data.x,
                data.y,
                data.z,
                data.blockType
            );

            mpNetworkApplying = false;
        }
    };

    socket.onerror = () => {
        mpStatus("❌ Nu putem contacta serverul.");
    };

    socket.onclose = () => {
        if (socket !== mpSocket) return;

        mpActive = false;
        mpClearAvatars();

        mpStatus("Conexiunea multiplayer s-a închis.");
    };
}

// SINCRONIZĂM BLOCURILE
const mpOriginalSetBlock = setWorldBlock;

setWorldBlock = function(x, y, z, blockType) {
    mpOriginalSetBlock(x, y, z, blockType);

    if (
        mpActive &&
        !mpNetworkApplying &&
        mpSocket?.readyState === WebSocket.OPEN
    ) {
        mpSocket.send(JSON.stringify({
            type: "block",
            x, y, z, blockType
        }));
    }
};

// TRIMITEM POZIȚIA JUCĂTORULUI
setInterval(() => {
    if (
        !mpActive ||
        !gameRunning ||
        mpSocket?.readyState !== WebSocket.OPEN
    ) {
        return;
    }

    mpSocket.send(JSON.stringify({
        type: "move",
        position: {
            x: player.x,
            y: player.y,
            z: player.z
        }
    }));
}, 120);

// IEȘIRE DIN MULTIPLAYER
const mpOriginalPause = pauseGame;

pauseGame = function() {
    mpActive = false;

    if (mpSocket) {
        mpSocket.close();
        mpSocket = null;
    }

    mpClearAvatars();
    mpOriginalPause();
};

document.getElementById("mp-register")
    .addEventListener("click", () => mpAccount("register"));

document.getElementById("mp-login")
    .addEventListener("click", () => mpAccount("login"));

document.getElementById("mp-join")
    .addEventListener("click", mpJoin);

if (mpUsername) {
    mpStatus("Cont memorat: " + mpUsername);
}

let selectedSkin = null;

document.getElementById("skin-file")
    .addEventListener("change", function(event) {
        const file = event.target.files[0];

        if (!file) return;

        if (file.type !== "image/png") {
            alert("Alege un skin PNG!");
            return;
        }

        const reader = new FileReader();

        reader.onload = function() {
            selectedSkin = reader.result;

            document.getElementById("skin-preview").src =
                selectedSkin;
        };

        reader.readAsDataURL(file);
    });

function saveSkin() {
    if (!selectedSkin) {
        alert("Alege mai întâi un skin!");
        return;
    }

    try {
        localStorage.setItem("squareStackSkin", selectedSkin);
        alert("Skinul a fost salvat!");
    } catch {
        alert("Skinul nu a putut fi salvat.");
    }
}
