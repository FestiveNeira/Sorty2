/*
This file is the backend server file.
It exposes all the app's API endpoints and is the main layer of communication between different parts of the app.
It is a place for data transfer not transformation!
*/

// Imports
import cookieParser from 'cookie-parser';
import cors from 'cors';
import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import http from 'http';
import jwt from 'jsonwebtoken';
import os from 'os';
import { Server } from 'socket.io';
// Local Imports
import { initPort, saveConfig, loadConfig } from '../utils/appconfig.js';
import * as bridge from '../utils/bridge.js';
import { startLibrespot, stopLibrespot } from '../player/librespot.js';
import { getAuthUrl, handleCallback } from '../spotify/spotifyauth.js';

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

// Create socket manager
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Event Emission
const clients = new Set<Response>();
export function emitDeviceConnected() {
    for (const client of clients) {
        client.write('event: deviceConnected\ndata: {}\n\n');
    }
}
export function emitPlaybackStateUpdate() {
    for (const client of clients) {
        client.write('event: playbackStateUpdate\ndata: {}\n\n');
    }
}

// Start librespot if already authenticated
const existingTokens = bridge.getSpotifyTokens();
if (existingTokens && !bridge.isTokenExpired()) {
    startLibrespot(`Sorty — ${os.hostname()}`, existingTokens.access_token)
        .then(() => connectToLibrespot())
        .catch(console.error);
} else {
    console.log('No valid Spotify tokens found, librespot will start after authentication');
}

async function connectToLibrespot(maxAttempts = 10, delayMs = 2000): Promise<void> {
    const deviceName = `Sorty — ${os.hostname()}`;

    for (let i = 0; i < maxAttempts; i++) {
        console.log(`Waiting for librespot device... attempt ${i + 1}/${maxAttempts}`);

        const devices = await bridge.getDevices();
        const librespotDevice = devices.find((d: any) => 
            d.name === deviceName
        );

        if (librespotDevice) {
            console.log(`Found librespot device: ${librespotDevice.id}`);
            await bridge.connectDevice(librespotDevice.id)
            emitDeviceConnected();
            saveConfig({ ...loadConfig(), lastDeviceId: librespotDevice.id });
            console.log('Connected to librespot device');
            return;
        }

        await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    console.error('Could not find librespot device after', maxAttempts, 'attempts');
}

// Funtions for processing errors and retrying logic
async function handleError (e: any, func?: () => Promise<any>): Promise<void> {
    // Print the error
    console.error(`Error ${e.status}: ${e.message}`);
    // If error was because no active device was found, then try to reconnect
    if (e.reason == 'NO_ACTIVE_DEVICE') {
        let success = await reconnectDevice();
        console.log(`little ${success}`);
        if (success && func) {
            try {
                // After reconnecting try to rerun the function that threw the error
                await new Promise(resolve => setTimeout(resolve, 1000));
                await func();
                emitPlaybackStateUpdate();
            }
            catch (e: any) {
                console.error(`Error ${e.status}: ${e.message}`);
            }
        }
    }
} 

async function reconnectDevice(): Promise<boolean> {
    let status = await bridge.connectDevice();
    if (status == 404) console.error('Error 404: No playback devices found.');
    if (status == 204) return true;
    return false;
}

// Rate limit middleware
app.use((req, res, next) => {
    const isLocal = req.ip === '127.0.0.1' || req.ip === '::1';
    if (isLocal) return next(); // skip rate limiting for local
    next();
}, rateLimit({ windowMs: 5 * 60 * 1000, max: 100 }));
app.use(cookieParser());
app.use(cors());
app.use(express.json());
// Security middleware todo find out what actually is needed and remove unneeded
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
// Auth middleware
app.use((req: Request, res: Response, next: NextFunction) => {
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

// ---------- API Routes ----------
// App Events
app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    clients.add(res);
    req.on('close', () => clients.delete(res));
});
// Librespot Events
app.post('/api/librespot-event', (req: Request, res: Response) => {
    const { event } = req.body;
    console.log('librespot event:', event);
    if (event === 'session_disconnected' || event === 'inactive') {
        connectToLibrespot();
    }
    res.json({ success: true });
});

// Login
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

app.get('/api/external-access', (req: Request, res: Response) => {
    res.json({ externalAccessEnabled });
});

app.post('/api/external-access/toggle', (req: Request, res: Response) => {
    externalAccessEnabled = !externalAccessEnabled;
    emitPlaybackStateUpdate();
    res.json({ externalAccessEnabled });
});

// Spotify auth
app.get('/api/spotify/auth', async (req: Request, res: Response) => {
    const url = await getAuthUrl(config.spotifyClientId);
    res.redirect(url);
});

// Callback route
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
        await startLibrespot(`Sorty — ${os.hostname()}`, tokens.access_token);
        await connectToLibrespot();
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

// WebSocket
io.on('connection', (socket: any) => {
    console.log('Client connected:', socket.id);

    socket.emit('externalAccessUpdate', externalAccessEnabled);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Serve SvelteKit frontend
app.use(express.static('dist/frontend'));

// ---------- PLAYBACK ----------

// Get player state
app.get('/api/playback', async (req: Request, res: Response) => {
    try {
        const state = await bridge.getPlaybackState();
        res.json(state);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.getPlaybackState());
    }
});

app.get('/api/queue', async (req: Request, res: Response) => {
    try {
        const queue = await bridge.getQueue();
        res.json(queue);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.getQueue());
    }
});

app.get('/api/devices', async (req: Request, res: Response) => {
    try {
        const devices = await bridge.getDevices();
        res.json(devices);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.getDevices());
    }
});

