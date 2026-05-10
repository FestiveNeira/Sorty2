import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import pkg from '../../package.json' with { type: 'json' };
const appDataPath = (() => {
    switch (process.platform) {
        case 'win32':
            return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
        case 'darwin':
            return path.join(os.homedir(), 'Library', 'Application Support');
        case 'linux':
            return path.join(os.homedir(), '.config');
        default:
            throw new Error('Unsupported platform');
    }
})();
export const appdataFolder = path.join(appDataPath, pkg.name);
const configPath = path.join(appdataFolder, 'appconfig.json');
if (!fs.existsSync(appdataFolder)) {
    fs.mkdirSync(appdataFolder, { recursive: true });
}
const defaults = {
    secretToken: crypto.randomBytes(32).toString('hex'),
    spotifyClientId: '404dc8fd0c1942e282ab92af0fa53bd7',
    lastDeviceId: '',
    skipPenalty: -1,
    replayBonus: 1,
    autoMin: 1,
    autoMax: 10,
    autoRate: false
};
export function loadConfig() {
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
    saveConfig(defaults);
    return defaults;
}
export function saveConfig(newConfig) {
    const existing = fs.existsSync(configPath)
        ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        : defaults;
    const merged = { ...existing, ...newConfig };
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
}
// Port selection
import net from 'net';
export const PREFERRED_PORTS = [7878, 7879, 7880];
export let activePort = PREFERRED_PORTS[0];
function isPortAvailable(port) {
    return new Promise(resolve => {
        const tester = net.createServer()
            .once('error', () => resolve(false))
            .once('listening', () => tester.close(() => resolve(true)))
            .listen(port, '127.0.0.1');
    });
}
export async function initPort() {
    for (const port of PREFERRED_PORTS) {
        if (await isPortAvailable(port)) {
            activePort = port;
            return port;
        }
    }
    throw new Error('All preferred ports are in use: ' + PREFERRED_PORTS.join(', '));
}
