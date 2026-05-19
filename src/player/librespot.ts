/*
This file manages the librespot player process
Librespot is this app's built in spotify device so that users can listen without having spotify open in another window
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

let librespotProcess: ChildProcess | null = null;

function getBinaryPath(): string {
    const binary = process.platform === 'win32' ? 'librespot.exe' : 'librespot';
    return path.join(process.cwd(), 'dist/player', binary);
}

function getEventScriptPath(): string {
    const binary = process.platform === 'win32' ? 'onevent.exe' : 'onevent';
    return path.join(process.cwd(), 'dist/player', binary);
}

export async function startLibrespot(deviceName: string, accessToken: string): Promise<void> {
    const binaryPath = getBinaryPath();

    if (!fs.existsSync(binaryPath)) {
        console.error('librespot binary not found at:', binaryPath);
        return;
    }

    // Kill any existing instance before starting a new one
    stopLibrespot();

    console.log('Starting librespot...');

    librespotProcess = spawn(binaryPath, [
        '--name', deviceName,
        '--bitrate', '320',
        '--device-type', 'computer',
        '--access-token', accessToken,
        '--backend', 'rodio',
        '--disable-audio-cache',
        '--onevent', getEventScriptPath(),
    ], {
        stdio: 'pipe'
    });

    librespotProcess.stdout?.on('data', (data: Buffer) => {
        console.log('librespot:', data.toString().trim());
    });

    librespotProcess.stderr?.on('data', (data: Buffer) => {
        console.error('librespot:', data.toString().trim());
    });

    librespotProcess.on('close', (code) => {
        console.log(`librespot exited with code ${code}`);
        librespotProcess = null;
    });
}

export function stopLibrespot(): void {
    if (librespotProcess) {
        librespotProcess.kill();
        librespotProcess = null;
        console.log('librespot stopped');
    }
}

export function isLibrespotRunning(): boolean {
    return librespotProcess !== null;
}
