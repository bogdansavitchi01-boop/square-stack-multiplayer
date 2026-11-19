
/* SQUARE STACK - 1000 DE BLOCURI NOI */

(function () {
    if (window.squareStack1000Loaded) return;
    window.squareStack1000Loaded = true;

    const categorii = [
        "Cărămidă", "Beton", "Sticlă", "Lemn colorat",
        "Marmură", "Granit", "Bazalt", "Gresie",
        "Teracotă", "Țiglă", "Metal", "Cupru",
        "Cristal", "Lână", "Piatră lustruită",
        "Mozaic", "Plăci", "Pământ decorativ",
        "Cărămizi antice", "Blocuri futuriste"
    ];

    const culori = [
        ["Alb", "#eeeeee"],
        ["Negru", "#292929"],
        ["Gri", "#888888"],
        ["Gri deschis", "#c5c5c5"],
        ["Roșu", "#d44747"],
        ["Roșu închis", "#7c2b30"],
        ["Portocaliu", "#e18a31"],
        ["Galben", "#e4d44e"],
        ["Verde", "#4c9a4a"],
        ["Verde închis", "#29683d"],
        ["Verde lime", "#a4c95a"],
        ["Turcoaz", "#35b6ac"],
        ["Cyan", "#4bd5dc"],
        ["Albastru", "#3d79c9"],
        ["Albastru închis", "#2c457f"],
        ["Mov", "#8b5ac8"],
        ["Violet", "#a14bc2"],
        ["Roz", "#ed8bb2"],
        ["Maro", "#7d5337"],
        ["Bej", "#d6bc8f"],
        ["Crem", "#f1e1b3"],
        ["Auriu", "#dbb64a"],
        ["Argintiu", "#aebbc2"],
        ["Cărămiziu", "#ad5b45"],
        ["Olive", "#7b8c48"]
    ];

    const simboluri = [
        "🧱", "⬜", "🪟", "🪵", "🪨",
        "🪨", "🪨", "🏜️", "🟫", "🏠",
        "⚙️", "🟠", "💎", "🧶", "🪨",
        "🔷", "🔲", "🌱", "🏛️", "✨"
    ];

    const primulID = BLOCK_TYPES.length;
    const itemeNoi = [];

    // Înregistrăm cele 1000 de blocuri.
    for (let c = 0; c < categorii.length; c++) {
        for (const [numeCuloare, hex] of culori) {
            for (let model = 0; model < 2; model++) {
                const id = BLOCK_TYPES.length;
                const nume =
                    categorii[c] + " " + numeCuloare +
                    (model === 0 ? " neted" : " cu model");

                BLOCK_TYPES.push({
                    name: nume,
                    color: hex,
                    category: categorii[c],
                    pattern: model
                });

                BLOCK_COLORS.push(
                    new THREE.Color(hex).getHex()
                );

                BLOCK_MATERIALS.push(
                    new THREE.MeshLambertMaterial({
                        color: hex,
                        transparent: c === 2,
                        opacity: c === 2 ? 0.65 : 1
                    })
                );

                INVENTORY_BLOCK_NAMES.push(nume);
                INVENTORY_BLOCK_ICONS.push(simboluri[c]);

                itemeNoi.push({
                    id: id,
                    name: nume,
                    category: categorii[c],
                    icon: simboluri[c]
                });
            }
        }
    }

    // Texturile sunt generate doar când
    // blocurile sunt folosite în lumea 3D.
    function creeazaTextura(type) {
        const info = BLOCK_TYPES[type];
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;

        const ctx = canvas.getContext("2d");
        const culoare = new THREE.Color(info.color);
        let seed = (type * 1234567 + 17) >>> 0;

        function random() {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        }

        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const v = 0.82 + random() * 0.28;
                const r = Math.min(255, Math.round(culoare.r * v * 255));
                const g = Math.min(255, Math.round(culoare.g * v * 255));
                const b = Math.min(255, Math.round(culoare.b * v * 255));

                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(x, y, 1, 1);
            }
        }

        if (info.pattern === 1) {
            ctx.fillStyle = "rgba(0,0,0,0.28)";

            if (type % 3 === 0) {
                for (let y = 0; y < 16; y += 4) {
                    ctx.fillRect(0, y, 16, 1);
                }
            } else if (type % 3 === 1) {
                for (let x = 0; x < 16; x += 4) {
                    ctx.fillRect(x, 0, 1, 16);
                }
            } else {
                for (let y = 0; y < 16; y += 4) {
                    for (let x = 0; x < 16; x += 4) {
                        ctx.fillRect(x, y, 2, 2);
                    }
                }
            }
        }

        const textura = new THREE.CanvasTexture(canvas);
        textura.magFilter = THREE.NearestFilter;
        textura.minFilter = THREE.NearestFilter;
        return textura;
    }

    const creareOriginala = createBlockMesh;

    createBlockMesh = function (type, x, y, z) {
        if (type >= primulID && BLOCK_MATERIALS[type]) {
            const material = BLOCK_MATERIALS[type];

            if (!material.map) {
                material.map = creeazaTextura(type);
                material.color.set("#ffffff");
                material.needsUpdate = true;
            }
        }

        return creareOriginala(type, x, y, z);
    };

    // Inventarul rapid rămâne cu 9 locuri.
    const initializareOriginala = initializeInventory;

    initializeInventory = function (mode = "creative") {
        initializareOriginala(mode);

        if (mode === "creative") {
            PLAYER_INVENTORY.length = HOTBAR_SIZE;
            renderInventory();
        }
    };

    function creeazaMeniu() {
        const gameScreen = document.getElementById("game-screen");
        if (!gameScreen) {
            console.warn("Nu am găsit game-screen.");
            return;
        }

        const css = document.createElement("style");
        css.textContent = `
            #ss1000-open {
                position: absolute;
                top: 65px;
                right: 12px;
                z-index: 50;
                width: auto;
            }

            #ss1000-panel {
                display: none;
                position: fixed;
                inset: 0;
                z-index: 9999;
                background: #18251c;
                color: white;
                padding: 15px;
                overflow-y: auto;
                font-family: Arial, sans-serif;
                flex-direction: column;
                gap: 12px;
            }

            #ss1000-panel.open {
                display: flex;
            }

            #ss1000-panel input,
            #ss1000-panel select {
                width: 100%;
                max-width: 500px;
                padding: 12px;
            }

            #ss1000-grid {
                display: grid;
                grid-template-columns:
                    repeat(auto-fill, minmax(150px, 1fr));
                gap: 8px;
            }

            #ss1000-grid button {
                min-height: 65px;
                font-size: 13px;
                padding: 8px;
                overflow-wrap: anywhere;
            }

            #ss1000-pages {
                display: flex;
                justify-content: center;
                align-items: center;
                flex-wrap: wrap;
                gap: 10px;
            }
        `;
        document.head.appendChild(css);

        const deschide = document.createElement("button");
        deschide.id = "ss1000-open";
        deschide.textContent = "🎒 Inventar creativ";
        gameScreen.appendChild(deschide);

        const panel = document.createElement("div");
        panel.id = "ss1000-panel";

        panel.innerHTML = `
            <h2>🎒 Square Stack - Inventar creativ</h2>
            <p>1000 de blocuri noi + blocurile originale</p>
            <button id="ss1000-close">✖ Închide</button>
            <input id="ss1000-search"
                   placeholder="🔍 Caută un bloc...">
            <select id="ss1000-category">
                <option value="">Toate categoriile</option>
            </select>
            <div id="ss1000-grid"></div>
            <div id="ss1000-pages">
                <button id="ss1000-prev">◀ Anterior</button>
                <span id="ss1000-info"></span>
                <button id="ss1000-next">Următor ▶</button>
            </div>
        `;

        document.body.appendChild(panel);

        const search = panel.querySelector("#ss1000-search");
        const category = panel.querySelector("#ss1000-category");
        const grid = panel.querySelector("#ss1000-grid");
        const info = panel.querySelector("#ss1000-info");

        for (const nume of categorii) {
            const option = document.createElement("option");
            option.value = nume;
            option.textContent = nume;
            category.appendChild(option);
        }

        let pagina = 0;
        const pePagina = 40;

        function normalizare(s) {
            return s.normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
        }

        function afiseaza() {
            const cautare = normalizare(search.value.trim());

            const rezultate = itemeNoi.filter(item =>
                (!category.value ||
                    item.category === category.value) &&
                normalizare(item.name).includes(cautare)
            );

            const pagini = Math.max(
                1, Math.ceil(rezultate.length / pePagina)
            );

            pagina = Math.min(pagina, pagini - 1);
            grid.replaceChildren();

            const inceput = pagina * pePagina;

            for (const item of rezultate.slice(
                inceput, inceput + pePagina
            )) {
                const button = document.createElement("button");
                button.textContent = item.icon + " " + item.name;

                button.onclick = function () {
                    PLAYER_INVENTORY[SELECTED_SLOT] = {
                        type: item.id,
                        count: Infinity
                    };

                    renderInventory();
                    panel.classList.remove("open");
                };

                grid.appendChild(button);
            }

            info.textContent =
                `Pagina ${pagina + 1}/${pagini} • ` +
                `${rezultate.length} blocuri`;

            panel.querySelector("#ss1000-prev").disabled =
                pagina === 0;

            panel.querySelector("#ss1000-next").disabled =
                pagina >= pagini - 1;
        }

        deschide.onclick = function () {
            if (INVENTORY_GAME_MODE !== "creative") {
                alert("Inventarul creativ este disponibil în Creative.");
                return;
            }

            if (document.pointerLockElement &&
                document.exitPointerLock) {
                document.exitPointerLock();
            }

            panel.classList.add("open");
            afiseaza();
        };

        panel.querySelector("#ss1000-close").onclick =
            () => panel.classList.remove("open");

        search.oninput = function () {
            pagina = 0;
            afiseaza();
        };

        category.onchange = function () {
            pagina = 0;
            afiseaza();
        };

        panel.querySelector("#ss1000-prev").onclick =
            function () {
                pagina--;
                afiseaza();
            };

        panel.querySelector("#ss1000-next").onclick =
            function () {
                pagina++;
                afiseaza();
            };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", creeazaMeniu);
    } else {
        creeazaMeniu();
    }

    console.log(
        "Square Stack: " + itemeNoi.length +
        " de blocuri noi înregistrate!"
    );
})();
