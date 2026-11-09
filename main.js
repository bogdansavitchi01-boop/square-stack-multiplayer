// ==========================================
// 2016CRAFT - MAIN.JS
// PARTEA 6 - MOTORUL JOCULUI
// ==========================================

// SCENA 3D

let scene;
let camera;
let renderer;
let clock;

let gameRunning = false;
let currentWorldId = null;

let player = {
    x: 0,
    y: 10,
    z: 0,
    yaw: 0,
    pitch: 0,
    velocityY: 0,
    grounded: false
};

let gamePerspective = "first";

const PLAYER_SPEED = 5;
const PLAYER_HEIGHT = 1.7;
const GRAVITY = 20;
const JUMP_FORCE = 8;

const keys = {
    forward: false,
    back: false,
    left: false,
    right: false
};

let looking = false;
let lastTouchX = 0;
let lastTouchY = 0;

let raycaster;
let worldBlockMeshes = [];


// ==========================================
// MENIURI
// ==========================================

function showMenu(menuId) {

    document.querySelectorAll(".menu").forEach(menu => {
        menu.classList.add("hidden");
    });

    document.getElementById("game-screen")
        .classList.add("hidden");

    const menu = document.getElementById(menuId);

    if (menu) {
        menu.classList.remove("hidden");
    }

    if (menuId === "world-menu") {
        renderWorldList();
    }
}


// ==========================================
// SETĂRI
// ==========================================

function saveSettings() {

    const settings = {
        controls:
            document.getElementById("control-mode").value,

        graphics:
            document.getElementById("graphics").value,

        perspective:
            document.getElementById("perspective").value
    };

    localStorage.setItem(
        "2016craft_settings",
        JSON.stringify(settings)
    );

    gamePerspective = settings.perspective;

    alert("Setările au fost salvate!");

    showMenu("main-menu");
}

function loadSettings() {

    const saved = localStorage.getItem(
        "2016craft_settings"
    );

    if (!saved) return;

    try {

        const settings = JSON.parse(saved);

        document.getElementById("control-mode").value =
            settings.controls || "mobile";

        document.getElementById("graphics").value =
            settings.graphics || "medium";

        document.getElementById("perspective").value =
            settings.perspective || "first";

        gamePerspective = settings.perspective || "first";

    } catch (error) {
        console.error("Eroare la setări:", error);
    }
}


// ==========================================
// CONT LOCAL
// ==========================================

function saveAccount() {

    const username = document.getElementById(
        "username"
    ).value.trim();

    if (!username) {
        alert("Scrie numele jucătorului!");
        return;
    }

    localStorage.setItem(
        "2016craft_username",
        username
    );

    alert("Profil salvat: " + username);

    showMenu("main-menu");
}


// ==========================================
// LISTA LUMILOR
// ==========================================

function getWorlds() {

    try {
        return JSON.parse(
            localStorage.getItem("2016craft_worlds")
        ) || [];
    } catch {
        return [];
    }
}

function saveWorlds(worlds) {

    localStorage.setItem(
        "2016craft_worlds",
        JSON.stringify(worlds)
    );
}

function renderWorldList() {

    const container = document.getElementById(
        "world-list"
    );

    container.innerHTML = "";

    const worlds = getWorlds();

    if (worlds.length === 0) {

        const message = document.createElement("p");

        message.textContent =
            "Nu ai încă nicio lume. Creează una!";

        container.appendChild(message);
        return;
    }

    worlds.forEach(world => {

        const button = document.createElement("button");

        button.textContent = "🌍 " + world.name;

        button.onclick = () => loadWorld(world.id);

        container.appendChild(button);
    });
}


// ==========================================
// CREAREA UNEI LUMI
// ==========================================

function createWorld() {

    const name =
        document.getElementById("world-name").value.trim()
        || "Lumea mea";

    const type =
        document.getElementById("world-type").value;

    const mode =
        document.getElementById("game-mode").value;

    const world = {
        id: Date.now().toString(),
        name: name,
        type: type,
        mode: mode,
        seed: Math.floor(Math.random() * 1000000),
        data: null
    };

    const worlds = getWorlds();

    worlds.push(world);

    saveWorlds(worlds);

    startWorld(world);
}


