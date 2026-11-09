
const { app, BrowserWindow } = require("electron");
const path = require("node:path");

app.whenReady().then(() => {
    process.env.PORT = "3987";

    process.env.SQUARE_STACK_DATA_DIR =
        path.join(app.getPath("userData"), "server-data");

    require("./server.js");

    const window = new BrowserWindow({
        width: 1280,
        height: 800,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    window.loadURL(
        "http://127.0.0.1:3987/index.html"
    );
});

app.on("window-all-closed", () => {
    app.quit();
});
