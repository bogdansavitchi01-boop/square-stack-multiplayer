// ==========================================
// 2016CRAFT - WORLD.JS
// PARTEA 4 - GENERAREA LUMII 3D
// ==========================================

// Dimensiunea unui chunk
const CHUNK_SIZE = 8;

// Câte chunk-uri păstrăm în jurul jucătorului
const CHUNK_DISTANCE = 2;

// Adâncimea minimă a terenului
const MIN_WORLD_Y = -12;

// Chunk-urile încărcate
const WORLD_CHUNKS = new Map();

// Modificările făcute de jucător
const WORLD_EDITS = new Map();

// Tipul lumii
let WORLD_TYPE = "normal";

// Seed-ul lumii
let WORLD_SEED = 2016;

// Scena 3D va fi furnizată de main.js
let WORLD_SCENE = null;


// ==========================================
// FUNCȚII AJUTĂTOARE
// ==========================================

function worldKey(x, y, z) {
    return `${x},${y},${z}`;
}

function chunkKey(cx, cz) {
    return `${cx},${cz}`;
}

function worldRandom(x, z) {

    const value = Math.sin(
        x * 127.1 +
        z * 311.7 +
        WORLD_SEED * 0.01
    ) * 43758.5453;

    return value - Math.floor(value);
}


// ==========================================
// ÎNĂLȚIMEA TERENULUI
// ==========================================

function getTerrainHeight(x, z) {

    if (WORLD_TYPE === "flat") {
        return 3;
    }

    let height =
        4 +
        Math.sin(x * 0.13) * 2 +
        Math.cos(z * 0.11) * 2 +
        Math.sin((x + z) * 0.07) * 2;

    if (WORLD_TYPE === "mountains") {

        height +=
            Math.sin(x * 0.035) * 7 +
            Math.cos(z * 0.045) * 7;
    }

    return Math.max(1, Math.floor(height));
}


// ==========================================
// GENERAREA MINEREURILOR
// ==========================================

function getOreType(x, y, z) {

    const value = worldRandom(
        x * 17 + y * 31,
        z * 23 - y * 13
    );

    // Diamant - foarte rar
    if (y < -7 && value > 0.985) {
        return 10;
    }

    // Aur
    if (y < -3 && value > 0.97) {
        return 9;
    }

    // Fier
    if (y < 3 && value > 0.95) {
        return 8;
    }

    // Cupru
    if (y < 6 && value > 0.94) {
        return 7;
    }

    // Cărbune
    if (value > 0.91) {
        return 6;
    }

    return 2; // Piatră
}


// ==========================================
// TIPUL UNUI BLOC
// ==========================================

function getNaturalBlock(x, y, z) {

    const surface = getTerrainHeight(x, z);

    if (y > surface || y < MIN_WORLD_Y) {
        return -1;
    }

    // Suprafața
    if (y === surface) {
        return 0; // Iarbă
    }

    // Pământ
    if (y >= surface - 3) {
        return 1;
    }

    // Piatră și minereuri
    return getOreType(x, y, z);
}


// ==========================================
// COPACI
// ==========================================

function isTreePosition(x, z) {

    if (WORLD_TYPE === "flat") {
        return false;
    }

    if (Math.abs(x) < 4 && Math.abs(z) < 4) {
        return false;
    }

    return worldRandom(x, z) > 0.985;
}

function getTreeBlock(x, y, z) {

    // Verificăm copacii din apropiere
    for (let tx = x - 2; tx <= x + 2; tx++) {

        for (let tz = z - 2; tz <= z + 2; tz++) {

            if (!isTreePosition(tx, tz)) {
                continue;
            }

            const ground = getTerrainHeight(tx, tz);

            const dx = Math.abs(x - tx);
            const dz = Math.abs(z - tz);

            // Trunchiul
            if (
                dx === 0 &&
                dz === 0 &&
                y > ground &&
                y <= ground + 4
            ) {
                return 3;
            }

            // Coroana
            if (
                y >= ground + 3 &&
                y <= ground + 5 &&
                dx <= 2 &&
                dz <= 2 &&
                dx + dz <= 3
            ) {
                return 4;
            }
        }
    }

    return -1;
}


// ==========================================
// BLOCUL EXISTENT ÎN LUME
// ==========================================

function getWorldBlock(x, y, z) {

    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);

    const key = worldKey(x, y, z);

    if (WORLD_EDITS.has(key)) {
        return WORLD_EDITS.get(key);
    }

    const natural = getNaturalBlock(x, y, z);

    if (natural !== -1) {
        return natural;
    }

    return getTreeBlock(x, y, z);
}


// ==========================================
// CREAREA UNUI CHUNK
// ==========================================