// ==========================================
// ÎNCĂRCAREA UNEI LUMI
// ==========================================

function loadWorld(id) {

    const world = getWorlds().find(
        item => item.id === id
    );

    if (!world) {
        alert("Lumea nu a fost găsită!");
        return;
    }

    startWorld(world);
}


// ==========================================
// PORNIREA JOCULUI
// ==========================================

function startWorld(world) {

    currentWorldId = world.id;

    if (!renderer) {
        initialize3D();
    }

    // Resetăm jucătorul
    player.x = 0;
    player.z = 0;
    player.y = getTerrainHeight(0, 0) + PLAYER_HEIGHT + 2;

    player.yaw = 0;
    player.pitch = 0;
    player.velocityY = 0;

    initializeWorld(
        scene,
        world.type,
        world.seed
    );

    initializeInventory(world.mode);
    initializeEnemies();
    initializeAnimals();

    // Încărcăm modificările salvate
    if (world.data) {

        if (world.data.terrain) {
            importWorldData(world.data.terrain);
        }

        if (world.data.inventory) {
            importInventoryData(world.data.inventory);
        }

        if (world.data.player) {
            Object.assign(player, world.data.player);
        }

        // Reconstruim terenul după import
        clearLoadedChunks();

        updateWorldChunks(player.x, player.z);
    }

    document.querySelectorAll(".menu").forEach(menu => {
        menu.classList.add("hidden");
    });

    document.getElementById("game-screen")
        .classList.remove("hidden");

    gameRunning = true;

    resizeGame();

    clock.getDelta();
}


// ==========================================
// CREAREA SCENEI 3D
// ==========================================

function initialize3D() {

    scene = new THREE.Scene();

    scene.background = new THREE.Color(0x87ceeb);

    scene.fog = new THREE.Fog(
        0x87ceeb,
        30,
        65
    );

    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.05,
        100
    );

    renderer = new THREE.WebGLRenderer({
        antialias: false,
        powerPreference: "low-power"
    });

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, 1.5)
    );

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    const container = document.getElementById(
        "game-container"
    );

    container.appendChild(renderer.domElement);

    // Lumină naturală
    const ambient = new THREE.HemisphereLight(
        0xffffff,
        0x667744,
        1.1
    );

    scene.add(ambient);

    const sun = new THREE.DirectionalLight(
        0xffffff,
        0.8
    );

    sun.position.set(20, 40, 10);

    scene.add(sun);

    raycaster = new THREE.Raycaster();

    raycaster.far = 6;

    clock = new THREE.Clock();

    setupControls();

    window.addEventListener("resize", resizeGame);

    animate();
}


// ==========================================
// RECONSTRUIREA CHUNK-URILOR
// ==========================================

function clearLoadedChunks() {

    for (const group of WORLD_CHUNKS.values()) {
        scene.remove(group);
    }

    WORLD_CHUNKS.clear();
}


// ==========================================
// MIȘCAREA JUCĂTORULUI
// ==========================================

function updatePlayer(delta) {

    const speed = PLAYER_SPEED * delta;

    let forward = 0;
    let sideways = 0;

    if (keys.forward) forward += 1;
    if (keys.back) forward -= 1;

    if (keys.right) sideways += 1;
    if (keys.left) sideways -= 1;

    const length = Math.hypot(forward, sideways);

    if (length > 0) {

        forward /= length;
        sideways /= length;

        const sin = Math.sin(player.yaw);
        const cos = Math.cos(player.yaw);

        player.x += (
            -sin * forward +
            cos * sideways
        ) * speed;

        player.z += (
            -cos * forward -
            sin * sideways
        ) * speed;
    }

    // Gravitație
    player.velocityY -= GRAVITY * delta;

    player.y += player.velocityY * delta;

   // ==========================================
// 2016CRAFT - COLIZIUNE CU BLOCURILE
// ==========================================

const blockX = Math.floor(player.x + 0.5);
const blockZ = Math.floor(player.z + 0.5);

// Inaltimea terenului natural
let groundY = getTerrainHeight(blockX, blockZ);

// Cautam blocurile construite sub jucator
const feetY = player.y - PLAYER_HEIGHT;

for (let y = Math.floor(feetY + 0.5); y >= MIN_WORLD_Y; y--) {

    const block = getWorldBlock(blockX, y, blockZ);

    if (block !== -1) {
        groundY = y;
        break;
    }
}

// Pozitia corecta a jucatorului
const ground = groundY + PLAYER_HEIGHT + 0.5;

    if (player.y <= ground) {

        player.y = ground;

        player.velocityY = 0;
        player.grounded = true;

    } else {

        player.grounded = false;
    }

    updateCamera();

    updateWorldChunks(player.x, player.z);
}


