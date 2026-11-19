
/* =====================================
   SQUARE STACK - AVATAR 3D
   Persoana a treia + skin Minecraft
   Functioneaza si fara multiplayer
   ===================================== */

(function () {
    "use strict";

    let avatar = null;
    let currentScene = null;
    let loadedSkin = null;
    let frames = 0;

    const parts = [
        {
            name: "head",
            size: [0.7, 0.7, 0.7],
            pos: [0, -0.35, 0],
            uv: [0, 0, 8, 8, 8]
        },
        {
            name: "body",
            size: [0.7, 0.8, 0.35],
            pos: [0, -1.05, 0],
            uv: [16, 16, 8, 12, 4]
        },
        {
            name: "rightArm",
            size: [0.3, 0.8, 0.35],
            pos: [-0.5, -1.05, 0],
            uv: [40, 16, 4, 12, 4]
        },
        {
            name: "leftArm",
            size: [0.3, 0.8, 0.35],
            pos: [0.5, -1.05, 0],
            uv: [32, 48, 4, 12, 4]
        },
        {
            name: "rightLeg",
            size: [0.3, 0.6, 0.35],
            pos: [-0.2, -1.75, 0],
            uv: [0, 16, 4, 12, 4]
        },
        {
            name: "leftLeg",
            size: [0.3, 0.6, 0.35],
            pos: [0.2, -1.75, 0],
            uv: [16, 48, 4, 12, 4]
        }
    ];

    function createAvatar() {
        avatar = new THREE.Group();
        avatar.name = "SquareStack_MyAvatar";

        const material = new THREE.MeshLambertMaterial({
            color: 0x3388ee
        });

        avatar.userData.parts = [];

        for (const part of parts) {
            const geometry = new THREE.BoxGeometry(
                ...part.size
            );

            const mesh = new THREE.Mesh(
                geometry,
                material
            );

            mesh.position.set(...part.pos);
            mesh.userData.skinUV = part.uv;

            avatar.add(mesh);
            avatar.userData.parts.push(mesh);
        }

        scene.add(avatar);
        currentScene = scene;

        console.log("Square Stack: Avatar 3D creat!");
    }

    function setSkinUV(geometry, region, legacy) {
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

    function applySkin(skinData) {
        if (!avatar || !skinData) return;

        const image = new Image();

        image.onload = function () {
            if (!avatar) return;

            const modern =
                image.width === image.height;

            const legacy =
                image.width === image.height * 2;

            if (
                ![64, 128].includes(image.width) ||
                (!modern && !legacy)
            ) {
                console.warn(
                    "Square Stack: Dimensiuni skin invalide."
                );
                return;
            }

            const texture = new THREE.Texture(image);

            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            texture.generateMipmaps = false;
            texture.needsUpdate = true;

            const material = new THREE.MeshLambertMaterial({
                map: texture,
                color: 0xffffff,
                transparent: true,
                alphaTest: 0.05
            });

            for (const mesh of avatar.userData.parts) {
                setSkinUV(
                    mesh.geometry,
                    mesh.userData.skinUV,
                    legacy
                );

                mesh.material = material;
            }

            console.log(
                "Square Stack: Skinul Minecraft este aplicat!"
            );
        };

        image.onerror = function () {
            console.error(
                "Square Stack: Skinul nu poate fi incarcat."
            );
        };

        image.src = skinData;
    }

    function readSavedSkin() {
        try {
            return localStorage.getItem(
                "squareStackSkin"
            );
        } catch {
            return null;
        }
    }

    function updateAvatar() {
        requestAnimationFrame(updateAvatar);

        if (
            typeof THREE === "undefined" ||
            typeof scene === "undefined" ||
            !scene ||
            typeof gameRunning === "undefined" ||
            !gameRunning
        ) {
            if (avatar) avatar.visible = false;
            return;
        }

        if (!avatar || currentScene !== scene) {
            createAvatar();
            loadedSkin = null;
        }

        // Daca multiplayerul afiseaza deja
        // personajul, evitam doua avatare.
        const multiplayerAvatarExists =
            typeof mpLocalAvatar !== "undefined" &&
            mpLocalAvatar &&
            mpLocalAvatar.parent === scene &&
            mpLocalAvatar.visible;

        if (multiplayerAvatarExists) {
            avatar.visible = false;
            return;
        }

        if (gamePerspective !== "third") {
            avatar.visible = false;
            return;
        }

        avatar.visible = true;

        avatar.position.set(
            player.x,
            player.y,
            player.z
        );

        avatar.rotation.y = player.yaw + Math.PI;

        // Verificam periodic daca skinul
        // salvat s-a schimbat.
        frames++;

        if (frames % 45 === 0 || loadedSkin === null) {
            const skin = readSavedSkin();

            if (skin !== loadedSkin) {
                loadedSkin = skin;

                if (skin) {
                    applySkin(skin);
                }
            }
        }
    }

    requestAnimationFrame(updateAvatar);

    console.log(
        "Square Stack: Sistemul avatar 3D activat!"
    );
})();
