import { BrowserWindow } from "electron";
let overlayWindow = null;
export function toggleOverlayWindow() {
    if (overlayWindow) {
        overlayWindow.close();
        return;
    }
    overlayWindow = new BrowserWindow({
        width: 800,
        height: 600,
        alwaysOnTop: true,
        frame: false,
        transparent: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });
    overlayWindow.loadFile('../frontend/overlay.html');
    overlayWindow.on("closed", () => {
        overlayWindow = null;
    });
}