app.post('/api/devices/connect', async (req: Request, res: Response) => {
    const deviceId = req.body ?? config.lastDeviceId;
    try {
        const connected = await bridge.connectDevice(deviceId);
        console.log(connected); // test
        if (connected) {
            config.lastDeviceId = deviceId;
            saveConfig(config);
            emitDeviceConnected();
        }
        res.json({ connected });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.connectDevice(deviceId));
    }
});

app.post('/api/playback/volume', async (req: Request, res: Response) => {
    const { volume } = req.body;
    try {
        await bridge.setVolume(volume);
        emitPlaybackStateUpdate();
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.setVolume(volume));
    }
});

app.post('/api/playback/play', async (req: Request, res: Response) => {
    try {
        await bridge.play();
        emitPlaybackStateUpdate();
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        console.log("play start");
        await handleError(e, () => bridge.play());
        console.log("play end");
    }
});

app.post('/api/playback/:uri/play', async (req: Request, res: Response) => {
    const uri = req.params.uri as string;
    try {
        await bridge.play(uri);
        emitPlaybackStateUpdate();
        res.json({ uri });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.play(uri));
    }
});

app.post('/api/playback/pause', async (req: Request, res: Response) => {
    try {
        await bridge.pause();
        emitPlaybackStateUpdate();
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.pause());
    }
});

app.post('/api/playback/next', async (req: Request, res: Response) => {
    try {
        await bridge.skipNext();
        emitPlaybackStateUpdate();
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.skipNext());
    }
});

app.post('/api/playback/previous', async (req: Request, res: Response) => {
    try {
        await bridge.skipPrevious();
        emitPlaybackStateUpdate();
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.skipPrevious());
    }
});

app.post('/api/playback/seek', async (req: Request, res: Response) => {
    const { positionMs } = req.body;
    try {
        await bridge.seekToPosition(positionMs);
        emitPlaybackStateUpdate();
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.seekToPosition(positionMs))
    }
});

// ---------- THEMES ----------

