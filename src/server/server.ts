/*
This file is the backend server file.
It exposes all the app's API endpoints and is the main layer of communication between different parts of the app.
It is a place for data transfer not transformation!
*/

// Imports

import express, { Request, Response } from 'express';
import http from 'http';
import os from 'os';
// Local Imports
import config from '../utils/appconfig.js';
import * as bridge from '../utils/bridge.js';
import { initSocket } from './socket.js';
import { startLibrespot, stopLibrespot } from '../player/librespot.js';
import { setupRoutes } from './routes/index.js';

//Startup functions
// Get open valid port
const port = await config.initPort();
let externalAccessEnabled = false;
// Fix/create database if anything is broken or missing
bridge.initDatabase();

// Create the app object
const app = express();

// Generate HTTP server
const httpServer = http.createServer(app);

// Create socket manager for events!
initSocket(httpServer);

//*/ Start librespot if already authenticated
if (config.tokenValidCheck()) {
    startLibrespot(config.spotifyAccessToken)
        .catch(console.error);
} else {
    console.log('No valid Spotify tokens found, librespot will start after authentication');
}

setupRoutes(app);

// Fallback route
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Main route
app.get('/{*path}', (req: Request, res: Response) => {
    res.sendFile('index.html', { root: 'dist/frontend' });
});

// Start server
httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`);
});

// Cleanup
process.on('exit', () => {
    stopLibrespot();
});

process.on('SIGINT', () => {
    stopLibrespot();
    process.exit(0);
});