// ==========================================
// CAMERA
// ==========================================

function updateCamera() {

    const direction = new THREE.Vector3(
        -Math.sin(player.yaw) * Math.cos(player.pitch),
        Math.sin(player.pitch),
        -Math.cos(player.yaw) * Math.cos(player.pitch)
    );

    if (gamePerspective === "first") {

        camera.position.set(
            player.x,
            player.y,
            player.z
        );

        camera.lookAt(
            player.x + direction.x,
            player.y + direction.y,
            player.z + direction.z
        );

    } else {

        camera.position.set(
            player.x - direction.x * 4,
            player.y + 2 - direction.y,
            player.z - direction.z * 4
        );

        camera.lookAt(
            player.x + direction.x * 3,
            player.y + direction.y * 3,
            player.z + direction.z * 3
        );
    }
}


// ==========================================
// SĂRITUL
// ==========================================

function jump() {

    if (!gameRunning) return;

    if (player.grounded) {

        player.velocityY = JUMP_FORCE;
        player.grounded = false;
    }
}


// ==========================================
// BLOCUL PRIVIT
// ==========================================

function getTargetBlock() {

    raycaster.setFromCamera(
        new THREE.Vector2(0, 0),
        camera
    );

    const objects = [];

    for (const group of WORLD_CHUNKS.values()) {

        for (const child of group.children) {
            objects.push(child);
        }
    }

    const hits = raycaster.intersectObjects(
        objects,
        false
    );

    return hits.length > 0 ? hits[0] : null;
}


// ==========================================
// MINERIT
// ==========================================

function mineBlock() {

    if (!gameRunning) return;

    const hit = getTargetBlock();

    if (!hit) return;

    const mesh = hit.object;

    const { x, y, z, type } = mesh.userData;

    // Colectăm resursa
    if (INVENTORY_GAME_MODE !== "creative") {

        const added = addInventoryItem(type, 1);

        if (!added) {
            alert("Inventarul este plin!");
            return;
        }
    }

    // -1 înseamnă bloc eliminat
    setWorldBlock(x, y, z, -1);
}


// ==========================================
// CONSTRUCȚIE
// ==========================================

function placeBlock() {

    if (!gameRunning) return;

    const type = getSelectedBlockType();

    if (type < 0) return;

    const hit = getTargetBlock();

    if (!hit) return;

    const position = hit.object.position.clone();

    const normal = hit.face.normal.clone();

    // Blocurile nu sunt rotite
    position.add(normal);

    const x = Math.round(position.x);
    const y = Math.round(position.y);
    const z = Math.round(position.z);

    if (getWorldBlock(x, y, z) !== -1) {
        return;
    }

    // Nu construim în interiorul jucătorului
    if (
        Math.abs(x - player.x) < 0.8 &&
        Math.abs(z - player.z) < 0.8 &&
        Math.abs(y - (player.y - 1)) < 1.8
    ) {
        return;
    }

    if (!useSelectedBlock()) return;

    setWorldBlock(x, y, z, type);
}


// ==========================================
// SCHIMBAREA PERSPECTIVEI
// ==========================================

function changePerspective() {

    gamePerspective =
        gamePerspective === "first"
            ? "third"
            : "first";

    updateCamera();
}


// ==========================================
// PAUZĂ
// ==========================================

function pauseGame() {

    saveGame();

    gameRunning = false;

    showMenu("main-menu");
}


// ==========================================
// SALVAREA JOCULUI
// ==========================================

