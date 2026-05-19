/*
This file is the backend server file.
It exposes all the app's API endpoints and is the main layer of communication between different parts of the app.
It is a place for data transfer not transformation!
*/

// Imports
import cookieParser from 'cookie-parser';
import cors from 'cors';

import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import http from 'http';
import jwt from 'jsonwebtoken';
import os from 'os';
// Local Imports
import { initPort, saveConfig, loadConfig } from '../utils/appconfig.js';
import * as bridge from './bridge.js';
import { initSocket } from './socket.js';
import { startLibrespot, stopLibrespot } from '../player/librespot.js';
import { getAuthUrl, handleCallback } from '../spotify/spotifyauth.js';
import { setupRoutes } from './routes/index.js';

//Startup functions
// Get open valid port
const port = await initPort();
// Config settings
const config = loadConfig();
let externalAccessEnabled = false;
// Fix/create database if anything is broken or missing
bridge.initDatabase();

// Create the app object
const app = express();

// Generate HTTP server
const httpServer = http.createServer(app);

const deviceName = `Sorty — ${os.hostname()}`;

// Create socket manager for events!
initSocket(httpServer);

//*/ Start librespot if already authenticated
const existingTokens = bridge.getSpotifyTokens();
if (existingTokens && !bridge.isTokenExpired()) {
    startLibrespot(deviceName, existingTokens.access_token)
        .then(() => bridge.connectDevice(deviceName))
        .catch(console.error);
} else {
    console.log('No valid Spotify tokens found, librespot will start after authentication');
}
//*/

app.use((req, res, next) => {
    const isLocal = req.ip === '127.0.0.1' || req.ip === '::1';
    if (isLocal) return next();
    next();
}, rateLimit({ windowMs: 5 * 60 * 1000, max: 100 }));
app.use(cookieParser());
app.use(cors());
app.use(express.json());
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://sdk.scdn.co"],
            frameSrc: ["'self'", "https://sdk.scdn.co"],
            connectSrc: ["'self'", "https://api.spotify.com", "wss://dealer.spotify.com", "https://dealer.spotify.com"],
            imgSrc: ["'self'", "data:", "https://i.scdn.co", "https://*.scdn.co", "https://*.spotifycdn.com"],
        }
    }
}));
app.use((req: Request, res: Response, next) => {
    const isLocal = req.ip === '127.0.0.1' || req.ip === '::1';
    if (isLocal) return next();

    if (!externalAccessEnabled) {
        req.socket.destroy();
        return;
    }

    if (req.path === '/api/login') return next();

    try {
        jwt.verify(req.cookies?.auth, config.secretToken);
        next();
    } catch {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.redirect('/login');
    }
});

// Serve SvelteKit frontend
app.use(express.static('dist/frontend'));

// API Routes

setupRoutes(app);

// Auth Endpoints

app.post('/api/librespot-event', (req: Request, res: Response) => {
    const { event } = req.body;
    console.log('librespot event:', event);
    if (event === 'session_disconnected' || event === 'inactive') {
        bridge.connectDevice(deviceName, true);
    }
    res.json({ success: true });
});

app.post('/api/login', (req: Request, res: Response) => {
    if (req.body.token === config.secretToken) {
        const token = jwt.sign(
            { authenticated: true },
            config.secretToken,
            { expiresIn: '30d' }
        );
        res.cookie('auth', token, {
            httpOnly: true,
            secure: true,
            maxAge: 30 * 24 * 60 * 60 * 1000
        });
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid token' });
    }
});

app.post('/api/logout', (req: Request, res: Response) => {
    res.clearCookie('auth');
    res.json({ success: true });
});

app.get('/api/spotify/auth', async (req: Request, res: Response) => {
    const url = await getAuthUrl(config.spotifyClientId);
    res.redirect(url);
});

app.get('/api/spotify/callback', async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const error = req.query.error as string;

    if (error || !code) {
        return res.redirect('?spotify=error');
    }

    await handleCallback(code, config.spotifyClientId);

    // Start librespot with the new token
    const tokens = bridge.getSpotifyTokens();
    if (tokens) {
        await startLibrespot(deviceName, tokens.access_token);
        bridge.connectDevice(deviceName, true);
    }

    res.redirect('?spotify=success');
});

app.get('/api/spotify/token', (req: Request, res: Response) => {
    try {
        const tokens = bridge.getSpotifyTokens();
        if (!tokens) return res.status(401).json({ error: 'Not authenticated' });

        // Refresh if expired before sending
        if (bridge.isTokenExpired()) {
            // Token will auto refresh on next spotify call
        }

        res.json({ accessToken: tokens.access_token });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// External

app.get('/api/external-access', (req: Request, res: Response) => {
    res.json({ externalAccessEnabled });
});

app.post('/api/external-access/toggle', (req: Request, res: Response) => {
    try {
        externalAccessEnabled = !externalAccessEnabled;
        // todo fix external access stuff
        // io.emit('externalAccessUpdate', externalAccessEnabled);
        res.json({ externalAccessEnabled });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

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