import { getSpotifyTokens, saveSpotifyTokens, isTokenExpired } from '../database/database.js';
import { loadConfig } from './appconfig.js';
const config = loadConfig();
const SPOTIFY_API = 'https://api.spotify.com/v1';
// ---------- TOKEN MANAGEMENT ----------
async function refreshToken() {
    const tokens = getSpotifyTokens();
    if (!tokens)
        throw new Error('No Spotify tokens found, please authenticate');
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: config.spotifyClientId
    });
    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });
    const data = await res.json();
    saveSpotifyTokens(data.access_token, data.refresh_token ?? tokens.refresh_token, data.expires_in);
    return data.access_token;
}
async function getAccessToken() {
    if (isTokenExpired())
        return await refreshToken();
    return getSpotifyTokens().access_token;
}
// General function to build SpotifyAPI requests and recieve formatted responses. isvoid determines if the request expects a response
async function spotifyFetch(endpoint, options = {}, isvoid = false) {
    const token = await getAccessToken();
    const res = await fetch(`${SPOTIFY_API}${endpoint}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
    if (res.status == 429)
        throw new Error(`${res.status} - Spotify Rate Limit: ${res.statusText}`);
    if (!res.ok)
        throw new Error(`Spotify API error: ${res.status} ${res.statusText}`);
    if (!isvoid)
        return res.json();
    return;
}
// ---------- USER ----------
export async function getUser() {
    return spotifyFetch('/me');
}
// ---------- PLAYBACK ----------
export async function getPlaybackState() {
    try {
        return await spotifyFetch('/me/player');
    }
    catch {
        return null;
    }
}
export async function getQueue() {
    return spotifyFetch('/me/player/queue');
}
export async function getDevices() {
    return spotifyFetch('/me/player/devices');
}
export async function transferPlayback(deviceId, startPlay = false) {
    return spotifyFetch('/me/player', {
        method: 'PUT',
        body: JSON.stringify({ device_ids: [deviceId], play: startPlay })
    });
}
export async function setVolume(volumePercent) {
    return spotifyFetch(`/me/player/volume?volume_percent=${volumePercent}`, { method: 'PUT' });
}
export async function play(contextUri, uris) {
    const body = {};
    if (contextUri)
        body.context_uri = contextUri;
    if (uris)
        body.uris = uris;
    return spotifyFetch('/me/player/play', {
        method: 'PUT',
        body: JSON.stringify(body)
    }, true);
}
export async function pause() {
    return spotifyFetch('/me/player/pause', { method: 'PUT' }, true);
}
export async function skipNext() {
    return spotifyFetch('/me/player/next', { method: 'POST' }, true);
}
export async function skipPrevious() {
    return spotifyFetch('/me/player/previous', { method: 'POST' }, true);
}
export async function seekToPosition(positionMs) {
    return spotifyFetch(`/me/player/seek?position_ms=${positionMs}`, { method: 'PUT' }, true);
}
export async function getCurrentTrack() {
    return spotifyFetch('/me/player/currently-playing');
}
// ---------- PLAYLISTS ----------
export async function getUserPlaylists() {
    return spotifyFetch('/me/playlists?limit=50');
}
export async function getPlaylist(playlistId) {
    return spotifyFetch(`/playlists/${playlistId}`);
}
export async function createPlaylist(userId, name, description = '') {
    return spotifyFetch(`/users/${userId}/playlists`, {
        method: 'POST',
        body: JSON.stringify({
            name,
            description,
            public: false
        })
    });
}
export async function updatePlaylistDetails(playlistId, name, description = '') {
    return spotifyFetch(`/playlists/${playlistId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description })
    });
}
export async function replacePlaylistTracks(playlistId, uris) {
    // Spotify only allows 100 tracks per request
    // First clear the playlist then add in batches
    await spotifyFetch(`/playlists/${playlistId}/tracks`, {
        method: 'PUT',
        body: JSON.stringify({ uris: uris.slice(0, 100) })
    });
    // Add remaining tracks in batches of 100
    for (let i = 100; i < uris.length; i += 100) {
        await spotifyFetch(`/playlists/${playlistId}/tracks`, {
            method: 'POST',
            body: JSON.stringify({ uris: uris.slice(i, i + 100) })
        });
    }
}
export async function addTracksToPlaylist(playlistId, uris) {
    for (let i = 0; i < uris.length; i += 100) {
        await spotifyFetch(`/playlists/${playlistId}/tracks`, {
            method: 'POST',
            body: JSON.stringify({ uris: uris.slice(i, i + 100) })
        });
    }
}
export async function removeTracksFromPlaylist(playlistId, uris) {
    return spotifyFetch(`/playlists/${playlistId}/tracks`, {
        method: 'DELETE',
        body: JSON.stringify({
            tracks: uris.map(uri => ({ uri }))
        })
    });
}
export async function getPlaylistTracks(playlistId) {
    let tracks = [];
    let url = `/playlists/${playlistId}/tracks?limit=100`;
    // Handle pagination since playlists can have more than 100 songs
    while (url) {
        const data = await spotifyFetch(url);
        tracks = [...tracks, ...data.items];
        url = data.next ? data.next.replace(SPOTIFY_API, '') : null;
    }
    return tracks;
}
// ---------- TRACKS ----------
export async function getTrack(trackId) {
    return spotifyFetch(`/tracks/${trackId}`);
}
export async function getTracks(trackIds) {
    // Spotify allows max 50 per request
    const results = [];
    for (let i = 0; i < trackIds.length; i += 50) {
        const batch = trackIds.slice(i, i + 50);
        const data = await spotifyFetch(`/tracks?ids=${batch.join(',')}`);
        results.push(...data.tracks);
    }
    return results;
}
