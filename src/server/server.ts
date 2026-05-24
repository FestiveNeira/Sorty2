/*
This file is the backend server file.
It exposes all the app's API endpoints and is the main layer of communication between different parts of the app.
It is a place for data transfer not transformation!
*/

import express, { Request, Response } from 'express';
import http from 'http';
import config from '../utils/appconfig.js';
import { initDatabase } from '../utils/bridge.js';
import { initSocket } from './socket.js';
import { initMiddleware } from './middleware.js';
import { setupRoutes } from './routes/index.js';
import { startLibrespot, stopLibrespot } from '../player/librespot.js';

//Startup functions
const port = await config.initPort();

const app = express();
const httpServer = http.createServer(app);

initDatabase();
initSocket(httpServer);
initMiddleware(app);
setupRoutes(app);

console.log((config.spotifyTokenExpiry - Date.now()) + " - " + config.tokenValidCheck())
//*/ Start librespot if already authenticated
if (config.tokenValidCheck()) {
    startLibrespot(config.spotifyAccessToken)
        .catch(console.error);
} else {
    console.log('No valid Spotify tokens found, librespot will start after authentication');
}

app.use('/api', (req, res) => { res.status(404).json({ error: 'Not found' }); });
app.get('/{*path}', (req: Request, res: Response) => { res.sendFile('index.html', { root: 'dist/frontend' }); });

// Start server
httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`);
});

// Cleanup
process.on('exit', () => { stopLibrespot(); });
process.on('SIGINT', () => { stopLibrespot(); process.exit(0); });