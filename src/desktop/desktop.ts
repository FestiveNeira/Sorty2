import { app, globalShortcut, BrowserWindow, ipcMain } from 'electron';
import { type Socket, io } from 'socket.io-client';
import { activePort, loadConfig, saveConfig } from '../utils/appconfig.js'; // still need to implement data saving (only default settings available rn)
import { toggleOverlayWindow } from './overlay.js';
import { startBackend } from './backendinit.js';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

// Loads locally stored data needed to configure the app (rn just connecting to the right address)
let appdata = loadConfig();

// ---------- WEBSOCKET CREATION ----------

const socket = io(`http://localhost:${activePort}`, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000, // Start retrying after 1s
    timeout: 5000,
    autoConnect: false
});

// Function that checks the webserver url 10 times over 3 seconds and connects when it's ready
async function connectWhenReady(socket: Socket, url = `http://localhost:${activePort}/`, maxAttempts = 10, delayMs = 300) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const res = await fetch(url);
            if (res.ok || res.status === 404) {
                console.log("✅ Backend is ready, connecting WebSocket...");
                socket.connect();
                return;
            }
        } catch (_) {
            // Ignore errors, keep retrying
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    console.error("Backend did not become ready in time.");
}

// ---------- WEBSOCKET EVENTS ----------

socket.on('connect_error', (err) => {
    console.log('Connect error:', err.message);
});

socket.on('reconnect_attempt', (attempt) => {
    console.log(`Reconnect attempt ${attempt}`);
});

// On server connection load the app page
socket.on('connect', () => {
    console.log('🟢 Connected to server!');
    mainWindow?.loadURL(`http://localhost:${activePort}`);
});

// On disconnect from server load the loading screen
socket.on('disconnect', () => {
    console.log('🔴 Disconnected from server.');
    mainWindow?.loadFile(join(__dirname, '../static/loading.html'));
});

// ---------- MAIN WINDOW ----------

// Create the browser window
function createWindow(): Promise<BrowserWindow | null> {
    return new Promise((resolve) => {
        mainWindow = new BrowserWindow({
            width: 800,
            height: 600,
            minWidth: 800,
            minHeight: 600,
            show: false,
            alwaysOnTop: false,
            autoHideMenuBar: true,
            frame: true,
            transparent: false,
            webPreferences: {
                nodeIntegration: false,  // Disable nodeIntegration for security reasons
            },
        });

        // Load the loading page first
        mainWindow.loadFile(join(__dirname, '../static/loading.html'));

        // Open DevTools for debugging
        mainWindow.webContents.openDevTools();

        mainWindow.on('ready-to-show', mainWindow.show);

        // When the window is closed, set it to null
        mainWindow.on('closed', () => {
            mainWindow = null;
        });

        mainWindow.webContents.on("did-finish-load", () => {
            resolve(mainWindow);
        });
    });
}

ipcMain.handle('load-window', (event, local?) => {
    if (local) {
        mainWindow?.loadFile('../frontend/local-settings.html');
    }
    else {
        mainWindow?.loadURL(`http://localhost:${activePort}`);
    }
});

// Respond to get-settings requests from the renderer process
ipcMain.handle('get-settings', () => {
    if (!appdata) {
        appdata = loadConfig();
    }
    return appdata;
});

// Respond to save-settings requests from the renderer process
ipcMain.handle('save-settings', (event, settings) => {
    saveConfig(settings);
    appdata = loadConfig();
});

// Just for extra stability
app.disableHardwareAcceleration();

// When Electron is ready, create the window and start the backend
app.whenReady().then(async () => {
    await startBackend(); // Start backend process
    await createWindow(); // Create the Electron window
    await connectWhenReady(socket);

    globalShortcut.register("Control+Shift+O", () => {
        console.log("Shortcut pressed: toggling overlay");
        toggleOverlayWindow();
    });
});

// Quit the app when all windows are closed (for macOS compatibility)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Re-create the window on macOS when the dock icon is clicked
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('quit', () => {
    // Unused
});