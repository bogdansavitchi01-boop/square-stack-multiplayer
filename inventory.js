// ==========================================
// 2016CRAFT - INVENTORY.JS
// PARTEA 5 - INVENTARUL
// ==========================================

// Numărul de locuri rapide
const HOTBAR_SIZE = 9;

// Modul de joc
let INVENTORY_GAME_MODE = "creative";

// Blocul selectat
let SELECTED_SLOT = 0;

// Inventarul
let PLAYER_INVENTORY = [];

// Numele blocurilor
const INVENTORY_BLOCK_NAMES = [
    "Iarbă",
    "Pământ",
    "Piatră",
    "Lemn",
    "Frunze",
    "Nisip",
    "Cărbune",
    "Cupru",
    "Fier",
    "Aur",
    "Diamant",
    "Scânduri",
    "Piatră spartă",
    "Zăpadă"
];

// Simbolurile blocurilor
const INVENTORY_BLOCK_ICONS = [
    "🟩",
    "🟫",
    "🪨",
    "🪵",
    "🍃",
    "🏖️",
    "⚫",
    "🟠",
    "⚪",
    "🟡",
    "💎",
    "🪵",
    "🧱",
    "❄️"
];


// ==========================================
// CREAREA INVENTARULUI
// ==========================================

function initializeInventory(mode = "creative") {

    INVENTORY_GAME_MODE = mode;

    PLAYER_INVENTORY = [];

    SELECTED_SLOT = 0;

    if (mode === "creative") {

        // În Creative avem toate blocurile
        for (let i = 0; i < BLOCK_TYPES.length; i++) {

            PLAYER_INVENTORY.push({
                type: i,
                count: Infinity
            });
        }

    } else {

        // În Survival începem fără resurse
        for (let i = 0; i < HOTBAR_SIZE; i++) {

            PLAYER_INVENTORY.push({
                type: -1,
                count: 0
            });
        }
    }

    renderInventory();

    console.log("2016CRAFT: Inventarul este pregătit!");
}


// ==========================================
// AFIȘAREA INVENTARULUI
// ==========================================

function renderInventory() {

    const container = document.getElementById("inventory");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    for (let i = 0; i < HOTBAR_SIZE; i++) {

        const item = PLAYER_INVENTORY[i];

        const button = document.createElement("button");

        button.className = "inventory-slot";

        if (i === SELECTED_SLOT) {
            button.classList.add("active");
        }

        if (item && item.type >= 0) {

            const icon = INVENTORY_BLOCK_ICONS[item.type] || "🧱";

            const amount =
                item.count === Infinity
                    ? "∞"
                    : item.count;

            button.innerHTML = `
                <span>${icon}</span>
                <small>${amount}</small>
            `;

            button.title =
                INVENTORY_BLOCK_NAMES[item.type] || "Bloc";

        } else {

            button.textContent = " ";

        }

        button.onclick = function () {
            selectInventorySlot(i);
        };

        container.appendChild(button);
    }
}


// ==========================================
// SELECTAREA UNUI LOC
// ==========================================

function selectInventorySlot(index) {

    if (index < 0 || index >= HOTBAR_SIZE) {
        return;
    }

    SELECTED_SLOT = index;

    renderInventory();
}


// ==========================================
// BLOCUL SELECTAT
// ==========================================

function getSelectedBlockType() {

    const item = PLAYER_INVENTORY[SELECTED_SLOT];

    if (!item || item.type < 0 || item.count <= 0) {
        return -1;
    }

    return item.type;
}


// ==========================================
// ADĂUGAREA RESURSELOR
// ==========================================

function addInventoryItem(type, amount = 1) {

    if (type < 0 || type >= BLOCK_TYPES.length) {
        return false;
    }

    // În Creative resursele sunt nelimitate
    if (INVENTORY_GAME_MODE === "creative") {
        return true;
    }

    // Căutăm un loc cu același bloc
    for (const item of PLAYER_INVENTORY) {

        if (item.type === type) {

            item.count += amount;

            renderInventory();

            return true;
        }
    }

    // Căutăm un loc gol
    for (const item of PLAYER_INVENTORY) {

        if (item.type === -1) {

            item.type = type;
            item.count = amount;

            renderInventory();

            return true;
        }
    }

    // Inventarul este plin
    console.log("Inventarul este plin!");

    return false;
}


