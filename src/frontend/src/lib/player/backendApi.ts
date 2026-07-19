// This file contains the functions that fetch from the backend API and is importable by just about everything (lowest layer)

import type { Theme, Playlist, SongWithRating } from '../../../../types/types';

// ---------- PLAYER ----------

async function loadPlayerState(queueChanged: boolean = false) {
    const res = await fetch('/api/player');
    if (!res.ok) {
        // Try to connect a device
        const deviceRes = await fetch('/api/player/devices/connect', { method: 'POST' });
        const { connected } = await deviceRes.json();
        if (connected) {
            // Wait a moment for transfer to complete then retry
            setTimeout(() => loadPlayerState(queueChanged), 1000);
        }
        return;
    }
    return res.json();
}

async function loadQueue() {
    const res = await fetch('/api/player/queue');
    return res.json();
}

async function loadDevices() {
    const res = await fetch('/api/player/devices');
    return await res.json() ?? [];
}

async function connectDevice(deviceId: string) {
    await fetch('/api/player/devices/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId })
    });
}

// todo: rip this and use local volume from the audio context as it's more flexible for smooth playback
async function setVolume(v: number) {
    await fetch('/api/player/volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume: v })
    });
}

async function play(context_uri?: string) {
    await fetch(`/api/player/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: context_uri ?? null })
    });
}

async function pause() {
    await fetch('/api/player/pause', { method: 'POST' });
}

async function skipNext() {
    await fetch('/api/player/next', { method: 'POST' });
}

// todo: maybe add a clause that makes it so this restarts songs before going to previous atm it just goes to the previous track no matter what
async function skipPrevious() {
    await fetch('/api/player/previous', { method: 'POST' });
}

async function seek(positionMs: number) {
    await fetch('/api/player/seek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionMs })
    });
}

// ---------- THEMES ----------

async function getThemes(): Promise<Theme[]> {
    const res = await fetch('/api/themes');
    return await res.json();
}

async function getThemeSongs(themeId: number, sortBy: string, sortOrder: string, search?: string): Promise<SongWithRating[]> {
    const params = new URLSearchParams({ sortBy, order: sortOrder });
    if (search) params.set('search', search);
    const res = await fetch(`/api/themes/${themeId}/songs?${params}`);
    return await res.json();
}

async function createTheme(name: string, cloneFromThemeId?: number | null) {
    await fetch('/api/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, cloneFromThemeId: cloneFromThemeId ?? undefined })
    });
}

async function deleteTheme(id: number) {
    await fetch(`/api/themes/${id}`, { method: 'DELETE' });
}

async function playTheme(id: number) {
    await fetch(`/api/themes/${id}/play`, { method: 'POST' });
}

// ---------- PLAYLISTS ----------

async function getPlaylists(): Promise<Playlist[]> {
    const res = await fetch('/api/playlists');
    return await res.json();
}

async function getThemedPlaylistSongs(): Promise<SongWithRating[]> {
    const res = await fetch('/api/playlists/themed/songs');
    return await res.json();
}

async function getPlaylistSongs(id: number): Promise<SongWithRating[]> {
    const res = await fetch(`/api/playlists/${id}/songs`);
    return await res.json();
}

interface BuilderParams {
    themeId: number;
    sort: string;
    ratingMin?: number | null;
    ratingMax?: number | null;
    limitCount?: number | null;
}

async function getBuilderPreview(params: BuilderParams): Promise<SongWithRating[]> {
    const query = new URLSearchParams();
    query.set('themeId', String(params.themeId));
    query.set('sort', params.sort);
    if (params.ratingMin != null) query.set('ratingMin', String(params.ratingMin));
    if (params.ratingMax != null) query.set('ratingMax', String(params.ratingMax));
    if (params.limitCount != null) query.set('limitCount', String(params.limitCount));
    const res = await fetch(`/api/playlists/preview?${query}`);
    return await res.json();
}

async function updateAndPlayThemedPlaylist(params: BuilderParams): Promise<string> {
    const res = await fetch('/api/playlists/themed/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    });
    const { uri } = await res.json();
    return uri;
}

async function playPlaylist(id: number) {
    await fetch(`/api/playlists/${id}/play`, { method: 'POST' });
}

interface SavePlaylistParams extends BuilderParams {
    name: string;
    isDynamic: boolean;
}

async function savePlaylist(params: SavePlaylistParams) {
    await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    });
}

async function deletePlaylist(id: number) {
    await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
}

// ---------- RATINGS ----------

async function getRatingsForTrack(trackId: string): Promise<{ theme_id: number, rating: number }[]> {
    const res = await fetch(`/api/themes/songs/ratings?id=${trackId}`);
    return await res.json();
}

async function rateTrack(spotifyId: string, themeId: number, delta: number): Promise<number> {
    const res = await fetch('/api/themes/songs/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotifyId, themeId, delta })
    });
    const { rating } = await res.json();
    return rating;
}

// ---------- SETTINGS ----------

interface SettingsData {
    spotifyClientId: string;
    secretToken: string;
    skipPenalty: number;
    replayBonus: number;
    autoMin: number;
    autoMax: number;
    autoRate: boolean;
    themedPlaylistUri: string | null;
    masterPlaylistUri: string | null;
    localIp: string;
}

async function getSettings(): Promise<SettingsData> {
    const res = await fetch('/api/settings');
    return await res.json();
}

async function getExternalAccess(): Promise<boolean> {
    const res = await fetch('/api/external-access');
    const { externalAccessEnabled } = await res.json();
    return externalAccessEnabled;
}

async function saveSettings(data: Pick<SettingsData, 'spotifyClientId' | 'skipPenalty' | 'replayBonus' | 'autoMin' | 'autoMax' | 'autoRate'>) {
    await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
}

async function saveThemedPlaylistUri(uri: string) {
    await fetch('/api/settings/themed-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri })
    });
}

async function saveMasterPlaylistUri(uri: string): Promise<number> {
    const res = await fetch('/api/settings/master-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri })
    });
    const { imported } = await res.json();
    return imported;
}

async function regenerateToken(): Promise<string> {
    const res = await fetch('/api/settings/regenerate-token', { method: 'POST' });
    const { secretToken } = await res.json();
    return secretToken;
}

async function toggleExternalAccess(): Promise<boolean> {
    const res = await fetch('/api/external-access/toggle', { method: 'POST' });
    const { externalAccessEnabled } = await res.json();
    return externalAccessEnabled;
}

export default {
    loadPlayerState,
    loadQueue,
    loadDevices,
    connectDevice,
    setVolume,
    play,
    pause,
    skipNext,
    skipPrevious,
    seek,
    getThemes,
    getThemeSongs,
    createTheme,
    deleteTheme,
    playTheme,
    getPlaylists,
    getThemedPlaylistSongs,
    getPlaylistSongs,
    getBuilderPreview,
    updateAndPlayThemedPlaylist,
    playPlaylist,
    savePlaylist,
    deletePlaylist,
    getRatingsForTrack,
    rateTrack,
    getSettings,
    getExternalAccess,
    saveSettings,
    saveThemedPlaylistUri,
    saveMasterPlaylistUri,
    regenerateToken,
    toggleExternalAccess
};