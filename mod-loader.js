
/*
 SQUARE STACK MODLOADER 1.0
 Moduri ZIP cu JavaScript
 Motor: Three.js
*/

(() => {
    "use strict";

    const DB_NAME = "SquareStackModLoader";
    const STORE = "mods";
    const hooks = new Map();

    const Mods = {
        ready: Promise.resolve(),

        safeMode:
            new URLSearchParams(location.search)
                .get("mods") === "off",

        on(event, callback) {
            if (!hooks.has(event)) {
                hooks.set(event, []);
            }

            hooks.get(event).push(callback);
        },

        emit(event, data = {}) {
            for (const callback of hooks.get(event) || []) {
                try {
                    callback(data);
                } catch (error) {
                    console.error("Eroare mod:", error);
                }
            }

            return data;
        },

        patch(functionName, makeReplacement) {
            const original = window[functionName];

            if (typeof original !== "function") {
                throw Error(
                    "Funcția nu există: " + functionName
                );
            }

            const replacement = makeReplacement(original);

            if (typeof replacement !== "function") {
                throw Error("Patch invalid");
            }

            window[functionName] = replacement;
        }
    };

    window.SquareStackMods = Mods;

    function status(message) {
        const element = document.getElementById(
            "mod-pack-status"
        );

        if (element) element.textContent = message;

        console.log("Square Stack Mods:", message);
    }

    // SALVAREA MODURILOR

    function openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);

            request.onupgradeneeded = () => {
                const db = request.result;

                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, {
                        keyPath: "id"
                    });
                }
            };

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    async function databaseAction(mode, action) {
        const db = await openDatabase();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const request = action(
                tx.objectStore(STORE)
            );

            let result;

            request.onsuccess = () => {
                result = request.result;
            };

            tx.oncomplete = () => {
                db.close();
                resolve(result);
            };

            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };

            tx.onabort = () => {
                db.close();
                reject(tx.error);
            };
        });
    }

    function allMods() {
        return databaseAction(
            "readonly",
            store => store.getAll()
        );
    }

    function saveMod(mod) {
        return databaseAction(
            "readwrite",
            store => store.put(mod)
        );
    }

    function removeMod(id) {
        return databaseAction(
            "readwrite",
            store => store.delete(id)
        );
    }

    // CITIREA MOD.JSON

    async function readManifest(zip) {
        const file = zip.file("mod.json");

        if (!file) {
            throw Error("Lipsește mod.json");
        }

        const manifest = JSON.parse(
            await file.async("string")
        );

        if (
            typeof manifest.id !== "string" ||
            !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(
                manifest.id
            )
        ) {
            throw Error("ID de mod invalid");
        }

        if (
            typeof manifest.name !== "string" ||
            !manifest.name.trim()
        ) {
            throw Error("Nume de mod invalid");
        }

        const main = manifest.main || "mod.js";

        if (
            typeof main !== "string" ||
            !/^[a-zA-Z0-9_./-]+\.js$/.test(main) ||
            main.startsWith("/") ||
            main.split("/").includes("..")
        ) {
            throw Error("Cale JavaScript invalidă");
        }

        if (!zip.file(main)) {
            throw Error("Lipsește " + main);
        }

        return {
            id: manifest.id,
            name: manifest.name.slice(0, 100),
            version: String(manifest.version || "1.0"),
            main
        };
    }

    // EXECUTAREA CODULUI MODULUI

    function executeScript(source) {
        return new Promise((resolve, reject) => {
            const blob = new Blob(
                [source],
                { type: "text/javascript" }
            );

            const url = URL.createObjectURL(blob);
            const script = document.createElement("script");

            script.src = url;

            script.onload = () => {
                URL.revokeObjectURL(url);
                script.remove();
                resolve();
            };

            script.onerror = () => {
                URL.revokeObjectURL(url);
                script.remove();
                reject(Error("Modul nu a putut porni"));
            };

            document.head.appendChild(script);
        });
    }

    async function loadEnabledMods() {
        if (Mods.safeMode) {
            status("Mod sigur: toate modurile sunt oprite.");
            return;
        }

        if (typeof JSZip === "undefined") {
            status("Eroare: biblioteca JSZip lipsește.");
            return;
        }

        const installed = await allMods();
        let loaded = 0;

        for (const pack of installed) {
            if (!pack.enabled) continue;

            try {
                const zip = await JSZip.loadAsync(
                    pack.bytes
                );

                const manifest = await readManifest(zip);

                if (manifest.id !== pack.id) {
                    throw Error("ID-ul nu corespunde");
                }

                const source = await zip.file(
                    manifest.main
                ).async("string");

                if (source.length > 512 * 1024) {
                    throw Error("Script prea mare");
                }

                await executeScript(source);
                loaded++;

            } catch (error) {
                console.error(
                    "Modul " + pack.id,
                    error
                );

                status(
                    "Eroare în " + pack.name +
                    ": " + error.message
                );
            }
        }

        if (loaded || !installed.some(m => m.enabled)) {
            status(loaded + " mod(uri) încărcate.");
        }
    }

    // MENIUL MODURILOR

    async function renderModList() {
        const container = document.getElementById(
            "mod-pack-list"
        );

        if (!container) return;

        container.replaceChildren();

        const installed = await allMods();

        if (!installed.length) {
            container.textContent =
                "Nu ai moduri instalate.";
            return;
        }

        for (const pack of installed) {
            const row = document.createElement("div");

            row.style.cssText =
                "display:flex;gap:10px;" +
                "align-items:center;margin:10px 0";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = !!pack.enabled;

            checkbox.onchange = async () => {
                if (
                    checkbox.checked &&
                    !confirm(
                        "Modurile JavaScript pot accesa " +
                        "datele jocului. Activează numai " +
                        "moduri de încredere. Continui?"
                    )
                ) {
                    checkbox.checked = false;
                    return;
                }

                pack.enabled = checkbox.checked;

                await saveMod(pack);

                status(
                    "Modificare salvată. " +
                    "Apasă F5 pentru aplicare."
                );
            };

            const name = document.createElement("span");
            name.textContent =
                pack.name + " (" + pack.version + ")";

            const remove = document.createElement("button");
            remove.textContent = "Șterge";

            remove.onclick = async () => {
                if (!confirm("Ștergi " + pack.name + "?")) {
                    return;
                }

                await removeMod(pack.id);
                await renderModList();

                status(
                    "Mod șters. Apasă F5 pentru " +
                    "a elimina efectele."
                );
            };

            row.append(checkbox, name, remove);
            container.appendChild(row);
        }
    }

    // INSTALAREA UNUI MOD ZIP

    window.installSquareStackMod = async function () {
        const file = document.getElementById(
            "mod-pack-file"
        )?.files?.[0];

        if (!file) {
            status("Alege un ZIP!");
            return;
        }

        if (!file.name.toLowerCase().endsWith(".zip")) {
            status("Modul trebuie să fie ZIP.");
            return;
        }

        if (file.size >  99999 * 1024 * 1024) {
            status("ZIP prea mare. Maxim 80 MB.");
            return;
        }

        if (typeof JSZip === "undefined") {
            status("JSZip nu este încărcat.");
            return;
        }

        try {
            const bytes = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(bytes);
            const manifest = await readManifest(zip);

            const approved = confirm(
                "Instalezi " + manifest.name + "?\n\n" +
                "Acest mod poate modifica jocul și " +
                "accesa datele site-ului.\n" +
                "Instalează numai moduri de încredere."
            );

            if (!approved) return;

            await saveMod({
                id: manifest.id,
                name: manifest.name,
                version: manifest.version,
                bytes,
                enabled: true
            });

            await renderModList();

            status(
                manifest.name +
                " instalat! Salvează lumea și apasă F5."
            );

        } catch (error) {
            status("Eroare: " + error.message);
        }
    };

    // CONECTARE LA MAIN.JS

    if (typeof window.startWorld === "function") {
        const original = window.startWorld;

        window.startWorld = async function (...args) {
            await Mods.ready;

            const result = await original.apply(this, args);

            Mods.emit("worldStart", {
                world: args[0],
                scene,
                camera,
                player
            });

            return result;
        };
    }

    if (typeof window.updatePlayer === "function") {
        const original = window.updatePlayer;

        window.updatePlayer = function (delta) {
            const result = original.call(this, delta);

            Mods.emit("tick", {
                delta,
                player,
                scene
            });

            return result;
        };
    }

    for (const name of [
        "jump",
        "mineBlock",
        "placeBlock"
    ]) {
        if (typeof window[name] !== "function") {
            continue;
        }

        const original = window[name];

        window[name] = function (...args) {
            const context = {
                args,
                cancel: false
            };

            Mods.emit("before:" + name, context);

            if (context.cancel) return;

            const result = original.apply(
                this,
                context.args
            );

            Mods.emit("after:" + name, {
                args: context.args,
                result
            });

            return result;
        };
    }

    // PORNIRE

    Mods.ready = (async () => {
        try {
            await loadEnabledMods();
            await renderModList();
        } catch (error) {
            console.error(error);
            status("ModLoader: " + error.message);
        }
    })();

    console.log("Square Stack ModLoader activ!");
})();
