import Database from 'better-sqlite3';
import path from 'path';
import { appdataFolder } from '../utils/appconfig.js';
import type { Song, Theme, Rating, Playlist, SpotifyTokens, SongWithPosition, SongWithRating } from '../types/types.js';

const db = new Database(path.join(appdataFolder, 'sorty.db'));

db.pragma('journal_mode = WAL');

export function initDatabase(): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS songs (
            spotify_id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            artist TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS themes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            is_default INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS ratings (
            spotify_id TEXT NOT NULL,
            theme_id INTEGER NOT NULL,
            rating REAL NOT NULL,
            PRIMARY KEY (spotify_id, theme_id),
            FOREIGN KEY (spotify_id) REFERENCES songs(spotify_id) ON DELETE CASCADE,
            FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS spotify_tokens (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            expires_at INTEGER NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            theme_id INTEGER NOT NULL,
            rating_min INTEGER,
            rating_max INTEGER,
            sort TEXT DEFAULT 'top',
            limit_count INTEGER,
            is_dynamic INTEGER DEFAULT 1,
            is_themed INTEGER DEFAULT 0,
            spotify_playlist_id TEXT,
            FOREIGN KEY (theme_id) REFERENCES themes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS playlist_songs (
            playlist_id INTEGER NOT NULL,
            spotify_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            PRIMARY KEY (playlist_id, spotify_id),
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY (spotify_id) REFERENCES songs(spotify_id) ON DELETE CASCADE
        );
    `);

    const defaultTheme = db.prepare('SELECT id FROM themes WHERE is_default = 1').get();
    if (!defaultTheme) {
        db.prepare('INSERT INTO themes (name, is_default) VALUES (?, 1)').run('Default');
    }
}

export default db;

// ---------- SONGS ----------

export function getSong(spotifyId: string): Song | undefined {
    return db.prepare('SELECT * FROM songs WHERE spotify_id = ?').get(spotifyId) as Song | undefined;
}

export function upsertSong(spotifyId: string, title: string, artist: string): void {
    db.prepare(`
        INSERT INTO songs (spotify_id, title, artist)
        VALUES (?, ?, ?)
        ON CONFLICT (spotify_id) DO UPDATE SET title = excluded.title, artist = excluded.artist
    `).run(spotifyId, title, artist);
}

// ---------- THEMES ----------

export function getThemes(): Theme[] {
    return db.prepare('SELECT * FROM themes').all() as Theme[];
}

export function getDefaultTheme(): Theme | undefined {
    return db.prepare('SELECT * FROM themes WHERE is_default = 1').get() as Theme | undefined;
}

export function createTheme(name: string, cloneFromThemeId?: number): number {
    const result = db.prepare('INSERT INTO themes (name) VALUES (?)').run(name);
    const newThemeId = result.lastInsertRowid;

    if (cloneFromThemeId) {
        // Clone ratings from specified theme
        db.prepare(`
            INSERT INTO ratings (spotify_id, theme_id, rating)
            SELECT spotify_id, ?, rating
            FROM ratings
            WHERE theme_id = ?
        `).run(newThemeId, cloneFromThemeId);
    } else {
        // Load all songs from default theme with rating 0
        db.prepare(`
            INSERT INTO ratings (spotify_id, theme_id, rating)
            SELECT spotify_id, ?, 0
            FROM ratings
            WHERE theme_id = (SELECT id FROM themes WHERE is_default = 1)
        `).run(newThemeId);
    }

    return Number(newThemeId);
}

export function renameTheme(id: number, name: string): void {
    db.prepare('UPDATE themes SET name = ? WHERE id = ?').run(name, id);
}

export function deleteTheme(id: number): void {
    const theme = db.prepare('SELECT is_default FROM themes WHERE id = ?').get(id) as Pick<Theme, 'is_default'> | undefined;
    if (theme?.is_default) {
        throw new Error('Cannot delete the default theme');
    }
    db.prepare('DELETE FROM themes WHERE id = ?').run(id);
}

// ---------- RATINGS ----------

export function getRating(spotifyId: string, themeId: number): Rating | undefined {
    return db.prepare('SELECT * FROM ratings WHERE spotify_id = ? AND theme_id = ?').get(spotifyId, themeId) as Rating | undefined;
}

export function getSongRatings(spotifyId: string): Rating[] {
    return db.prepare(`
        SELECT themes.id as theme_id, themes.name, ratings.rating, ratings.spotify_id
        FROM ratings
        JOIN themes ON ratings.theme_id = themes.id
        WHERE ratings.spotify_id = ?
    `).all(spotifyId) as Rating[];
}

export function setRating(spotifyId: string, themeId: number, rating: number): void {
    db.prepare(`
        INSERT INTO ratings (spotify_id, theme_id, rating)
        VALUES (?, ?, ?)
        ON CONFLICT (spotify_id, theme_id) DO UPDATE SET rating = excluded.rating
    `).run(spotifyId, themeId, rating);
}

// ---------- PLAYLISTS ----------

export function getPlaylists(): Playlist[] {
    return db.prepare('SELECT * FROM playlists WHERE is_themed = 0 ORDER BY name ASC').all() as Playlist[];
}

export function getThemedPlaylist(): Playlist | undefined {
    return db.prepare('SELECT * FROM playlists WHERE is_themed = 1').get() as Playlist | undefined;
}

export function getMasterPlaylist(): Playlist | undefined {
    return db.prepare('SELECT * FROM playlists WHERE name = ? AND is_themed = 0')
        .get('__master__') as Playlist | undefined;
}

export function setMasterPlaylist(spotifyPlaylistId: string): void {
    const existing = getMasterPlaylist();
    if (existing) {
        db.prepare('UPDATE playlists SET spotify_playlist_id = ? WHERE id = ?')
            .run(spotifyPlaylistId, existing.id);
    } else {
        db.prepare(`
            INSERT INTO playlists (name, theme_id, is_dynamic, is_themed, spotify_playlist_id)
            VALUES ('__master__', 1, 0, 0, ?)
        `).run(spotifyPlaylistId);
    }
}

export function createThemedPlaylist(spotifyPlaylistId: string): void {
    db.prepare(`
        INSERT INTO playlists (name, theme_id, is_themed, spotify_playlist_id)
        VALUES ('Themed Playlist', 1, 1, ?)
    `).run(spotifyPlaylistId);
}

export function updateThemedPlaylistSpotifyId(spotifyPlaylistId: string): void {
    db.prepare(`
        UPDATE playlists SET spotify_playlist_id = ? WHERE is_themed = 1
    `).run(spotifyPlaylistId);
}

export function createPlaylist(
    name: string,
    themeId: number,
    ratingMin: number | null,
    ratingMax: number | null,
    sort: string,
    limitCount: number | null,
    isDynamic: boolean
): number {
    const result = db.prepare(`
        INSERT INTO playlists (name, theme_id, rating_min, rating_max, sort, limit_count, is_dynamic)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, themeId, ratingMin, ratingMax, sort, limitCount, isDynamic ? 1 : 0);
    return Number(result.lastInsertRowid);
}

export function updatePlaylist(
    id: number,
    name: string,
    isDynamic: boolean,
    ratingMin: number | null,
    ratingMax: number | null,
    sort: string,
    limitCount: number | null
): void {
    db.prepare(`
        UPDATE playlists SET name = ?, is_dynamic = ?, rating_min = ?, rating_max = ?, sort = ?, limit_count = ?
        WHERE id = ?
    `).run(name, isDynamic ? 1 : 0, ratingMin, ratingMax, sort, limitCount, id);
}

export function deletePlaylist(id: number): void {
    db.prepare('DELETE FROM playlists WHERE id = ? AND is_themed = 0').run(id);
}

export function getPlaylistSongs(playlistId: number): SongWithPosition[] {
    return db.prepare(`
        SELECT songs.*, playlist_songs.position
        FROM playlist_songs
        JOIN songs ON playlist_songs.spotify_id = songs.spotify_id
        WHERE playlist_songs.playlist_id = ?
        ORDER BY playlist_songs.position ASC
    `).all(playlistId) as SongWithPosition[];
}

export function setPlaylistSongs(playlistId: number, spotifyIds: string[]): void {
    const deleteStmt = db.prepare('DELETE FROM playlist_songs WHERE playlist_id = ?');
    const insertStmt = db.prepare('INSERT INTO playlist_songs (playlist_id, spotify_id, position) VALUES (?, ?, ?)');

    const transaction = db.transaction(() => {
        deleteStmt.run(playlistId);
        spotifyIds.forEach((id, index) => {
            insertStmt.run(playlistId, id, index);
        });
    });

    transaction();
}

export function getThemeSongs(themeId: number, search?: string, sortBy: string = 'rating', order: string = 'DESC'): SongWithRating[] {
    const validSortColumns: Record<string, string> = {
        rating: 'ratings.rating',
        name: 'songs.title',
        artist: 'songs.artist'
    };

    const sortColumn = validSortColumns[sortBy] ?? 'ratings.rating';
    const isTextColumn = sortBy === 'name' || sortBy === 'artist';
    const sortOrder = isTextColumn
        ? (order === 'DESC' ? 'ASC' : 'DESC')  // flip for text
        : (order === 'ASC' ? 'ASC' : 'DESC');  // leave for numbers

    let query = `
        SELECT songs.*, ratings.rating
        FROM ratings
        JOIN songs ON ratings.spotify_id = songs.spotify_id
        WHERE ratings.theme_id = ?
    `;

    const params: (string | number)[] = [themeId];

    if (search) {
        query += ` AND (songs.title LIKE ? OR songs.artist LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY ${sortColumn} ${sortOrder}`;

    return db.prepare(query).all(...params) as SongWithRating[];
}

export function getPlaylistSongsDynamic(
    themeId: number,
    ratingMin: number | null,
    ratingMax: number | null,
    sort: string,
    limitCount: number | null
): SongWithRating[] {
    let query = `
        SELECT songs.*, ratings.rating
        FROM ratings
        JOIN songs ON ratings.spotify_id = songs.spotify_id
        WHERE ratings.theme_id = ?
    `;

    const params: (string | number)[] = [themeId];

    if (ratingMin !== null) {
        query += ` AND ratings.rating >= ?`;
        params.push(ratingMin);
    }

    if (ratingMax !== null) {
        query += ` AND ratings.rating <= ?`;
        params.push(ratingMax);
    }

    if (sort === 'top') {
        query += ` ORDER BY ratings.rating DESC`;
    } else if (sort === 'bottom') {
        query += ` ORDER BY ratings.rating ASC`;
    } else {
        query += ` ORDER BY RANDOM()`;
    }

    if (limitCount) {
        query += ` LIMIT ?`;
        params.push(limitCount);
    }

    return db.prepare(query).all(...params) as SongWithRating[];
}

// ---------- SPOTIFY TOKENS ----------

export function getSpotifyTokens(): SpotifyTokens | undefined {
    return db.prepare('SELECT * FROM spotify_tokens').get() as SpotifyTokens | undefined;
}

export function saveSpotifyTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
    const expiresAt = Date.now() + expiresIn * 1000;
    db.prepare(`
        INSERT INTO spotify_tokens (id, access_token, refresh_token, expires_at)
        VALUES (1, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
            access_token = excluded.access_token,
            refresh_token = excluded.refresh_token,
            expires_at = excluded.expires_at
    `).run(accessToken, refreshToken, expiresAt);
}

export function isTokenExpired(): boolean {
    const tokens = getSpotifyTokens();
    if (!tokens) return true;
    return Date.now() >= tokens.expires_at;
}