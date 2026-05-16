import * as spotify from './spotify.js';
import * as db from '../database/database.js';
import { loadConfig } from '../utils/appconfig.js'
import type { Song, Theme, Rating, Playlist, SpotifyTokens, SongWithPosition, SongWithRating } from '../types/types.js';

// ---------- SETUP ----------

export function initDatabase() {
    db.initDatabase();
}

export async function ensureThemedPlaylist(): Promise<Playlist> {
    const existing = db.getThemedPlaylist();
    if (existing) return existing;

    const user = await spotify.getUser();
    const playlist = await spotify.createPlaylist(
        user.id,
        'Sorty — Themed Playlist',
        'Managed by Sorty'
    );

    db.createThemedPlaylist(playlist.id);
    return db.getThemedPlaylist()!;
}

// ---------- PLAYBACK ----------

export async function getPlaybackState() {
    const state = await spotify.getPlaybackState();
    if (!state?.item) return null;
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

export async function connectDevice(id: string): Promise<boolean> {
    const devices = await getDevices();
    if (devices.length === 0) return false;

    const preferred = devices.find((d: any) => d.id === id);
    const device = preferred ?? devices[0];

    await spotify.transferPlayback(device.id);
    return true;
}

export async function setVolume(volumePercent: number) {
    return spotify.setVolume(volumePercent);
}

export async function loadSavedPlaylist(playlistId: number): Promise<string> {
    const playlist = db.getPlaylists().find((p: Playlist) => p.id === playlistId);
    if (!playlist) throw new Error('Playlist not found');

    let songs: SongWithRating[] | SongWithPosition[];

    if (playlist.is_dynamic) {
        songs = db.getPlaylistSongsDynamic(
            playlist.theme_id,
            playlist.rating_min,
            playlist.rating_max,
            playlist.sort,
            playlist.limit_count
        ) as SongWithRating[];
    } else {
        songs = db.getPlaylistSongs(playlistId) as SongWithPosition[];
    }

    const themedPlaylist = db.getThemedPlaylist();
    if (!themedPlaylist?.spotify_playlist_id) throw new Error('No themed playlist found');

    const uris = songs.map((s: Song) => `spotify:track:${s.spotify_id}`);
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

export async function play(contextUri?: string, uris?: string[]) {
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

export async function seekToPosition(positionMs: number) {
    await spotify.seekToPosition(positionMs);
}

// ---------- THEMED PLAYLIST ----------

export async function checkThemedPlaylistMembership(spotifyId: string, themeId: number): Promise<void> {
    const themedPlaylist = db.getThemedPlaylist();
    if (!themedPlaylist?.spotify_playlist_id) return;

    const rating = db.getRating(spotifyId, themeId) as Rating | undefined;
    const currentSongs = db.getPlaylistSongs(themedPlaylist.id) as SongWithPosition[];
    const isInPlaylist = currentSongs.some((s: SongWithPosition) => s.spotify_id === spotifyId);
    const shouldBeInPlaylist = rating && rating.rating > 0;

    if (shouldBeInPlaylist && !isInPlaylist) {
        await spotify.addTracksToPlaylist(
            themedPlaylist.spotify_playlist_id,
            [`spotify:track:${spotifyId}`]
        );
        db.setPlaylistSongs(themedPlaylist.id, [
            ...currentSongs.map((s: SongWithPosition) => s.spotify_id),
            spotifyId
        ]);
    } else if (!shouldBeInPlaylist && isInPlaylist) {
        await spotify.removeTracksFromPlaylist(
            themedPlaylist.spotify_playlist_id,
            [`spotify:track:${spotifyId}`]
        );
        db.setPlaylistSongs(
            themedPlaylist.id,
            currentSongs
                .filter((s: SongWithPosition) => s.spotify_id !== spotifyId)
                .map((s: SongWithPosition) => s.spotify_id)
        );
    }
}

export function previewPlaylistCriteria(
    themeId: number,
    ratingMin: number | null,
    ratingMax: number | null,
    sort: string,
    limitCount: number | null
): SongWithRating[] {
    return db.getPlaylistSongsDynamic(themeId, ratingMin, ratingMax, sort, limitCount);
}

export function getThemedPlaylistSongs(): SongWithPosition[] {
    const themedPlaylist = db.getThemedPlaylist();
    if (!themedPlaylist) return [];
    return db.getPlaylistSongs(themedPlaylist.id);
}

export async function updateThemedPlaylist(
    themeId: number,
    ratingMin: number | null = 1,
    ratingMax: number | null = null,
    sort: string = 'top',
    limitCount: number | null = null
): Promise<string> {
    const songs = db.getPlaylistSongsDynamic(themeId, ratingMin, ratingMax, sort, limitCount);
    const themedPlaylist = await ensureThemedPlaylist();
    const uris = songs.map((s: Song) => `spotify:track:${s.spotify_id}`);
    await spotify.replacePlaylistTracks(themedPlaylist.spotify_playlist_id!, uris);
    db.setPlaylistSongs(themedPlaylist.id, songs.map((s: Song) => s.spotify_id));
    return `spotify:playlist:${themedPlaylist.spotify_playlist_id}`;
}

// ---------- RATING ----------

export async function rateSong(spotifyId: string, themeId: number, delta: number): Promise<number> {
    const existing = db.getSong(spotifyId) as Song | undefined;
    if (!existing) {
        const track = await spotify.getTrack(spotifyId);
        db.upsertSong(spotifyId, track.name, track.artists[0].name);
    }

    const current = db.getRating(spotifyId, themeId) as Rating | undefined;
    const currentRating = current?.rating ?? 0;
    const newRating = currentRating + delta;

    db.setRating(spotifyId, themeId, newRating);
    await checkThemedPlaylistMembership(spotifyId, themeId);

    return newRating;
}

export function getSongRatings(spotifyId: string) {
    return db.getSongRatings(spotifyId);
}

// ---------- THEMES ----------

export function getThemes() {
    return db.getThemes();
}

export function createTheme(name: string, cloneFromThemeId?: number): number {
    return db.createTheme(name, cloneFromThemeId);
}

export function renameTheme(id: number, name: string): void {
    db.renameTheme(id, name);
}

export function deleteTheme(id: number): void {
    db.deleteTheme(id);
}

export function getThemeSongs(themeId: number, search?: string, sortBy?: string, order?: string) {
    return db.getThemeSongs(themeId, search, sortBy, order);
}

// ---------- PLAYLISTS ----------

export function getPlaylists(): Playlist[] {
    return db.getPlaylists();
}

export async function createSavedPlaylist(
    name: string,
    themeId: number,
    ratingMin: number | null,
    ratingMax: number | null,
    sort: string,
    limitCount: number | null,
    isDynamic: boolean
): Promise<number> {
    const playlistId = db.createPlaylist(name, themeId, ratingMin, ratingMax, sort, limitCount, isDynamic);

    if (!isDynamic) {
        const songs = db.getPlaylistSongsDynamic(themeId, ratingMin, ratingMax, sort, limitCount) as SongWithRating[];
        db.setPlaylistSongs(Number(playlistId), songs.map((s: Song) => s.spotify_id));
    }

    return Number(playlistId);
}

export function updateSavedPlaylist(
    id: number,
    name: string,
    isDynamic: boolean,
    ratingMin: number | null,
    ratingMax: number | null,
    sort: string,
    limitCount: number | null
): void {
    db.updatePlaylist(id, name, isDynamic, ratingMin, ratingMax, sort, limitCount);

    if (!isDynamic) {
        const playlist = db.getPlaylists().find((p: Playlist) => p.id === id);
        if (!playlist) throw new Error('Playlist not found');

        const songs = db.getPlaylistSongsDynamic(
            playlist.theme_id,
            ratingMin,
            ratingMax,
            sort,
            limitCount
        ) as SongWithRating[];

        db.setPlaylistSongs(id, songs.map((s: Song) => s.spotify_id));
    }
}

export function deleteSavedPlaylist(id: number): void {
    db.deletePlaylist(id);
}

export function getSavedPlaylistSongs(playlistId: number): SongWithRating[] | SongWithPosition[] {
    const playlist = db.getPlaylists().find((p: Playlist) => p.id === playlistId);
    if (!playlist) throw new Error('Playlist not found');

    if (playlist.is_dynamic) {
        return db.getPlaylistSongsDynamic(
            playlist.theme_id,
            playlist.rating_min,
            playlist.rating_max,
            playlist.sort,
            playlist.limit_count
        ) as SongWithRating[];
    }

    return db.getPlaylistSongs(playlistId) as SongWithPosition[];
}

// ---------- SETTINGS ----------

export async function setThemedPlaylist(uri: string): Promise<void> {
    const playlistId = uri.split(':').pop()!;
    const playlist = await spotify.getPlaylist(playlistId);
    if (!playlist) throw new Error('Playlist not found');

    const existing = db.getThemedPlaylist();
    if (existing) {
        db.updateThemedPlaylistSpotifyId(playlistId);
    } else {
        db.createThemedPlaylist(playlistId);
    }
}

export async function setMasterPlaylist(uri: string): Promise<number> {
    const playlistId = uri.split(':').pop()!;
    const playlist = await spotify.getPlaylist(playlistId);
    if (!playlist) throw new Error('Playlist not found');

    db.setMasterPlaylist(playlistId);
    const imported = await importPlaylistSongs(playlistId);
    return imported;
}

export async function importPlaylistSongs(playlistId: string): Promise<number> {
    const tracks = await spotify.getPlaylistTracks(playlistId);
    let imported = 0;

    for (const item of tracks) {
        if (!item.track || item.track.type !== 'track') continue;
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

export function getSpotifyTokens(): SpotifyTokens | undefined {
    return db.getSpotifyTokens();
}

export function saveSpotifyTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
    db.saveSpotifyTokens(accessToken, refreshToken, expiresIn);
}

export function isTokenExpired(): boolean {
    return db.isTokenExpired();
}