// ==========================================
// 2016CRAFT ALPHA 2.0
// ANIMALS.JS - ANIMALE PASNICE 3D
// ==========================================

const ANIMALS = [];
const MAX_ANIMALS = 12;

let animalGroup = null;
let animalSpawnTimer = 0;

// Creeaza un cub colorat
function animalCube(parent, color, x, y, z, w, h, d) {
    const geometry = new THREE.BoxGeometry(w, h, d);

    const material = new THREE.MeshLambertMaterial({
        color: color
    });

    const cube = new THREE.Mesh(geometry, material);

    cube.position.set(x, y, z);
    parent.add(cube);

    return cube;
}

// Creeaza un animal
function createAnimal(type, x, z) {
    if (!animalGroup) return;

    const animal = new THREE.Group();

    let bodyColor;
    let headColor;
    let legColor;

    if (type === "cow") {
        bodyColor = 0xeeeeee;
        headColor = 0xeeeeee;
        legColor = 0x444444;
    } else if (type === "sheep") {
        bodyColor = 0xffffff;
        headColor = 0xdddddd;
        legColor = 0x777777;
    } else {
        bodyColor = 0xffaacc;
        headColor = 0xffbbcc;
        legColor = 0xee99aa;
    }

    // Corp
    animalCube(
        animal, bodyColor,
        0, 0.9, 0,
        0.9, 0.8, 1.3
    );

    // Cap
    animalCube(
        animal, headColor,
        0, 1.15, -0.85,
        0.7, 0.7, 0.7
    );

    // Picioare
    const legs = [
        [-0.3, 0.3, -0.4],
        [0.3, 0.3, -0.4],
        [-0.3, 0.3, 0.4],
        [0.3, 0.3, 0.4]
    ];

    legs.forEach(pos => {
        animalCube(
            animal, legColor,
            pos[0], pos[1], pos[2],
            0.25, 0.6, 0.25
        );
    });

    // Ochi
    animalCube(
        animal, 0x111111,
        -0.22, 1.25, -1.21,
        0.1, 0.1, 0.05
    );

    animalCube(
        animal, 0x111111,
        0.22, 1.25, -1.21,
        0.1, 0.1, 0.05
    );

    // Pete pentru vaci
    if (type === "cow") {
        animalCube(
            animal, 0x333333,
            -0.46, 1.0, 0,
            0.04, 0.35, 0.45
        );
    }

    // Nas pentru porc
    if (type === "pig") {
        animalCube(
            animal, 0xee8899,
            0, 1.05, -1.25,
            0.35, 0.22, 0.12
        );
    }

    // Pozitionare pe teren
    const ground = getTerrainHeight(
        Math.floor(x),
        Math.floor(z)
    );

    animal.position.set(x, ground + 0.5, z);

    animal.rotation.y = Math.random() * Math.PI * 2;

    animalGroup.add(animal);

    ANIMALS.push({
        mesh: animal,
        type: type,
        direction: animal.rotation.y,
        timer: Math.random() * 3,
        speed: 0.3 + Math.random() * 0.4
    });
}

// Porneste sistemul de animale
function initializeAnimals() {
    if (animalGroup && animalGroup.parent) {
        animalGroup.parent.remove(animalGroup);
    }

    ANIMALS.length = 0;
    animalSpawnTimer = 0;

    animalGroup = new THREE.Group();
    scene.add(animalGroup);

    const types = ["cow", "sheep", "pig"];

    for (let i = 0; i < MAX_ANIMALS; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 7 + Math.random() * 15;

        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;

        createAnimal(types[i % 3], x, z);
    }
}

// Miscarea animalelor
function updateAnimals(delta) {
    if (!gameRunning) return;

    ANIMALS.forEach(animal => {
        animal.timer -= delta;

        if (animal.timer <= 0) {
            animal.direction +=
                (Math.random() - 0.5) * 2;

            animal.timer = 2 + Math.random() * 4;
        }

        const mesh = animal.mesh;

        const nextX =
            mesh.position.x +
            Math.sin(animal.direction) *
            animal.speed * delta;

        const nextZ =
            mesh.position.z +
            Math.cos(animal.direction) *
            animal.speed * delta;

        const currentGround = getTerrainHeight(
            Math.floor(mesh.position.x),
            Math.floor(mesh.position.z)
        );

        const nextGround = getTerrainHeight(
            Math.floor(nextX),
            Math.floor(nextZ)
        );

        // Nu urca pante foarte abrupte
        if (Math.abs(nextGround - currentGround) <= 1) {
            mesh.position.x = nextX;
            mesh.position.z = nextZ;
            mesh.position.y = nextGround + 0.5;
        } else {
            animal.direction += Math.PI;
        }

        mesh.rotation.y = animal.direction;
    });
}

