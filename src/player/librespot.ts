/*
This file manages the librespot player process
Librespot is this app's built in spotify device so that users can listen without having spotify open in another window
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

import * as bridge from '../utils/bridge.js';

const deviceName = `Sorty — ${os.hostname()}`;

let librespotProcess: ChildProcess | null = null;

function getBinaryPath(): string {
    const binary = process.platform === 'win32' ? 'librespot.exe' : 'librespot';
    return path.join(process.cwd(), 'dist/player', binary);
}

function getEventScriptPath(): string {
    const binary = process.platform === 'win32' ? 'onevent.exe' : 'onevent';
    return path.join(process.cwd(), 'dist/player', binary);
}

function connectLibrespot() {
    bridge.connectDevice(deviceName);
}

export function startLibrespot(accessToken: string): Promise<void> {
    return new Promise((resolve) => {
        const binaryPath = getBinaryPath();

        if (!fs.existsSync(binaryPath)) {
            console.error('librespot binary not found at:', binaryPath);
            resolve();
            return;
        }

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
        ], { stdio: 'pipe' });

        librespotProcess.stdout?.on('data', (data: Buffer) => {
            console.log('librespot:', data.toString().trim());
        });

        librespotProcess.stderr?.on('data', (data: Buffer) => {
            const line = data.toString().trim();
            console.error('librespot:', line);
            // kinda hate this way of detecting connection tbh
            if (line.includes('Authenticated as')) {
                // Wait for connection to be established then start trying to switch to the librespot player
                connectLibrespot();
            }
        });

        librespotProcess.on('close', (code) => {
            console.log(`librespot exited with code ${code}`);
            librespotProcess = null;
            resolve();
        });
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
