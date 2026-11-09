// ==========================================
// 2016CRAFT - ENEMIES.JS
// INAMICI VIOLETI ZBURATORI
// ==========================================

const ENEMIES = [];
let enemyGroup = null;

// ==========================================
// CUBURI COLORATE
// ==========================================

function enemyCube(parent, color, x, y, z, w, h, d) {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({
            color: color
        })
    );

    mesh.position.set(x, y, z);
    parent.add(mesh);

    return mesh;
}

// ==========================================
// CREAREA INAMICULUI
// ==========================================

function createEnemy(x, z) {
    if (!enemyGroup) return;

    const model = new THREE.Group();

    // Corpul este un singur cub violet
    enemyCube(
        model, 0x9933ff,
        0, 0, 0,
        1, 1, 1
    );

    // Ochii albi
    enemyCube(
        model, 0xffffff,
        -0.2, 0.1, -0.51,
        0.2, 0.2, 0.05
    );

    enemyCube(
        model, 0xffffff,
        0.2, 0.1, -0.51,
        0.2, 0.2, 0.05
    );

    // Pupilele
    const leftPupil = enemyCube(
        model, 0x111111,
        -0.2, 0.1, -0.55,
        0.08, 0.08, 0.03
    );

    const rightPupil = enemyCube(
        model, 0x111111,
        0.2, 0.1, -0.55,
        0.08, 0.08, 0.03
    );

    // Spranceana stanga
    const leftBrow = enemyCube(
        model, 0x330066,
        -0.2, 0.28, -0.56,
        0.28, 0.09, 0.07
    );

    leftBrow.rotation.z = -0.35;

    // Spranceana dreapta
    const rightBrow = enemyCube(
        model, 0x330066,
        0.2, 0.28, -0.56,
        0.28, 0.09, 0.07
    );

    rightBrow.rotation.z = 0.35;

    // Gura incruntata
    enemyCube(
        model, 0x330066,
        0, -0.23, -0.55,
        0.35, 0.08, 0.06
    );

    const ground = getTerrainHeight(
        Math.floor(x),
        Math.floor(z)
    );

    // Zboara deasupra terenului
    model.position.set(x, ground + 3, z);

    enemyGroup.add(model);

    ENEMIES.push({
        mesh: model,
        angry: false,
        direction: Math.random() * Math.PI * 2,
        timer: 2,
        destroyTimer: 1,
        leftPupil: leftPupil,
        rightPupil: rightPupil
    });
}

// ==========================================
// INITIALIZAREA INAMICILOR
// ==========================================

function initializeEnemies() {
    if (enemyGroup && enemyGroup.parent) {
        enemyGroup.parent.remove(enemyGroup);
    }

    ENEMIES.length = 0;

    enemyGroup = new THREE.Group();
    scene.add(enemyGroup);

    // Cream 5 inamici
    for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 8 + Math.random() * 12;

        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;

        createEnemy(x, z);
    }
}

// ==========================================
// GASIREA CONSTRUCTIILOR
// ==========================================

function findEnemyTarget(enemy) {
    let target = null;
    let closestDistance = Infinity;

    for (const [key, type] of WORLD_EDITS) {
        // -1 inseamna bloc eliminat
        if (type === -1) continue;

        const [x, y, z] = key.split(",").map(Number);

        // Cautam blocul construit cel mai apropiat
        const distance = Math.hypot(
            x - enemy.mesh.position.x,
            z - enemy.mesh.position.z
        );

        if (distance < closestDistance) {
            closestDistance = distance;

            target = {
                x: x,
                y: y,
                z: z
            };
        }
    }

    return target;
}

// ==========================================
// DISTRUGEREA CONSTRUCTIILOR
// ==========================================

function enemyDestroyBlock(enemy) {
    const target = findEnemyTarget(enemy);

    if (!target) return;

    const model = enemy.mesh;

    // Distanta orizontala pana la constructie
    const distance = Math.hypot(
        target.x - model.position.x,
        target.z - model.position.z
    );

    // Distruge doar daca este aproape
    if (distance <= 4) {
        setWorldBlock(
            target.x,
            target.y,
            target.z,
            -1
        );

        console.log(
            "Inamicul a distrus un bloc!"
        );
    }
}

// ==========================================
// MISCAREA INAMICILOR
// ==========================================

function updateEnemies(delta) {
    if (!gameRunning || !enemyGroup) return;

    ENEMIES.forEach(enemy => {
        const model = enemy.mesh;

        enemy.timer -= delta;

        if (enemy.angry) {
            // Cauta o constructie
            const target = findEnemyTarget(enemy);

            let targetX = player.x;
            let targetZ = player.z;

            if (target) {
                targetX = target.x;
                targetZ = target.z;
            }

            // Se indreapta spre constructie
            const dx = targetX - model.position.x;
            const dz = targetZ - model.position.z;

            enemy.direction = Math.atan2(dx, dz);

            // Ochii devin rosii
            enemy.leftPupil.material.color.setHex(
                0xff0000
            );

            enemy.rightPupil.material.color.setHex(
                0xff0000
            );

            // Distruge cate un bloc la fiecare secunda
            enemy.destroyTimer -= delta;

            if (enemy.destroyTimer <= 0) {
                enemy.destroyTimer = 1;

                enemyDestroyBlock(enemy);
            }

        } else {
            // Inamicul este pasnic
            if (enemy.timer <= 0) {
                enemy.direction +=
                    (Math.random() - 0.5) * 2;

                enemy.timer =
                    2 + Math.random() * 4;
            }
        }

        // Viteza de deplasare
        const speed = enemy.angry ? 2 : 0.5;

        const nextX =
            model.position.x +
            Math.sin(enemy.direction) *
            speed * delta;

        const nextZ =
            model.position.z +
            Math.cos(enemy.direction) *
            speed * delta;

        model.position.x = nextX;
        model.position.z = nextZ;

        // Inaltimea terenului
        const ground = getTerrainHeight(
            Math.floor(nextX),
            Math.floor(nextZ)
        );

        // Zbor cu plutire
        const time = performance.now() * 0.002;

        model.position.y =
            ground + 3 +
            Math.sin(time + nextX) * 0.5;

        // Intoarce fata spre directia de mers
        model.rotation.y = enemy.direction;
    });
}

// ==========================================
// LOVIREA INAMICULUI
// ==========================================

function hitEnemy() {
    if (!gameRunning || !enemyGroup || !camera) {
        return;
    }

    const ray = new THREE.Raycaster();

    ray.far = 8;

    // Tintim centrul ecranului
    ray.setFromCamera(
        new THREE.Vector2(0, 0),
        camera
    );

    const hits = ray.intersectObjects(
        enemyGroup.children,
        true
    );

    if (hits.length === 0) return;

    let object = hits[0].object;

    // Gasim cubul principal
    while (
        object.parent &&
        object.parent !== enemyGroup
    ) {
        object = object.parent;
    }

    const enemy = ENEMIES.find(
        item => item.mesh === object
    );

    if (!enemy) return;

    // Inamicul devine furios
    enemy.angry = true;

    enemy.destroyTimer = 1;

    enemy.leftPupil.material.color.setHex(
        0xff0000
    );

    enemy.rightPupil.material.color.setHex(
        0xff0000
    );

    console.log(
        "Inamicul violet s-a suparat!"
    );
}
