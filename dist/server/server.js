import cors from 'cors';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { getSpotifyTokens, isTokenExpired, initDatabase } from '../database/database.js';
import { initPort, saveConfig, loadConfig } from '../utils/appconfig.js';
import { getAuthUrl, handleCallback } from '../utils/spotifyauth.js';
import os from 'os';
import crypto from 'crypto';
import * as bridge from '../utils/bridge.js';
// Spotify scopes
const SPOTIFY_SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'playlist-read-private',
    'playlist-modify-private',
    'playlist-modify-public',
].join(' ');
// Get open valid port
const port = await initPort();
// Fix/create database if anything is broken or missing
initDatabase();
// Config settings
const config = loadConfig();
let externalAccessEnabled = false;
// Create the app object
const app = express();
// Generate HTTP Server
const httpServer = http.createServer(app);
// Create Socket Manager
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
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
app.use((req, res, next) => {
    const isLocal = req.ip === '127.0.0.1' || req.ip === '::1';
    if (isLocal)
        return next(); // skip rate limiting for local
    next();
}, rateLimit({ windowMs: 5 * 60 * 1000, max: 100 }));
app.use(cors());
app.use(express.json());
app.use(cookieParser());
//test remove
app.use((req, _res, next) => {
    console.log("➡️ REQUEST:", req.method, req.url);
    next();
});
// Auth middleware
app.use((req, res, next) => {
    const isLocal = req.ip === '127.0.0.1' || req.ip === '::1';
    if (isLocal)
        return next();
    if (!externalAccessEnabled) {
        req.socket.destroy();
        return;
    }
    if (req.path === '/api/login')
        return next();
    try {
        jwt.verify(req.cookies?.auth, config.secretToken);
        next();
    }
    catch {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.redirect('/login');
    }
});
// API Routes
app.post('/api/login', (req, res) => {
    if (req.body.token === config.secretToken) {
        const token = jwt.sign({ authenticated: true }, config.secretToken, { expiresIn: '30d' });
        res.cookie('auth', token, {
            httpOnly: true,
            secure: true,
            maxAge: 30 * 24 * 60 * 60 * 1000
        });
        res.json({ success: true });
    }
    else {
        res.status(401).json({ error: 'Invalid token' });
    }
});
app.post('/api/logout', (req, res) => {
    res.clearCookie('auth');
    res.json({ success: true });
});
app.get('/api/external-access', (req, res) => {
    res.json({ externalAccessEnabled });
});
app.post('/api/external-access/toggle', (req, res) => {
    externalAccessEnabled = !externalAccessEnabled;
    io.emit('externalAccessUpdate', externalAccessEnabled);
    res.json({ externalAccessEnabled });
});
// Spotify auth
app.get('/api/spotify/auth', async (req, res) => {
    const url = await getAuthUrl(config.spotifyClientId);
    res.redirect(url);
});
// Callback route
app.get('/api/spotify/callback', async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;
    if (error || !code) {
        return res.redirect('?spotify=error');
    }
    await handleCallback(code, config.spotifyClientId);
    res.redirect('?spotify=success');
});
app.get('/api/spotify/token', (req, res) => {
    try {
        const tokens = getSpotifyTokens();
        if (!tokens)
            return res.status(401).json({ error: 'Not authenticated' });
        // Refresh if expired before sending
        if (isTokenExpired()) {
            // Token will auto refresh on next spotify call
            // For now return what we have, SDK will handle expiry
        }
        res.json({ accessToken: tokens.access_token });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// WebSocket
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.emit('externalAccessUpdate', externalAccessEnabled);
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});
// Serve SvelteKit frontend
app.use(express.static('dist/frontend'));
// ---------- PLAYBACK ----------
// Helper to fetch and broadcast playback state todo may not be necessary delete?
async function broadcastPlaybackState() {
    const state = await bridge.getPlaybackState();
    if (state)
        io.emit('trackUpdate', state);
    return state;
}
// Get initial state on page load todo may not be used delete?
app.get('/api/playback', async (req, res) => {
    try {
        const state = await bridge.getPlaybackState();
        res.json(state);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/queue', async (req, res) => {
    try {
        const queue = await bridge.getQueue();
        res.json(queue);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/devices', async (req, res) => {
    try {
        const devices = await bridge.getDevices();
        res.json(devices);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/devices/connect', async (req, res) => {
    try {
        let { deviceId } = req.body;
        if (!deviceId)
            deviceId = config.lastDeviceId;
        const connected = await bridge.connectDevice(deviceId);
        config.lastDeviceId = deviceId;
        if (connected)
            saveConfig(config);
        res.json({ connected });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/playback/volume', async (req, res) => {
    try {
        const { volume } = req.body;
        await bridge.setVolume(volume);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/playback/play', async (req, res) => {
    try {
        await bridge.play();
        await broadcastPlaybackState();
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/playback/:uri/play', async (req, res) => {
    try {
        const uri = req.params.uri;
        await bridge.play(uri);
        res.json({ uri });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/playback/pause', async (req, res) => {
    try {
        await bridge.pause();
        await broadcastPlaybackState();
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/playback/next', async (req, res) => {
    try {
        await bridge.skipNext();
        // Small delay to let Spotify update before querying
        await new Promise(resolve => setTimeout(resolve, 500));
        await broadcastPlaybackState();
        res.json({ success: true });
    }
    catch (e) {
        console.log(e);
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/playback/previous', async (req, res) => {
    try {
        await bridge.skipPrevious();
        await new Promise(resolve => setTimeout(resolve, 500));
        await broadcastPlaybackState();
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/playback/seek', async (req, res) => {
    try {
        const { positionMs } = req.body;
        await bridge.seekToPosition(positionMs);
        await broadcastPlaybackState();
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ---------- THEMES ----------
app.get('/api/themes', async (req, res) => {
    try {
        const themes = bridge.getThemes();
        res.json(themes);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/themes', async (req, res) => {
    try {
        const { name, cloneFromThemeId } = req.body;
        const id = bridge.createTheme(name, cloneFromThemeId);
        res.json({ id });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.put('/api/themes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name } = req.body;
        bridge.renameTheme(id, name);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.delete('/api/themes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        bridge.deleteTheme(id);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/themes/:id/songs', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { search, sortBy, order } = req.query;
        const songs = bridge.getThemeSongs(id, search, sortBy, order);
        res.json(songs);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/themes/:id/play', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const uri = await bridge.updateThemedPlaylist(id);
        await bridge.play(uri);
        res.json({ uri });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ---------- RATINGS ----------
app.post('/api/ratings', async (req, res) => {
    try {
        const { spotifyId, themeId, delta } = req.body;
        const newRating = await bridge.rateSong(spotifyId, themeId, delta);
        res.json({ rating: newRating });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/songs/:id/ratings', async (req, res) => {
    try {
        const id = req.params.id;
        const ratings = bridge.getSongRatings(id);
        res.json(ratings);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ---------- PLAYLISTS ----------
app.get('/api/playlists', async (req, res) => {
    try {
        const playlists = bridge.getPlaylists();
        res.json(playlists);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/playlists', async (req, res) => {
    try {
        const { name, themeId, ratingMin, ratingMax, sort, limitCount, isDynamic } = req.body;
        const id = await bridge.createSavedPlaylist(name, themeId, ratingMin, ratingMax, sort, limitCount, isDynamic);
        res.json({ id });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.put('/api/playlists/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, isDynamic, ratingMin, ratingMax, sort, limitCount } = req.body;
        bridge.updateSavedPlaylist(id, name, isDynamic, ratingMin, ratingMax, sort, limitCount);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.delete('/api/playlists/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        bridge.deleteSavedPlaylist(id);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/playlists/:id/songs', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const songs = bridge.getSavedPlaylistSongs(id);
        res.json(songs);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/playlists/:id/play', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const uri = await bridge.loadSavedPlaylist(id);
        await bridge.play(uri);
        res.json({ uri });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/playlists/preview', async (req, res) => {
    try {
        const { themeId, ratingMin, ratingMax, sort, limitCount } = req.query;
        if (!themeId)
            return res.status(400).json({ error: 'themeId is required' });
        const songs = bridge.previewPlaylistCriteria(parseInt(themeId), ratingMin ? parseInt(ratingMin) : null, ratingMax ? parseInt(ratingMax) : null, sort ?? 'top', limitCount ? parseInt(limitCount) : null);
        res.json(songs);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ---------- THEMED PLAYLIST ----------
app.get('/api/playlists/themed/songs', async (req, res) => {
    try {
        const songs = bridge.getThemedPlaylistSongs();
        res.json(songs);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/playlists/themed/update', async (req, res) => {
    try {
        const { themeId, ratingMin, ratingMax, sort, limitCount } = req.body;
        if (!themeId)
            return res.status(400).json({ error: 'themeId is required' });
        const uri = await bridge.updateThemedPlaylist(themeId, ratingMin ?? null, ratingMax ?? null, sort ?? 'top', limitCount ?? null);
        res.json({ uri });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ---------- SETTINGS ----------
app.get('/api/settings', (req, res) => {
    try {
        const settings = bridge.getSettingsData();
        const networkInterfaces = os.networkInterfaces();
        const localIp = Object.values(networkInterfaces)
            .flat()
            .find((i) => i?.family === 'IPv4' && !i.internal)?.address ?? 'unknown';
        res.json({ ...settings, localIp });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/settings', (req, res) => {
    try {
        const { spotifyClientId, skipPenalty, replayBonus } = req.body;
        saveConfig({ spotifyClientId, skipPenalty, replayBonus });
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/settings/regenerate-token', (req, res) => {
    try {
        const secretToken = crypto.randomBytes(32).toString('hex');
        saveConfig({ secretToken });
        res.json({ secretToken });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/settings/themed-playlist', async (req, res) => {
    try {
        const { uri } = req.body;
        await bridge.setThemedPlaylist(uri);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/settings/master-playlist', async (req, res) => {
    try {
        const { uri } = req.body;
        const imported = await bridge.setMasterPlaylist(uri);
        res.json({ success: true, imported });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.post('/api/external-access/toggle', (req, res) => {
    try {
        externalAccessEnabled = !externalAccessEnabled;
        io.emit('externalAccessUpdate', externalAccessEnabled);
        res.json({ externalAccessEnabled });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Fallback routes
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
});
// Main route
app.get('/{*path}', (req, res) => {
    res.sendFile('index.html', { root: 'dist/frontend' });
});
// Start server
httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`);
});
