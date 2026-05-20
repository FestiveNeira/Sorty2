import { error } from 'console';
import { getSpotifyTokens, saveSpotifyTokens, isTokenExpired } from '../database/database.js';
import config from '../utils/appconfig.js';

const SPOTIFY_API = 'https://api.spotify.com/v1';

// ---------- TOKEN MANAGEMENT ----------

async function refreshToken() {
    const tokens = getSpotifyTokens();
    if (!tokens) throw new Error('No Spotify tokens found, please authenticate');

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
    saveSpotifyTokens(
        data.access_token,
        data.refresh_token ?? tokens.refresh_token,
        data.expires_in
    );
    return data.access_token;
}

async function getAccessToken(): Promise<string> {
    if (isTokenExpired()) return await refreshToken();
    return getSpotifyTokens()!.access_token;
}

// General function to build SpotifyAPI requests and recieve formatted responses. isvoid determines if the request expects a response
async function spotifyFetch(endpoint: string, options: RequestInit = {}) {
    const token = await getAccessToken();

    const res = await fetch(`${SPOTIFY_API}${endpoint}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        }
    });

    // Error
    if (!res.ok) throw (await res.json()).error;
    if (res.status == 429) throw new Error(`${res.status} - Spotify Rate Limit: ${res.statusText}`);
    // Return
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return res.status;
    return await res.json();
}

// ---------- USER ----------

export async function getUser() {
    return spotifyFetch('/me');
}

// ---------- PLAYBACK ----------

export async function getPlaybackState() {
    try {
        return await spotifyFetch('/me/player');
    } catch {
        return null;
    }
}

export async function getQueue() {
    return spotifyFetch('/me/player/queue');
}

export async function getDevices() {
    return spotifyFetch('/me/player/devices');
}

export async function transferPlayback(deviceId: string): Promise<number> {
    return spotifyFetch('/me/player', {
        method: 'PUT',
        body: JSON.stringify({ device_ids: [deviceId] })
    });
}

export async function setVolume(volumePercent: number) {
    return spotifyFetch(`/me/player/volume?volume_percent=${volumePercent}`, { method: 'PUT' });
}

export async function play(contextUri?: string, uris?: string[]) {
    const body: any = {};
    if (contextUri) body.context_uri = contextUri;
    if (uris) body.uris = uris;
    return spotifyFetch('/me/player/play', {
        method: 'PUT',
        body: JSON.stringify(body)
    });
}

export async function pause() {
    return spotifyFetch('/me/player/pause', { method: 'PUT' });
}

export async function skipNext() {
    return spotifyFetch('/me/player/next', { method: 'POST' });
}

export async function skipPrevious() {
    return spotifyFetch('/me/player/previous', { method: 'POST' });
}

export async function seekToPosition(positionMs: number) {
    return spotifyFetch(`/me/player/seek?position_ms=${positionMs}`, { method: 'PUT' });
}

export async function getCurrentTrack() {
    return spotifyFetch('/me/player/currently-playing');
}

// ---------- PLAYLISTS ----------

export async function getUserPlaylists() {
    return spotifyFetch('/me/playlists?limit=50');
}

export async function getPlaylist(playlistId: string) {
    return spotifyFetch(`/playlists/${playlistId}`);
}

export async function createPlaylist(userId: string, name: string, description: string = '') {
    return spotifyFetch(`/users/${userId}/playlists`, {
        method: 'POST',
        body: JSON.stringify({
            name,
            description,
            public: false
        })
    });
}

export async function updatePlaylistDetails(playlistId: string, name: string, description: string = '') {
    return spotifyFetch(`/playlists/${playlistId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description })
    });
}

export async function replacePlaylistTracks(playlistId: string, uris: string[]) {
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

export async function addTracksToPlaylist(playlistId: string, uris: string[]) {
    for (let i = 0; i < uris.length; i += 100) {
        await spotifyFetch(`/playlists/${playlistId}/tracks`, {
            method: 'POST',
            body: JSON.stringify({ uris: uris.slice(i, i + 100) })
        });
    }
}

export async function removeTracksFromPlaylist(playlistId: string, uris: string[]) {
    return spotifyFetch(`/playlists/${playlistId}/tracks`, {
        method: 'DELETE',
        body: JSON.stringify({
            tracks: uris.map(uri => ({ uri }))
        })
    });
}

export async function getPlaylistTracks(playlistId: string) {
    let tracks: any[] = [];
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

export async function getTrack(trackId: string) {
    return spotifyFetch(`/tracks/${trackId}`);
}

export async function getTracks(trackIds: string[]) {
    // Spotify allows max 50 per request
    const results: any[] = [];
    for (let i = 0; i < trackIds.length; i += 50) {
        const batch = trackIds.slice(i, i + 50);
        const data = await spotifyFetch(`/tracks?ids=${batch.join(',')}`);
        results.push(...data.tracks);
    }
    return results;
}