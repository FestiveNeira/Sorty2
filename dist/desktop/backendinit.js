import { spawn } from 'child_process';
import http from 'http';
let backendProcess = null;
// todo: either disconnect backend from here or import the server data loader (backend) instead of hardcoding
// Send an http request to backend to see if it's running
function isBackendRunning() {
    return new Promise((resolve) => {
        const testConnection = http.request({ hostname: 'localhost', port: 8888, timeout: 500 }, () => resolve(true));
        testConnection.on('error', () => resolve(false));
        testConnection.end();
    });
}
// Start the backend process
export async function startBackend() {
    const alreadyRunning = await isBackendRunning();
    if (alreadyRunning) {
        console.log('Server is already running, skipping startup.');
        return;
    }
    console.log('Starting server...');
    // Using path relative to root because spawn defaults to working directory (works in dev may not work in prod, needs research/testing)
    backendProcess = spawn('node', ['dist/server/server.js'], {
        stdio: 'inherit',
    });
    backendProcess.on('close', (code) => {
        if (code && code !== 0) {
            console.error(`Server exited with code ${code}. Restarting...`);
            backendProcess = null;
            setTimeout(startBackend, 2500);
        }
        else {
            console.log(`Server closed`);
        }
    });
    process.on('exit', () => {
        if (backendProcess)
            backendProcess.kill();
    });
}