function generateChunk(cx, cz) {

    const id = chunkKey(cx, cz);

    if (WORLD_CHUNKS.has(id)) {
        return;
    }

    const group = new THREE.Group();

    const startX = cx * CHUNK_SIZE;
    const startZ = cz * CHUNK_SIZE;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {

        for (let lz = 0; lz < CHUNK_SIZE; lz++) {

            const x = startX + lx;
            const z = startZ + lz;

            const surface = getTerrainHeight(x, z);

            // Generăm și blocurile subterane
            for (
                let y = MIN_WORLD_Y;
                y <= surface + 6;
                y++
            ) {

                const type = getWorldBlock(x, y, z);

                if (type === -1) {
                    continue;
                }

                // Desenăm doar blocurile cu cel puțin
                // o față vizibilă.
                if (!isBlockVisible(x, y, z)) {
                    continue;
                }

                const mesh = createBlockMesh(
                    type,
                    x,
                    y,
                    z
                );

                if (mesh) {
                    group.add(mesh);
                }
            }
        }
    }

    WORLD_SCENE.add(group);

    WORLD_CHUNKS.set(id, group);
}


// ==========================================
// VERIFICAREA FEȚELOR VIZIBILE
// ==========================================

function isBlockVisible(x, y, z) {

    const neighbors = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1]
    ];

    for (const [dx, dy, dz] of neighbors) {

        if (
            getWorldBlock(
                x + dx,
                y + dy,
                z + dz
            ) === -1
        ) {
            return true;
        }
    }

    return false;
}


// ==========================================
// ACTUALIZAREA CHUNK-URILOR
// ==========================================

function updateWorldChunks(playerX, playerZ) {

    if (!WORLD_SCENE) {
        return;
    }

    const playerCX = Math.floor(
        playerX / CHUNK_SIZE
    );

    const playerCZ = Math.floor(
        playerZ / CHUNK_SIZE
    );

    const needed = new Set();

    for (
        let dx = -CHUNK_DISTANCE;
        dx <= CHUNK_DISTANCE;
        dx++
    ) {

        for (
            let dz = -CHUNK_DISTANCE;
            dz <= CHUNK_DISTANCE;
            dz++
        ) {

            const cx = playerCX + dx;
            const cz = playerCZ + dz;

            const id = chunkKey(cx, cz);

            needed.add(id);

            if (!WORLD_CHUNKS.has(id)) {
                generateChunk(cx, cz);
            }
        }
    }

    // Eliminăm chunk-urile îndepărtate
    for (const [id, group] of WORLD_CHUNKS) {

        if (!needed.has(id)) {

            WORLD_SCENE.remove(group);

            WORLD_CHUNKS.delete(id);
        }
    }
}


// ==========================================
// CONSTRUIREA ȘI DISTRUGEREA
// ==========================================

function setWorldBlock(x, y, z, type) {

    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);

    WORLD_EDITS.set(
        worldKey(x, y, z),
        type
    );

    // Regenerăm chunk-ul modificat
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);

    // Actualizăm și chunk-urile vecine,
    // deoarece fețele blocurilor se pot schimba.
    for (let dx = -1; dx <= 1; dx++) {

        for (let dz = -1; dz <= 1; dz++) {

            const id = chunkKey(
                cx + dx,
                cz + dz
            );

            const group = WORLD_CHUNKS.get(id);

            if (group) {

                WORLD_SCENE.remove(group);

                WORLD_CHUNKS.delete(id);

                generateChunk(
                    cx + dx,
                    cz + dz
                );
            }
        }
    }
}


// ==========================================
// SALVAREA LUMII
// ==========================================

function exportWorldData() {

    return {
        type: WORLD_TYPE,
        seed: WORLD_SEED,
        edits: Array.from(WORLD_EDITS.entries())
    };
}

function importWorldData(data) {

    WORLD_TYPE = data.type || "normal";
    WORLD_SEED = data.seed || 2016;

    WORLD_EDITS.clear();

    if (Array.isArray(data.edits)) {

        for (const [key, value] of data.edits) {
            WORLD_EDITS.set(key, value);
        }
    }
}


// ==========================================
// PORNIREA UNEI LUMI
// ==========================================

function initializeWorld(scene, type = "normal", seed = 2016) {

    // Eliminăm lumea precedentă
    if (WORLD_SCENE) {

        for (const group of WORLD_CHUNKS.values()) {
            WORLD_SCENE.remove(group);
        }
    }

    WORLD_CHUNKS.clear();
    WORLD_EDITS.clear();

    WORLD_SCENE = scene;
    WORLD_TYPE = type;
    WORLD_SEED = seed;

    updateWorldChunks(0, 0);

    console.log(
        "2016CRAFT: Lumea 3D a fost generată!"
    );
}