app.get('/api/themes', async (req: Request, res: Response) => {
    try {
        const themes = bridge.getThemes();
        res.json(themes);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/themes', async (req: Request, res: Response) => {
    try {
        const { name, cloneFromThemeId } = req.body;
        const id = bridge.createTheme(name, cloneFromThemeId);
        res.json({ id });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/themes/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const { name } = req.body;
        bridge.renameTheme(id, name);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/themes/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        bridge.deleteTheme(id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/themes/:id/songs', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const { search, sortBy, order } = req.query as Record<string, string>;
        const songs = bridge.getThemeSongs(id, search, sortBy, order);
        res.json(songs);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/themes/:id/play', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const uri = await bridge.updateThemedPlaylist(id);
        await bridge.play(uri);
        res.json({ uri });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ---------- RATINGS ----------

app.post('/api/ratings', async (req: Request, res: Response) => {
    try {
        const { spotifyId, themeId, delta } = req.body;
        const newRating = await bridge.rateSong(spotifyId, themeId, delta);
        res.json({ rating: newRating });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/songs/:id/ratings', async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const ratings = bridge.getSongRatings(id);
        res.json(ratings);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ---------- PLAYLISTS ----------

app.get('/api/playlists', async (req: Request, res: Response) => {
    try {
        const playlists = bridge.getPlaylists();
        res.json(playlists);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/playlists', async (req: Request, res: Response) => {
    try {
        const { name, themeId, ratingMin, ratingMax, sort, limitCount, isDynamic } = req.body;
        const id = await bridge.createSavedPlaylist(name, themeId, ratingMin, ratingMax, sort, limitCount, isDynamic);
        res.json({ id });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/playlists/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const { name, isDynamic, ratingMin, ratingMax, sort, limitCount } = req.body;
        bridge.updateSavedPlaylist(id, name, isDynamic, ratingMin, ratingMax, sort, limitCount);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/playlists/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        bridge.deleteSavedPlaylist(id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/playlists/:id/songs', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const songs = bridge.getSavedPlaylistSongs(id);
        res.json(songs);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/playlists/:id/play', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const uri = await bridge.loadSavedPlaylist(id);
        await bridge.play(uri);
        res.json({ uri });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/playlists/preview', async (req: Request, res: Response) => {
    try {
        const { themeId, ratingMin, ratingMax, sort, limitCount } = req.query as Record<string, string>;
        if (!themeId) return res.status(400).json({ error: 'themeId is required' });

        const songs = bridge.previewPlaylistCriteria(
            parseInt(themeId),
            ratingMin ? parseInt(ratingMin) : null,
            ratingMax ? parseInt(ratingMax) : null,
            sort ?? 'top',
            limitCount ? parseInt(limitCount) : null
        );
        res.json(songs);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ---------- THEMED PLAYLIST ----------

app.get('/api/playlists/themed/songs', async (req: Request, res: Response) => {
    try {
        const songs = bridge.getThemedPlaylistSongs();
        res.json(songs);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/playlists/themed/update', async (req: Request, res: Response) => {
    try {
        const { themeId, ratingMin, ratingMax, sort, limitCount } = req.body;
        if (!themeId) return res.status(400).json({ error: 'themeId is required' });

        const uri = await bridge.updateThemedPlaylist(
            themeId,
            ratingMin ?? null,
            ratingMax ?? null,
            sort ?? 'top',
            limitCount ?? null
        );
        res.json({ uri });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ---------- SETTINGS ----------

app.get('/api/settings', (req: Request, res: Response) => {
    try {
        const settings = bridge.getSettingsData();
        const networkInterfaces = os.networkInterfaces();
        const localIp = Object.values(networkInterfaces)
            .flat()
            .find((i) => i?.family === 'IPv4' && !i.internal)?.address ?? 'unknown';
        res.json({ ...settings, localIp });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/settings', (req: Request, res: Response) => {
    try {
        const { spotifyClientId, skipPenalty, replayBonus } = req.body;
        saveConfig({ spotifyClientId, skipPenalty, replayBonus });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/settings/regenerate-token', (req: Request, res: Response) => {
    try {
        const secretToken = crypto.randomBytes(32).toString('hex');
        saveConfig({ secretToken });
        res.json({ secretToken });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/settings/themed-playlist', async (req: Request, res: Response) => {
    try {
        const { uri } = req.body;
        await bridge.setThemedPlaylist(uri);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/settings/master-playlist', async (req: Request, res: Response) => {
    try {
        const { uri } = req.body;
        const imported = await bridge.setMasterPlaylist(uri);
        res.json({ success: true, imported });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/external-access/toggle', (req: Request, res: Response) => {
    try {
        externalAccessEnabled = !externalAccessEnabled;
        // todo fix external acces stuff
        // io.emit('externalAccessUpdate', externalAccessEnabled);
        res.json({ externalAccessEnabled });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Fallback routes
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