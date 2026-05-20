import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import net from 'net';
import pkg from '../../package.json' with { type: 'json' };

interface AppConfig {
    secretToken: string;
    spotifyClientId: string;
    spotifyAccessToken: string,
    spotifyRefreshToken: string,
    spotifyTokenExpiry: number,
    externalAccessEnabled: boolean,
    lastDeviceId: string;
    skipPenalty: number;
    replayBonus: number;
    autoMin: number;
    autoMax: number;
    autoRate: boolean;
}

const defaults: AppConfig = {
    secretToken: crypto.randomBytes(32).toString('hex'),
    spotifyClientId: '404dc8fd0c1942e282ab92af0fa53bd7',
    spotifyAccessToken: '',
    spotifyRefreshToken: '',
    spotifyTokenExpiry: -1,
    externalAccessEnabled: false,
    lastDeviceId: '',
    skipPenalty: -1,
    replayBonus: 1,
    autoMin: 1,
    autoMax: 10,
    autoRate: false
};

class Config {
    private data: AppConfig;
    readonly appDataFolder: string;
    private configPath: string;
    activePort: number = 7878;
    readonly preferredPorts = [7878, 7879, 7880];

    constructor() {
        const appDataPath = (() => {
            switch (process.platform) {
                case 'win32': return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
                case 'darwin': return path.join(os.homedir(), 'Library', 'Application Support');
                case 'linux': return path.join(os.homedir(), '.config');
                default: throw new Error('Unsupported platform');
            }
        })();

        this.appDataFolder = path.join(appDataPath, pkg.name);
        this.configPath = path.join(this.appDataFolder, 'appconfig.json');

        if (!fs.existsSync(this.appDataFolder)) {
            fs.mkdirSync(this.appDataFolder, { recursive: true });
        }

        this.data = this.load();
    }

    private load(): AppConfig {
        if (fs.existsSync(this.configPath)) {
            return { ...defaults, ...JSON.parse(fs.readFileSync(this.configPath, 'utf-8')) };
        }
        this.persist();
        return { ...defaults };
    }

    private persist() {
        fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2));
    }

    // Config properties
    get secretToken() { return this.data.secretToken; }
    set secretToken(v: string) { this.data.secretToken = v; this.persist(); }

    get spotifyClientId() { return this.data.spotifyClientId; }
    set spotifyClientId(v: string) { this.data.spotifyClientId = v; this.persist(); }

    get spotifyAccessToken(): string { return this.data.spotifyAccessToken; }
    set spotifyAccessToken(v: string) { this.data.spotifyAccessToken = v; this.persist(); }

    get spotifyRefreshToken(): string { return this.data.spotifyRefreshToken; }
    set spotifyRefreshToken(v: string) { this.data.spotifyRefreshToken = v; this.persist(); }

    get spotifyTokenExpiry(): number { return this.data.spotifyTokenExpiry; }
    set spotifyTokenExpiry(v: number) { this.data.spotifyTokenExpiry = v; this.persist(); }

    get externalAccessEnabled() { return this.data.externalAccessEnabled; }
    set externalAccessEnabled(v: boolean) { this.data.externalAccessEnabled = v; this.persist(); }

    get lastDeviceId() { return this.data.lastDeviceId; }
    set lastDeviceId(v: string) { this.data.lastDeviceId = v; this.persist(); }

    get skipPenalty() { return this.data.skipPenalty; }
    set skipPenalty(v: number) { this.data.skipPenalty = v; this.persist(); }

    get replayBonus() { return this.data.replayBonus; }
    set replayBonus(v: number) { this.data.replayBonus = v; this.persist(); }

    get autoMin() { return this.data.autoMin; }
    set autoMin(v: number) { this.data.autoMin = v; this.persist(); }

    get autoMax() { return this.data.autoMax; }
    set autoMax(v: number) { this.data.autoMax = v; this.persist(); }

    get autoRate() { return this.data.autoRate; }
    set autoRate(v: boolean) { this.data.autoRate = v; this.persist(); }

    // Token expiration check
    tokenValidCheck(): boolean {
        // only checks expiry time because all three values get updated together // todo might update this to be an object rather than 3 seperate values
        if (!this.data.spotifyTokenExpiry) return false;
        return (Date.now() >= this.data.spotifyTokenExpiry);
    }

    // Port
    private isPortAvailable(port: number): Promise<boolean> {
        return new Promise(resolve => {
            const tester = net.createServer()
                .once('error', () => resolve(false))
                .once('listening', () => tester.close(() => resolve(true)))
                .listen(port, '127.0.0.1');
        });
    }

    async initPort(): Promise<number> {
        for (const port of this.preferredPorts) {
            if (await this.isPortAvailable(port)) {
                this.activePort = port;
                return port;
            }
        }
        throw new Error('All preferred ports are in use: ' + this.preferredPorts.join(', '));
    }
}

export default new Config();