// ==========================================
// FOLOSIREA UNUI BLOC
// ==========================================

function useSelectedBlock() {

    const item = PLAYER_INVENTORY[SELECTED_SLOT];

    if (!item || item.type < 0 || item.count <= 0) {
        return false;
    }

    if (INVENTORY_GAME_MODE === "creative") {
        return true;
    }

    item.count--;

    if (item.count <= 0) {

        item.type = -1;
        item.count = 0;
    }

    renderInventory();

    return true;
}


// ==========================================
// SCHIMBAREA BLOCULUI
// ==========================================

function nextInventorySlot() {

    SELECTED_SLOT++;

    if (SELECTED_SLOT >= HOTBAR_SIZE) {
        SELECTED_SLOT = 0;
    }

    renderInventory();
}

function previousInventorySlot() {

    SELECTED_SLOT--;

    if (SELECTED_SLOT < 0) {
        SELECTED_SLOT = HOTBAR_SIZE - 1;
    }

    renderInventory();
}


// ==========================================
// SALVAREA INVENTARULUI
// ==========================================

function exportInventoryData() {

    return {
        mode: INVENTORY_GAME_MODE,
        selectedSlot: SELECTED_SLOT,

        items: PLAYER_INVENTORY.map(item => ({
            type: item.type,

            // JSON nu poate salva Infinity direct
            count:
                item.count === Infinity
                    ? -1
                    : item.count
        }))
    };
}


// ==========================================
// ÎNCĂRCAREA INVENTARULUI
// ==========================================

function importInventoryData(data) {

    if (!data || !Array.isArray(data.items)) {
        return;
    }

    INVENTORY_GAME_MODE = data.mode || "creative";

    SELECTED_SLOT = Math.max(
        0,
        Math.min(HOTBAR_SIZE - 1, data.selectedSlot || 0)
    );

    PLAYER_INVENTORY = data.items.map(item => ({
        type: item.type,

        count:
            item.count === -1
                ? Infinity
                : item.count
    }));


    // Adăugăm obiectele noi în lumile Creative salvate
    if (INVENTORY_GAME_MODE === "creative") {

        for (let type = 0; type < BLOCK_TYPES.length; type++) {

            const exists = PLAYER_INVENTORY.some(
                item => item.type === type && item.count > 0
            );

            if (!exists) {
                const newItem = {
                    type: type,
                    count: Infinity
                };

                const emptySlot = PLAYER_INVENTORY.findIndex(
                    item => item.type < 0 || item.count <= 0
                );

                if (emptySlot >= 0) {
                    PLAYER_INVENTORY[emptySlot] = newItem;
                } else {
                    PLAYER_INVENTORY.push(newItem);
                }
            }
        }
    }


    renderInventory();
}


// ==========================================
// INFORMAȚII DESPRE BLOC
// ==========================================

function getBlockName(type) {

    return INVENTORY_BLOCK_NAMES[type] || "Bloc necunoscut";
}

function getBlockIcon(type) {

    return INVENTORY_BLOCK_ICONS[type] || "🧱";
}


// ==========================================
// MESAJ DE PORNIRE
// ==========================================

console.log("2016CRAFT: inventory.js încărcat!");


// INVENTAR COMPLET - SQUARE STACK

function isInventoryPanelOpen() {
    const panel = document.getElementById("square-inventory-overlay");
    return !!panel && panel.style.display !== "none";
}

function closeInventoryPanel() {
    const panel = document.getElementById("square-inventory-overlay");

    if (panel) {
        panel.style.display = "none";
    }
}

