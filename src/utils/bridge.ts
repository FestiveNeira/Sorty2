/*
This file is designed to have a layer of communication between spotify's API and the local database
It exists to keep any data manipulation in a single layer and out of server.ts
it mostly gets called by the routes in src/server/routes and returns transformed data
it is also the location for event emission, basically it's the processing center of the
*/

import * as spotify from '../spotify/spotify.js';
import * as db from '../database/database.js';
import config from './appconfig.js'
import type { Song, Theme, Rating, Playlist, SongWithPosition, SongWithRating } from '../types/types.js';
import { io } from '../server/socket.js';

// ---------- SETUP ----------

export function initDatabase() {
    db.initDatabase();
}

// todo unused?
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

const bridge = {
    // ---------- PLAYBACK ----------

    async getPlaybackState() {
        const state = await spotify.getPlaybackState();
        if (!state?.item) return null;
        return state;
    },

    async getQueue() {
        const data = await spotify.getQueue();
        return {
            currentlyPlaying: data?.currently_playing ?? null,
            queue: data?.queue ?? []
        };
    },

    async getDevices() {
        const data = await spotify.getDevices();
        return data?.devices ?? [];
    },

    async connectDevice(id?: string, force: boolean = false): Promise<number> {
        for (let i = 0; i < 5; i++) {
            const devices = await this.getDevices();
            console.log('Connecting Device: Attempt ' + i);

            if (devices.length > 0) {
                let device = devices.find((d: any) => d.id === id || d.name === id);
                if (!force) device = device ?? devices[0];

                if (device) {
                    console.log("Connecting to " + device.id);
                    const status = await spotify.transferPlayback(device.id)
                    io.emit('playbackStateUpdate', true);
                    return status;
                }
            }

            if (i < 5) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return 404;
    },

    async setVolume(volumePercent: number) {
        const status = await spotify.setVolume(volumePercent);
        io.emit('playbackStateUpdate');
        return status;
    },

    async loadSavedPlaylist(playlistId: number): Promise<string> {
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
    },

    /*//this will need an io event if it's used
async playSavedPlaylist(playlistId: number) {
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
    async play(contextUri?: string, uris?: string[]) {
        await spotify.play(contextUri, uris)
        io.emit('playbackStateUpdate', !!contextUri);
    },

    async pause() {
        await spotify.pause()
        io.emit('playbackStateUpdate');
    },

    async skipNext() {
        await spotify.skipNext()
        io.emit('playbackStateUpdate');
    },

    async skipPrevious() {
        await spotify.skipPrevious()
        io.emit('playbackStateUpdate');
    },

    async seekToPosition(positionMs: number) {
        await spotify.seekToPosition(positionMs)
        io.emit('playbackStateUpdate');
    },

    // ---------- THEMED PLAYLIST ----------

    async checkThemedPlaylistMembership(spotifyId: string, themeId: number): Promise<void> {
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
    },

    previewPlaylistCriteria(
        themeId: number,
        ratingMin: number | null,
        ratingMax: number | null,
        sort: string,
        limitCount: number | null
    ): SongWithRating[] {
        return db.getPlaylistSongsDynamic(themeId, ratingMin, ratingMax, sort, limitCount);
    },

    getThemedPlaylistSongs(): SongWithPosition[] {
        const themedPlaylist = db.getThemedPlaylist();
        if (!themedPlaylist) return [];
        return db.getPlaylistSongs(themedPlaylist.id);
    },

    async updateThemedPlaylist(
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
    },

    // ---------- RATING ----------

    async rateSong(spotifyId: string, themeId: number, delta: number): Promise<number> {
        const existing = db.getSong(spotifyId) as Song | undefined;
        if (!existing) {
            const track = await spotify.getTrack(spotifyId);
            db.upsertSong(spotifyId, track.name, track.artists[0].name);
        }

        const current = db.getRating(spotifyId, themeId) as Rating | undefined;
        const currentRating = current?.rating ?? 0;
        const newRating = currentRating + delta;

        db.setRating(spotifyId, themeId, newRating);
        await this.checkThemedPlaylistMembership(spotifyId, themeId);

        return newRating;
    },

    getSongRatings(spotifyId: string) {
        return db.getSongRatings(spotifyId);
    },

    // ---------- THEMES ----------

    getThemes() {
        return db.getThemes();
    },

    createTheme(name: string, cloneFromThemeId?: number): number {
        return db.createTheme(name, cloneFromThemeId);
    },

    renameTheme(id: number, name: string): void {
        db.renameTheme(id, name);
    },

    deleteTheme(id: number): void {
        db.deleteTheme(id);
    },

    getThemeSongs(themeId: number, search?: string, sortBy?: string, order?: string) {
        return db.getThemeSongs(themeId, search, sortBy, order);
    },

    // ---------- PLAYLISTS ----------

    getPlaylists(): Playlist[] {
        return db.getPlaylists();
    },

    async createSavedPlaylist(
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
    },

    updateSavedPlaylist(
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
    },

    deleteSavedPlaylist(id: number): void {
        db.deletePlaylist(id);
    },

    getSavedPlaylistSongs(playlistId: number): SongWithRating[] | SongWithPosition[] {
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
    },

    // ---------- SETTINGS ----------

    async setThemedPlaylist(uri: string): Promise<void> {
        const playlistId = uri.split(':').pop()!;
        const playlist = await spotify.getPlaylist(playlistId);
        if (!playlist) throw new Error('Playlist not found');

        const existing = db.getThemedPlaylist();
        if (existing) {
            db.updateThemedPlaylistSpotifyId(playlistId);
        } else {
            db.createThemedPlaylist(playlistId);
        }
    },

    async setMasterPlaylist(uri: string): Promise<number> {
        const playlistId = uri.split(':').pop()!;
        const playlist = await spotify.getPlaylist(playlistId);
        if (!playlist) throw new Error('Playlist not found');

        db.setMasterPlaylist(playlistId);
        const imported = await this.importPlaylistSongs(playlistId);
        return imported;
    },

    async importPlaylistSongs(playlistId: string): Promise<number> {
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
    },

    getSettingsData() {
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
    },
}

export default bridge;