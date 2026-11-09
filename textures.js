// ========================================
// 2016CRAFT - TEXTURES.JS
// PARTEA 3 - TEXTURI PIXELATE
// ========================================

// Lista blocurilor

const BLOCK_TYPES = [
    { name: "Grass", color: "#65a843" },
    { name: "Dirt", color: "#87552f" },
    { name: "Stone", color: "#888888" },
    { name: "Oak Log", color: "#95622f" },
    { name: "Leaves", color: "#368c39" },
    { name: "Sand", color: "#dfca86" },
    { name: "Coal Ore", color: "#303030" },
    { name: "Copper Ore", color: "#bc7547" },
    { name: "Iron Ore", color: "#d2b69b" },
    { name: "Gold Ore", color: "#f3ce42" },
    { name: "Diamond Ore", color: "#48dede" },
    { name: "Oak Planks", color: "#bd955b" },
    { name: "Cobblestone", color: "#777777" },
    { name: "Snow", color: "#eeeeff" }
];

// Culorile de bază

const BLOCK_COLORS = [
    0x65a843,
    0x87552f,
    0x888888,
    0x95622f,
    0x368c39,
    0xdfca86,
    0x303030,
    0xbc7547,
    0xd2b69b,
    0xf3ce42,
    0x48dede,
    0xbd955b,
    0x777777,
    0xeeeeff
];

// Generator de texturi

function createPixelTexture(color, seed = 1) {

    const canvas = document.createElement("canvas");

    canvas.width = 16;
    canvas.height = 16;

    const ctx = canvas.getContext("2d");

    const base = new THREE.Color(color);

    // Generator aleatoriu stabil
    let state = seed + 1;

    function random() {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    }

    for (let y = 0; y < 16; y++) {

        for (let x = 0; x < 16; x++) {

            const variation = 0.72 + random() * 0.45;

            const pixelColor = new THREE.Color();

            pixelColor.setRGB(
                Math.min(1, base.r * variation),
                Math.min(1, base.g * variation),
                Math.min(1, base.b * variation)
            );

            ctx.fillStyle = "#" + pixelColor.getHexString();

            ctx.fillRect(x, y, 1, 1);
        }
    }

    const texture = new THREE.CanvasTexture(canvas);

    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;

    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
}

// Texturi pentru minereuri

function createOreTexture(oreColor, seed) {

    const canvas = document.createElement("canvas");

    canvas.width = 16;
    canvas.height = 16;

    const ctx = canvas.getContext("2d");

    // Fundal de piatră
    const stone = createPixelTexture("#888888", seed);

    ctx.drawImage(stone.image, 0, 0);

    const positions = [
        [3, 3],
        [10, 2],
        [6, 7],
        [12, 10],
        [2, 12],
        [8, 13]
    ];

    positions.forEach(([x, y]) => {

        ctx.fillStyle = oreColor;
        ctx.fillRect(x, y, 3, 3);

        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(x, y, 2, 1);

    });

    const texture = new THREE.CanvasTexture(canvas);

    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
}

// Textură pentru lemn

function createWoodTexture() {

    const canvas = document.createElement("canvas");

    canvas.width = 16;
    canvas.height = 16;

    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#95622f";
    ctx.fillRect(0, 0, 16, 16);

    for (let x = 0; x < 16; x += 4) {

        ctx.fillStyle = "#70451f";
        ctx.fillRect(x, 0, 2, 16);

        ctx.fillStyle = "#b37c42";
        ctx.fillRect(x + 2, 0, 1, 16);
    }

    const texture = new THREE.CanvasTexture(canvas);

    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
}

// Textură pentru scânduri

function createPlanksTexture() {

    const canvas = document.createElement("canvas");

    canvas.width = 16;
    canvas.height = 16;

    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#bd955b";
    ctx.fillRect(0, 0, 16, 16);

    for (let y = 0; y < 16; y += 4) {

        ctx.fillStyle = "#78532c";
        ctx.fillRect(0, y, 16, 1);

        ctx.fillStyle = "#d4ad72";
        ctx.fillRect(0, y + 1, 16, 1);
    }

    ctx.fillStyle = "#78532c";

    ctx.fillRect(7, 0, 1, 4);
    ctx.fillRect(3, 4, 1, 4);
    ctx.fillRect(11, 8, 1, 4);
    ctx.fillRect(5, 12, 1, 4);

    const texture = new THREE.CanvasTexture(canvas);

    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
}

// Crearea materialelor 3D

const BLOCK_MATERIALS = BLOCK_COLORS.map((color, index) => {

    let texture;

    switch (index) {

        case 3:
            texture = createWoodTexture();
            break;

        case 6:
            texture = createOreTexture("#252525", 6);
            break;

        case 7:
            texture = createOreTexture("#bc7547", 7);
            break;

        case 8:
            texture = createOreTexture("#d2b69b", 8);
            break;

        case 9:
            texture = createOreTexture("#f3ce42", 9);
            break;

        case 10:
            texture = createOreTexture("#48dede", 10);
            break;

        case 11:
            texture = createPlanksTexture();
            break;

        default:
            texture = createPixelTexture(color, index + 1);
    }

    return new THREE.MeshLambertMaterial({
        map: texture
    });

});

// Geometria unui bloc Minecraft

const BLOCK_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);

// Funcție pentru crearea unui bloc

function createBlockMesh(type, x, y, z) {

    const material = BLOCK_MATERIALS[type];

    if (!material) {
        console.error("Tip de bloc necunoscut:", type);
        return null;
    }

    const mesh = new THREE.Mesh(
        BLOCK_GEOMETRY,
        material
    );

    mesh.position.set(x, y, z);

    mesh.userData = {
        type: type,
        x: x,
        y: y,
        z: z
    };

    return mesh;
}

console.log("2016CRAFT: Texturile au fost încărcate!");