function createInventoryPanel() {
    let panel = document.getElementById("square-inventory-overlay");

    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "square-inventory-overlay";
    panel.style.display = "none";

    panel.innerHTML = `
        <div class="square-inventory-window">
            <div class="square-inventory-header">
                <strong>🎒 Inventar</strong>
                <button id="square-inventory-close" type="button">✕</button>
            </div>
            <p>Alege un bloc pentru construire:</p>
            <div class="square-inventory-tabs" id="square-inventory-tabs" style="display:flex !important; visibility:visible !important;">
                <button type="button" id="square-tab-blocks" class="active">🧱 Blocuri</button>
                <button type="button" id="square-tab-mods" style="display:inline-flex !important; visibility:visible !important;">🧩 Moduri</button>
            </div>
            <div id="square-inventory-grid"></div>
            <div id="square-inventory-mods" class="hidden">
                <p>🧩 Moduri instalate și instrumente</p>
                <div id="square-mod-tools" class="square-mod-tools"></div>
                <div id="mod-pack-list"></div>
            </div>
        </div>
    `;

    document.body.appendChild(panel);

    document.getElementById("square-inventory-close")
        .addEventListener("click", closeInventoryPanel);

    const blocksTab = document.getElementById("square-tab-blocks");
    const modsTab = document.getElementById("square-tab-mods");
    const blocksGrid = document.getElementById("square-inventory-grid");
    const modsPanel = document.getElementById("square-inventory-mods");

    blocksTab.addEventListener("click", function () {
        blocksGrid.classList.remove("hidden");
        modsPanel.classList.add("hidden");
        blocksTab.classList.add("active");
        modsTab.classList.remove("active");
    });

    modsTab.addEventListener("click", async function () {
        if (INVENTORY_GAME_MODE !== "creative") return;
        blocksGrid.classList.add("hidden");
        modsPanel.classList.remove("hidden");
        modsTab.classList.add("active");
        blocksTab.classList.remove("active");
        if (typeof window.renderSquareStackModList === "function") {
            await window.renderSquareStackModList();
        }
    });

    // Mută butoanele modurilor în fila „Moduri” pe ecrane sub 1100px.
    // Observer-ul urmărește și butoanele create mai târziu de scripturile modurilor.
    const tools = document.getElementById("square-mod-tools");
    const toolIds = [
        "advanced-building",
        "furniture-plus-button",
        "technology-button",
        "electricity-button"
    ];
    const toolOrigins = new Map();
    const toolOriginalStyles = new Map();
    const compactMode = window.matchMedia("(max-width: 1099px)");

    function findModButtons(id) {
        const labels = {
            "advanced-building": "Advanced Building",
            "furniture-plus-button": "Furniture Plus",
            "technology-button": "Technology",
            "electricity-button": "Electricity"
        };
        const label = labels[id];
        const found = new Set();

        document.querySelectorAll("#" + id).forEach(button => {
            if (button.tagName === "BUTTON") found.add(button);
        });

        document.querySelectorAll("button").forEach(button => {
            if (
                !tools.contains(button) &&
                button.textContent &&
                button.textContent.includes(label)
            ) {
                found.add(button);
            }
        });

        return [...found].filter(button =>
            button !== tools &&
            !button.closest("#square-inventory-overlay")
        );
    }

    function collectModTools() {
        if (!tools || !tools.isConnected) return;

        for (const id of toolIds) {
            const buttons = findModButtons(id);

            for (const button of buttons) {
                if (!toolOriginalStyles.has(button)) {
                    toolOriginalStyles.set(button, button.getAttribute("style"));
                }

                if (compactMode.matches) {
                    if (!toolOrigins.has(button) && button.parentNode) {
                        const marker = document.createComment("square-mod-tool-" + id);
                        button.parentNode.insertBefore(marker, button);
                        toolOrigins.set(button, marker);
                    }

                    if (button.parentNode !== tools) {
                        tools.appendChild(button);
                    }

                    styleModButton(button);

                    if (!button.dataset.squareCloseBound) {
                        button.dataset.squareCloseBound = "1";
                        button.addEventListener("click", closeInventoryPanel);
                    }
                } else {
                    const marker = toolOrigins.get(button);
                    if (marker && marker.parentNode) {
                        marker.parentNode.insertBefore(button, marker);
                        marker.remove();
                    }

                    const originalStyle = toolOriginalStyles.get(button);
                    if (originalStyle === null) {
                        button.removeAttribute("style");
                    } else if (typeof originalStyle === "string") {
                        button.setAttribute("style", originalStyle);
                    }

                    toolOrigins.delete(button);
                    toolOriginalStyles.delete(button);
                    delete button.dataset.squareCloseBound;
                }
            }
        }
    }

    function styleModButton(button) {
        button.style.setProperty("position", "relative", "important");
        button.style.setProperty("inset", "auto", "important");
        button.style.setProperty("right", "auto", "important");
        button.style.setProperty("left", "auto", "important");
        button.style.setProperty("top", "auto", "important");
        button.style.setProperty("bottom", "auto", "important");
        button.style.setProperty("z-index", "1", "important");
        button.style.setProperty("display", "inline-flex", "important");
        button.style.setProperty("float", "none", "important");
        button.style.setProperty("width", "100%", "important");
        button.style.setProperty("min-width", "0", "important");
        button.style.setProperty("min-height", "34px", "important");
        button.style.setProperty("height", "auto", "important");
        button.style.setProperty("padding", "5px 7px", "important");
        button.style.setProperty("font-size", "11px", "important");
        button.style.setProperty("margin", "0", "important");
        button.style.setProperty("justify-content", "center", "important");
        button.style.setProperty("box-sizing", "border-box", "important");
    }

    collectModTools();

    if (!window.squareStackModToolsObserver) {
        window.squareStackModToolsObserver = new MutationObserver(() => {
            collectModTools();
        });
        window.squareStackModToolsObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    if (!window.squareStackModToolsResizeBound) {
        window.squareStackModToolsResizeBound = true;
        window.addEventListener("resize", collectModTools);
        if (compactMode.addEventListener) {
            compactMode.addEventListener("change", collectModTools);
        } else if (compactMode.addListener) {
            compactMode.addListener(collectModTools);
        }
    }

    panel.addEventListener("click", function (event) {
        if (event.target === panel) {
            closeInventoryPanel();
        }
    });

    return panel;
}


function renderFullInventory() {
    const grid = document.getElementById("square-inventory-grid");
    if (!grid) return;

    // Inventar mare: 36 de locuri
    const TOTAL_SLOTS = 36;

    while (PLAYER_INVENTORY.length < TOTAL_SLOTS) {
        PLAYER_INVENTORY.push({
            type: -1,
            count: 0
        });
    }

    grid.innerHTML = "";

    for (let i = 0; i < PLAYER_INVENTORY.length; i++) {
        const item = PLAYER_INVENTORY[i];

        const button = document.createElement("button");
        button.type = "button";
        button.className = "square-inventory-item";

        if (i === SELECTED_SLOT) {
            button.classList.add("selected");
        }

        if (item.type >= 0 && item.count > 0) {
            const icon = getBlockIcon(item.type);
            const name = getBlockName(item.type);
            const count = item.count === Infinity ? "∞" : item.count;

            button.textContent = icon + " " + count;
            button.title = name;
        } else {
            button.textContent = "";
            button.title = "Loc gol";
        }

        button.addEventListener("click", function () {
            if (i < HOTBAR_SIZE) {
                SELECTED_SLOT = i;
            } else if (item.type >= 0 && item.count > 0) {
                const oldItem = PLAYER_INVENTORY[SELECTED_SLOT];

                PLAYER_INVENTORY[SELECTED_SLOT] = PLAYER_INVENTORY[i];
                PLAYER_INVENTORY[i] = oldItem;
            } else {
                return;
            }

            renderInventory();
            closeInventoryPanel();
        });

        grid.appendChild(button);
    }
}


function toggleInventoryPanel() {
    if (!gameRunning) return;

    const panel = createInventoryPanel();

    if (isInventoryPanelOpen()) {
        closeInventoryPanel();
        return;
    }

    keys.forward = false;
    keys.back = false;
    keys.left = false;
    keys.right = false;

    renderFullInventory();
    const tabs = document.getElementById("square-inventory-tabs");
    const modsTab = document.getElementById("square-tab-mods");
    if (tabs) {
        tabs.style.display = "flex";
        tabs.style.visibility = "visible";
    }
    if (modsTab) {
        modsTab.style.display = INVENTORY_GAME_MODE === "creative" ? "inline-flex" : "none";
        modsTab.style.visibility = INVENTORY_GAME_MODE === "creative" ? "visible" : "hidden";
    }
    document.getElementById("square-tab-blocks")?.click();
    panel.style.display = "flex";
}


// MOBILIER ÎN INVENTAR
INVENTORY_BLOCK_NAMES.push(
    "Scaun",
    "Masă",
    "Lampă",
    "Ușă"
);


INVENTORY_BLOCK_ICONS.push("🪑", "🍽️", "💡", "🚪");
