
/*
 SQUARE STACK - PC CONTROLS
 Tastatura + Mouse + Multiplayer
*/

(function () {

    const MOUSE_SENSITIVITY = 0.0025;

    function getCanvas() {
        if (!gameRunning || !renderer) {
            return null;
        }

        return renderer.domElement;
    }

    function isTyping(event) {
        const target = event.target;

        return target instanceof Element &&
            Boolean(target.closest(
                "input, textarea, select, [contenteditable='true']"
            ));
    }

    // TASTATURA
    window.addEventListener("keydown", function (event) {

        if (isTyping(event) || !gameRunning) {
            return;
        }

        // Nu miscam pagina cu sagetile
        if (
            event.code.startsWith("Arrow") ||
            event.code === "Space"
        ) {
            event.preventDefault();
        }

        // Alergare
        if (
            event.code === "ShiftLeft" ||
            event.code === "ShiftRight"
        ) {
            keys.sprint = true;
        }

        // Selectarea blocurilor 1-9
        const slot = /^Digit([1-9])$/.exec(event.code);

        if (slot) {
            selectInventorySlot(
                Number(slot[1]) - 1
            );
        }

        // Schimbarea perspectivei
        if (event.code === "KeyV" && !event.repeat) {
            changePerspective();
        }

        // Folosirea mobilierului
        if (
            event.code === "KeyR" &&
            !event.repeat &&
            typeof useFurniture === "function"
        ) {
            useFurniture();
        }

    }, true);


    // ELIBERAREA TASTELOR
    window.addEventListener("keyup", function (event) {

        const directions = {
            KeyW: "forward",
            ArrowUp: "forward",

            KeyS: "back",
            ArrowDown: "back",

            KeyA: "left",
            ArrowLeft: "left",

            KeyD: "right",
            ArrowRight: "right"
        };

        const direction = directions[event.code];

        if (direction) {
            keys[direction] = false;
        }

        if (
            event.code === "ShiftLeft" ||
            event.code === "ShiftRight"
        ) {
            keys.sprint = false;
        }

    });


    // EVITAM BLOCAREA MISCARII LA SCHIMBAREA FERESTREI
    window.addEventListener("blur", function () {

        keys.forward = false;
        keys.back = false;
        keys.left = false;
        keys.right = false;
        keys.sprint = false;

    });


    // ACTIVAREA MOUSE-ULUI
    document.addEventListener("click", function (event) {

        const canvas = getCanvas();

        if (!canvas || event.target !== canvas) {
            return;
        }

        if (document.pointerLockElement !== canvas) {
            canvas.requestPointerLock();
        }

    });


    // ROTIREA CAMEREI CU MOUSE-UL
    document.addEventListener("mousemove", function (event) {

        const canvas = getCanvas();

        if (!canvas ||
            document.pointerLockElement !== canvas) {
            return;
        }

        player.yaw -=
            event.movementX * MOUSE_SENSITIVITY;

        player.pitch -=
            event.movementY * MOUSE_SENSITIVITY;

        player.pitch = Math.max(
            -1.45,
            Math.min(1.45, player.pitch)
        );

    });


    // NU ROTIM CAMERA DE DOUA ORI
    document.addEventListener("pointermove", function (event) {

        const canvas = getCanvas();

        if (
            canvas &&
            document.pointerLockElement === canvas
        ) {
            event.stopPropagation();
        }

    }, true);


    // MINAT SI CONSTRUIT CU MOUSE-UL
    document.addEventListener("mousedown", function (event) {

        const canvas = getCanvas();

        if (!canvas ||
            document.pointerLockElement !== canvas ||
            event.target !== canvas) {
            return;
        }

        // CLICK STANGA - MINEAZA
        if (event.button === 0) {
            mineBlock();
        }

        // CLICK DREAPTA - CONSTRUIESTE
        if (event.button === 2) {
            placeBlock();
        }

    });


    // DEZACTIVAM MENIUL CLICK DREAPTA
    // DOAR PE ECRANUL JOCULUI
    document.addEventListener("contextmenu", function (event) {

        const canvas = getCanvas();

        if (canvas && event.target === canvas) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }

    }, true);


    // ROTITA MOUSE-ULUI - INVENTAR
    document.addEventListener("wheel", function (event) {

        const canvas = getCanvas();

        if (
            !canvas ||
            document.pointerLockElement !== canvas
        ) {
            return;
        }

        event.preventDefault();

        const direction = event.deltaY > 0 ? 1 : -1;

        const nextSlot = (
            SELECTED_SLOT + direction + HOTBAR_SIZE
        ) % HOTBAR_SIZE;

        selectInventorySlot(nextSlot);

    }, { passive: false });


    console.log("Square Stack: PC Controls activat!");

})();
