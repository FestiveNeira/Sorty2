import * as spotify from './spotify.js';
import * as db from '../database/database.js';
import { loadConfig } from '../utils/appconfig.js';
// ---------- SETUP ----------
export function initDatabase() {
    db.initDatabase();
}
export async function ensureThemedPlaylist() {
    const existing = db.getThemedPlaylist();
    if (existing)
        return existing;
    const user = await spotify.getUser();
    const playlist = await spotify.createPlaylist(user.id, 'Sorty — Themed Playlist', 'Managed by Sorty');
    db.createThemedPlaylist(playlist.id);
    return db.getThemedPlaylist();
}
// ---------- PLAYBACK ----------
export async function getPlaybackState() {
    const state = await spotify.getPlaybackState();
    if (!state?.item)
        return null;
    return state;
}
export async function getQueue() {
    const data = await spotify.getQueue();
    return {
        currentlyPlaying: data?.currently_playing ?? null,
        queue: data?.queue ?? []
    };
}
export async function getDevices() {
    const data = await spotify.getDevices();
    return data?.devices ?? [];
}
export async function connectDevice(id) {
    const devices = await getDevices();
    if (devices.length === 0)
        return false;
    const preferred = devices.find((d) => d.id === id);
    const device = preferred ?? devices[0];
    await spotify.transferPlayback(device.id);
    return true;
}
export async function setVolume(volumePercent) {
    return spotify.setVolume(volumePercent);
}
export async function loadSavedPlaylist(playlistId) {
    const playlist = db.getPlaylists().find((p) => p.id === playlistId);
    if (!playlist)
        throw new Error('Playlist not found');
    let songs;
    if (playlist.is_dynamic) {
        songs = db.getPlaylistSongsDynamic(playlist.theme_id, playlist.rating_min, playlist.rating_max, playlist.sort, playlist.limit_count);
    }
    else {
        songs = db.getPlaylistSongs(playlistId);
    }
    const themedPlaylist = db.getThemedPlaylist();
    if (!themedPlaylist?.spotify_playlist_id)
        throw new Error('No themed playlist found');
    const uris = songs.map((s) => `spotify:track:${s.spotify_id}`);
    await spotify.replacePlaylistTracks(themedPlaylist.spotify_playlist_id, uris);
    return `spotify:playlist:${themedPlaylist.spotify_playlist_id}`;
}
/*
export async function playSavedPlaylist(playlistId: number) {
const playlist = db.getPlaylists().find((p: any) => p.id === playlistId);
if (!playlist) throw new Error('Playlist not found');

let songs: any[];

if (playlist.is_dynamic) {
    songs = db.getPlaylistSongsDynamic(
        playlist.theme_id,
        playlist.rating_min,
        playlist.rating_max,
        playlist.sort,
        playlist.limit_count
    );
} else {
    songs = db.getPlaylistSongs(playlistId);
}

const uris = songs.map((s: any) => `spotify:track:${s.spotify_id}`);
await spotify.replacePlaylistTracks(db.getThemedPlaylist()!.spotify_playlist_id, uris);
await spotify.play(`spotify:playlist:${db.getThemedPlaylist()!.spotify_playlist_id}`);
}
//*/
// Bottom bar controller functions
export async function play(contextUri, uris) {
    await spotify.play(contextUri, uris);
}
export async function pause() {
    await spotify.pause();
}
export async function skipNext() {
    await spotify.skipNext();
}
export async function skipPrevious() {
    await spotify.skipPrevious();
}
export async function seekToPosition(positionMs) {
    await spotify.seekToPosition(positionMs);
}
// ---------- THEMED PLAYLIST ----------
export async function checkThemedPlaylistMembership(spotifyId, themeId) {
    const themedPlaylist = db.getThemedPlaylist();
    if (!themedPlaylist?.spotify_playlist_id)
        return;
    const rating = db.getRating(spotifyId, themeId);
    const currentSongs = db.getPlaylistSongs(themedPlaylist.id);
    const isInPlaylist = currentSongs.some((s) => s.spotify_id === spotifyId);
    const shouldBeInPlaylist = rating && rating.rating > 0;
    if (shouldBeInPlaylist && !isInPlaylist) {
        await spotify.addTracksToPlaylist(themedPlaylist.spotify_playlist_id, [`spotify:track:${spotifyId}`]);
        db.setPlaylistSongs(themedPlaylist.id, [
            ...currentSongs.map((s) => s.spotify_id),
            spotifyId
        ]);
    }
    else if (!shouldBeInPlaylist && isInPlaylist) {
        await spotify.removeTracksFromPlaylist(themedPlaylist.spotify_playlist_id, [`spotify:track:${spotifyId}`]);
        db.setPlaylistSongs(themedPlaylist.id, currentSongs
            .filter((s) => s.spotify_id !== spotifyId)
            .map((s) => s.spotify_id));
    }
}
export function previewPlaylistCriteria(themeId, ratingMin, ratingMax, sort, limitCount) {
    return db.getPlaylistSongsDynamic(themeId, ratingMin, ratingMax, sort, limitCount);
}
export function getThemedPlaylistSongs() {
    const themedPlaylist = db.getThemedPlaylist();
    if (!themedPlaylist)
        return [];
    return db.getPlaylistSongs(themedPlaylist.id);
}
export async function updateThemedPlaylist(themeId, ratingMin = 1, ratingMax = null, sort = 'top', limitCount = null) {
    const songs = db.getPlaylistSongsDynamic(themeId, ratingMin, ratingMax, sort, limitCount);
    const themedPlaylist = await ensureThemedPlaylist();
    const uris = songs.map((s) => `spotify:track:${s.spotify_id}`);
    await spotify.replacePlaylistTracks(themedPlaylist.spotify_playlist_id, uris);
    db.setPlaylistSongs(themedPlaylist.id, songs.map((s) => s.spotify_id));
    return `spotify:playlist:${themedPlaylist.spotify_playlist_id}`;
}
// ---------- RATING ----------
export async function rateSong(spotifyId, themeId, delta) {
    const existing = db.getSong(spotifyId);
    if (!existing) {
        const track = await spotify.getTrack(spotifyId);
        db.upsertSong(spotifyId, track.name, track.artists[0].name);
    }
    const current = db.getRating(spotifyId, themeId);
    const currentRating = current?.rating ?? 0;
    const newRating = currentRating + delta;
    db.setRating(spotifyId, themeId, newRating);
    await checkThemedPlaylistMembership(spotifyId, themeId);
    return newRating;
}
export function getSongRatings(spotifyId) {
    return db.getSongRatings(spotifyId);
}
// ---------- THEMES ----------
export function getThemes() {
    return db.getThemes();
}
export function createTheme(name, cloneFromThemeId) {
    return db.createTheme(name, cloneFromThemeId);
}
export function renameTheme(id, name) {
    db.renameTheme(id, name);
}
export function deleteTheme(id) {
    db.deleteTheme(id);
}
export function getThemeSongs(themeId, search, sortBy, order) {
    return db.getThemeSongs(themeId, search, sortBy, order);
}
// ---------- PLAYLISTS ----------
export function getPlaylists() {
    return db.getPlaylists();
}
export async function createSavedPlaylist(name, themeId, ratingMin, ratingMax, sort, limitCount, isDynamic) {
    const playlistId = db.createPlaylist(name, themeId, ratingMin, ratingMax, sort, limitCount, isDynamic);
    if (!isDynamic) {
        const songs = db.getPlaylistSongsDynamic(themeId, ratingMin, ratingMax, sort, limitCount);
        db.setPlaylistSongs(Number(playlistId), songs.map((s) => s.spotify_id));
    }
    return Number(playlistId);
}
export function updateSavedPlaylist(id, name, isDynamic, ratingMin, ratingMax, sort, limitCount) {
    db.updatePlaylist(id, name, isDynamic, ratingMin, ratingMax, sort, limitCount);
    if (!isDynamic) {
        const playlist = db.getPlaylists().find((p) => p.id === id);
        if (!playlist)
            throw new Error('Playlist not found');
        const songs = db.getPlaylistSongsDynamic(playlist.theme_id, ratingMin, ratingMax, sort, limitCount);
        db.setPlaylistSongs(id, songs.map((s) => s.spotify_id));
    }
}
export function deleteSavedPlaylist(id) {
    db.deletePlaylist(id);
}
export function getSavedPlaylistSongs(playlistId) {
    const playlist = db.getPlaylists().find((p) => p.id === playlistId);
    if (!playlist)
        throw new Error('Playlist not found');
    if (playlist.is_dynamic) {
        return db.getPlaylistSongsDynamic(playlist.theme_id, playlist.rating_min, playlist.rating_max, playlist.sort, playlist.limit_count);
    }
    return db.getPlaylistSongs(playlistId);
}
// ---------- SETTINGS ----------
export async function setThemedPlaylist(uri) {
    const playlistId = uri.split(':').pop();
    const playlist = await spotify.getPlaylist(playlistId);
    if (!playlist)
        throw new Error('Playlist not found');
    const existing = db.getThemedPlaylist();
    if (existing) {
        db.updateThemedPlaylistSpotifyId(playlistId);
    }
    else {
        db.createThemedPlaylist(playlistId);
    }
}
export async function setMasterPlaylist(uri) {
    const playlistId = uri.split(':').pop();
    const playlist = await spotify.getPlaylist(playlistId);
    if (!playlist)
        throw new Error('Playlist not found');
    db.setMasterPlaylist(playlistId);
    const imported = await importPlaylistSongs(playlistId);
    return imported;
}
export async function importPlaylistSongs(playlistId) {
    const tracks = await spotify.getPlaylistTracks(playlistId);
    let imported = 0;
    for (const item of tracks) {
        if (!item.track || item.track.type !== 'track')
            continue;
        const track = item.track;
        const existing = db.getSong(track.id);
        if (!existing) {
            db.upsertSong(track.id, track.name, track.artists[0].name);
            // Add rating 0 for default theme
            const defaultTheme = db.getDefaultTheme();
            if (defaultTheme) {
                db.setRating(track.id, defaultTheme.id, 0);
            }
            imported++;
        }
    }
    return imported;
}
export function getSettingsData() {
    const config = loadConfig();
    const themedPlaylist = db.getThemedPlaylist();
    const masterPlaylist = db.getMasterPlaylist();
    return {
        spotifyClientId: config.spotifyClientId,
        secretToken: config.secretToken,
        skipPenalty: config.skipPenalty,
        replayBonus: config.replayBonus,
        themedPlaylistUri: themedPlaylist?.spotify_playlist_id
            ? `spotify:playlist:${themedPlaylist.spotify_playlist_id}`
            : null,
        masterPlaylistUri: masterPlaylist?.spotify_playlist_id
            ? `spotify:playlist:${masterPlaylist.spotify_playlist_id}`
            : null,
    };
}
// ---------- TOKENS ----------
export function getSpotifyTokens() {
    return db.getSpotifyTokens();
}
export function saveSpotifyTokens(accessToken, refreshToken, expiresIn) {
    db.saveSpotifyTokens(accessToken, refreshToken, expiresIn);
}
export function isTokenExpired() {
    return db.isTokenExpired();
}