function saveGame() {

    if (!currentWorldId) return;

    const worlds = getWorlds();

    const world = worlds.find(
        item => item.id === currentWorldId
    );

    if (!world) return;

    world.data = {
        terrain: exportWorldData(),
        inventory: exportInventoryData(),
        player: { ...player }
    };

    try {

        saveWorlds(worlds);

        console.log("2016CRAFT: Lume salvată!");

    } catch (error) {

        console.error(error);

        alert(
            "Nu s-a putut salva lumea. " +
            "Spațiul de stocare poate fi plin."
        );
    }
}
// =====================================
// 2016CRAFT - REPARARE ECRAN 3D
// =====================================

function resizeGame() {

    if (!renderer || !camera) {
        return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
}

// =====================================
// 2016CRAFT - ANIMAȚIA JOCULUI 3D
// =====================================

function animate() {

    requestAnimationFrame(animate);

    if (!clock || !renderer || !scene || !camera) {
        return;
    }

    const delta = Math.min(clock.getDelta(), 0.05);

    if (!gameRunning) {
        return;
    }
    updatePlayer(delta);

updateAnimals(delta);
    
    updateEnemies(delta);

renderer.render(scene, camera);
}
// ==========================================
// CONTROALE TACTILE
// ==========================================

function bindMovementButton(id, direction) {

    const button = document.getElementById(id);

    if (!button) return;

    button.addEventListener("pointerdown", event => {

        event.preventDefault();

        keys[direction] = true;

        button.setPointerCapture(event.pointerId);
    });

    function release(event) {

        event.preventDefault();

        keys[direction] = false;
    }

    button.addEventListener("pointerup", release);

    button.addEventListener("pointercancel", release);

    button.addEventListener("lostpointercapture", () => {
        keys[direction] = false;
    });
}

function setupControls() {

    bindMovementButton("move-forward", "forward");
    bindMovementButton("move-back", "back");
    bindMovementButton("move-left", "left");
    bindMovementButton("move-right", "right");

    document.getElementById("jump-button")
        .addEventListener("click", jump);

    document.getElementById("mine-button")
        .addEventListener("click", mineBlock);

    document.getElementById("place-button")
        .addEventListener("click", placeBlock);

    // Rotirea camerei cu degetul
    const canvas = renderer.domElement;

    canvas.addEventListener("pointerdown", event => {

        looking = true;

        lastTouchX = event.clientX;
        lastTouchY = event.clientY;

        canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", event => {

        if (!looking || !gameRunning) return;

        const dx = event.clientX - lastTouchX;
        const dy = event.clientY - lastTouchY;

        player.yaw -= dx * 0.004;
        player.pitch -= dy * 0.004;

        player.pitch = Math.max(
            -1.45,
            Math.min(1.45, player.pitch)
        );

        lastTouchX = event.clientX;
        lastTouchY = event.clientY;
    });

    canvas.addEventListener("pointerup", () => {
        looking = false;
    });

    canvas.addEventListener("pointercancel", () => {
        looking = false;
    });

    // Tastatură
    window.addEventListener("keydown", event => {

        switch (event.code) {

            case "KeyW":
            case "ArrowUp":
                keys.forward = true;
                break;

            case "KeyS":
            case "ArrowDown":
                keys.back = true;
                break;

            case "KeyA":
            case "ArrowLeft":
                keys.left = true;
                break;

            case "KeyD":
            case "ArrowRight":
                keys.right = true;
                break;

            case "Space":
                if (!event.repeat) jump();
                break;

            case "KeyQ":
                if (!event.repeat) mineBlock();
                break;

            case "KeyE":
                if (!event.repeat) placeBlock();
                break;
                    }
               });
           }
        window.showMenu = function(menuId) {
    document.querySelectorAll(".menu").forEach(menu => {
        menu.classList.add("hidden");
    });

    document.getElementById("game-screen")
        .classList.add("hidden");

    const menu = document.getElementById(menuId);

    if (menu) {
        menu.classList.remove("hidden");
    }

    if (menuId === "world-menu") {
        renderWorldList();
    }
};
// CLICK DREAPTA PE INAMIC 
document.addEventListener("contextmenu", function(event) {
    if (!gameRunning) return;

    event.preventDefault();
    hitEnemy();
});

