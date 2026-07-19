// Reactive app data (themes, playlists, songs, settings, ratings) plus the
// logic that loads, computes, or mutates it. Talks to the backend only
// through backendApi — no direct fetch() calls belong here.

// todo: separate the state logic and the functions into two seperate files

import type { Theme, Playlist, SongWithRating } from '../../../../types/types';

interface ThemeRating {
    themeId: number;
    rating: number;
}

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

class DataState {
    #themes = $state<Theme[]>([]);
    #playlists = $state<Playlist[]>([]);

    #songs = $state<SongWithRating[]>([]);
    #search = $state('');
    #sortBy = $state('rating');
    #sortOrder = $state('DESC');

    #builderThemeId = $state<number | null>(1);
    #builderRatingMin = $state<number | null>(null);
    #builderRatingMax = $state<number | null>(null);
    #builderSort = $state('top');
    #builderLimit = $state<number | null>(null);

    #themeRatings = $state<ThemeRating[]>([]);

    #settingsData = $state<SettingsData | null>(null);
    #tokenVisible = $state(false);
    #settingsSaved = $state(false);
    #masterImported = $state<number | null>(null);
    #externalAccess = $state(false);

    // ---------- ACCESSORS ----------
    get themes() { return this.#themes; }
    set themes(v: Theme[]) { this.#themes = v; }

    get playlists() { return this.#playlists; }
    set playlists(v: Playlist[]) { this.#playlists = v; }

    get songs() { return this.#songs; }
    set songs(v: SongWithRating[]) { this.#songs = v; }

    get search() { return this.#search; }
    set search(v: string) { this.#search = v; }
    get sortBy() { return this.#sortBy; }
    set sortBy(v: string) { this.#sortBy = v; }
    get sortOrder() { return this.#sortOrder; }
    set sortOrder(v: string) { this.#sortOrder = v; }

    get builderThemeId() { return this.#builderThemeId; }
    set builderThemeId(v: number | null) { this.#builderThemeId = v; }
    get builderRatingMin() { return this.#builderRatingMin; }
    set builderRatingMin(v: number | null) { this.#builderRatingMin = v; }
    get builderRatingMax() { return this.#builderRatingMax; }
    set builderRatingMax(v: number | null) { this.#builderRatingMax = v; }
    get builderSort() { return this.#builderSort; }
    set builderSort(v: string) { this.#builderSort = v; }
    get builderLimit() { return this.#builderLimit; }
    set builderLimit(v: number | null) { this.#builderLimit = v; }

    get themeRatings() { return this.#themeRatings; }
    set themeRatings(v: ThemeRating[]) { this.#themeRatings = v; }

    get settingsData() { return this.#settingsData; }
    set settingsData(v: SettingsData | null) { this.#settingsData = v; }
    get tokenVisible() { return this.#tokenVisible; }
    set tokenVisible(v: boolean) { this.#tokenVisible = v; }
    get settingsSaved() { return this.#settingsSaved; }
    set settingsSaved(v: boolean) { this.#settingsSaved = v; }
    get masterImported() { return this.#masterImported; }
    set masterImported(v: number | null) { this.#masterImported = v; }
    get externalAccess() { return this.#externalAccess; }
    set externalAccess(v: boolean) { this.#externalAccess = v; }

    // ---------- PURE HELPERS ----------
    // (synchronous, no backendApi, no other stores — same spirit as
    // PlaybackStore's skipNext/skipPrevious/progressPercent)

    getDefaultTheme(): Theme | undefined {
        return this.#themes.find(t => t.is_default === 1);
    }

    getNonDefaultThemes(): Theme[] {
        return this.#themes.filter(t => t.is_default === 0).sort((a, b) => a.name.localeCompare(b.name));
    }

    getRating(themeId: number): number {
        return this.#themeRatings.find(r => r.themeId === themeId)?.rating ?? 0;
    }

    updateRating(themeId: number, rating: number) {
        this.#themeRatings = this.#themeRatings.map(r =>
            r.themeId === themeId ? { ...r, rating } : r
        );
    }

    resetThemeRatings() {
        this.#themeRatings = this.#themes.map(t => ({ themeId: t.id, rating: 0 }));
    }

    toggleSort(col: string): boolean {
        // returns true if this triggers a re-sort of the same column vs a column switch,
        // useful if the controller wants to know whether to refetch
        if (this.#sortBy === col) {
            this.#sortOrder = this.#sortOrder === 'DESC' ? 'ASC' : 'DESC';
        } else {
            this.#sortBy = col;
            this.#sortOrder = 'DESC';
        }
        return true;
    }
}

export default new DataState();

/*/
import backendApi from './backendApi';
import PlaybackState from './PlaybackState.svelte';
import type { Theme, Playlist, SongWithRating } from '../../../../types/types';

interface ThemeRating {
    themeId: number;
    rating: number;
}

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

class DataStore {
    #themes = $state<Theme[]>([]);
    #playlists = $state<Playlist[]>([]);

    #songs = $state<SongWithRating[]>([]);
    #search = $state('');
    #sortBy = $state('rating');
    #sortOrder = $state('DESC');

    #builderThemeId = $state<number | null>(1);
    #builderRatingMin = $state<number | null>(null);
    #builderRatingMax = $state<number | null>(null);
    #builderSort = $state('top');
    #builderLimit = $state<number | null>(null);

    #themeRatings = $state<ThemeRating[]>([]);

    #newThemeName = $state('');
    #cloneFromThemeId = $state<number | null>(null);
    #savePlaylistName = $state('');
    #savePlaylistDynamic = $state(true);

    #settingsData = $state<SettingsData | null>(null);
    #tokenVisible = $state(false);
    #settingsSaved = $state(false);
    #masterImported = $state<number | null>(null);
    #externalAccess = $state(false);

    // ---------- ACCESSORS ----------
    get themes() { return this.#themes; }
    get playlists() { return this.#playlists; }

    get songs() { return this.#songs; }
    get search() { return this.#search; }
    set search(v: string) { this.#search = v; }
    get sortBy() { return this.#sortBy; }
    get sortOrder() { return this.#sortOrder; }

    get builderThemeId() { return this.#builderThemeId; }
    set builderThemeId(v: number | null) { this.#builderThemeId = v; }
    get builderRatingMin() { return this.#builderRatingMin; }
    set builderRatingMin(v: number | null) { this.#builderRatingMin = v; }
    get builderRatingMax() { return this.#builderRatingMax; }
    set builderRatingMax(v: number | null) { this.#builderRatingMax = v; }
    get builderSort() { return this.#builderSort; }
    set builderSort(v: string) { this.#builderSort = v; }
    get builderLimit() { return this.#builderLimit; }
    set builderLimit(v: number | null) { this.#builderLimit = v; }

    get newThemeName() { return this.#newThemeName; }
    set newThemeName(v: string) { this.#newThemeName = v; }
    get cloneFromThemeId() { return this.#cloneFromThemeId; }
    set cloneFromThemeId(v: number | null) { this.#cloneFromThemeId = v; }
    get savePlaylistName() { return this.#savePlaylistName; }
    set savePlaylistName(v: string) { this.#savePlaylistName = v; }
    get savePlaylistDynamic() { return this.#savePlaylistDynamic; }
    set savePlaylistDynamic(v: boolean) { this.#savePlaylistDynamic = v; }

    get settingsData() { return this.#settingsData; }
    get tokenVisible() { return this.#tokenVisible; }
    set tokenVisible(v: boolean) { this.#tokenVisible = v; }
    get settingsSaved() { return this.#settingsSaved; }
    get masterImported() { return this.#masterImported; }
    get externalAccess() { return this.#externalAccess; }

    // ---------- THEMES ----------

    async loadThemes() {
        this.#themes = await backendApi.getThemes();
        this.#themeRatings = this.#themes.map(t => ({ themeId: t.id, rating: 0 }));
        this.#builderThemeId = this.getDefaultTheme()?.id ?? null;
    }

    async loadThemeSongs(themeId: number) {
        this.#songs = await backendApi.getThemeSongs(themeId, this.#sortBy, this.#sortOrder, this.#search || undefined);
    }

    async playTheme(themeId: number) {
        await backendApi.playTheme(themeId);
        // TODO: trigger a playback-state refresh here once player.ts/playerAPI is wired back in
    }

    async createTheme() {
        if (!this.#newThemeName.trim()) return;
        await backendApi.createTheme(this.#newThemeName.trim(), this.#cloneFromThemeId);
        this.#newThemeName = '';
        this.#cloneFromThemeId = null;
        await this.loadThemes();
    }

    async deleteTheme(id: number) {
        await backendApi.deleteTheme(id);
        await this.loadThemes();
    }

    getDefaultTheme(): Theme | undefined {
        return this.#themes.find(t => t.is_default === 1);
    }

    getNonDefaultThemes(): Theme[] {
        return this.#themes.filter(t => t.is_default === 0).sort((a, b) => a.name.localeCompare(b.name));
    }

    // ---------- PLAYLISTS ----------

    async loadPlaylists() {
        this.#playlists = await backendApi.getPlaylists();
    }

    async loadThemedPlaylistSongs() {
        this.#songs = await backendApi.getThemedPlaylistSongs();
    }

    async loadSavedPlaylistSongs(playlistId: number) {
        this.#songs = await backendApi.getPlaylistSongs(playlistId);
    }

    async loadBuilderPreview() {
        if (!this.#builderThemeId) return;
        this.#songs = await backendApi.getBuilderPreview({
            themeId: this.#builderThemeId,
            sort: this.#builderSort,
            ratingMin: this.#builderRatingMin,
            ratingMax: this.#builderRatingMax,
            limitCount: this.#builderLimit
        });
    }

    async updateAndPlayThemedPlaylist() {
        if (!this.#builderThemeId) return;
        const uri = await backendApi.updateAndPlayThemedPlaylist({
            themeId: this.#builderThemeId,
            ratingMin: this.#builderRatingMin,
            ratingMax: this.#builderRatingMax,
            sort: this.#builderSort,
            limitCount: this.#builderLimit
        });
        // TODO: call play(uri) here once player.ts/playerAPI is wired back in
    }

    async playSavedPlaylist(playlistId: number) {
        await backendApi.playPlaylist(playlistId);
    }

    async savePlaylist() {
        if (!this.#savePlaylistName.trim() || !this.#builderThemeId) return;
        await backendApi.savePlaylist({
            name: this.#savePlaylistName.trim(),
            themeId: this.#builderThemeId,
            ratingMin: this.#builderRatingMin,
            ratingMax: this.#builderRatingMax,
            sort: this.#builderSort,
            limitCount: this.#builderLimit,
            isDynamic: this.#savePlaylistDynamic
        });
        this.#savePlaylistName = '';
        await this.loadPlaylists();
    }

    async deletePlaylist(id: number) {
        await backendApi.deletePlaylist(id);
        await this.loadPlaylists();
    }

    // ---------- RATINGS ----------

    async loadCurrentTrackRatings() {
        if (!PlaybackState.item?.id) return;
        const ratings = await backendApi.getRatingsForTrack(PlaybackState.item.id);
        this.#themeRatings = this.#themes.map(t => ({
            themeId: t.id,
            rating: ratings.find(r => r.theme_id === t.id)?.rating ?? 0
        }));
    }

    async rate(themeId: number, delta: number) {
        if (!PlaybackState?.item?.id) return;
        const rating = await backendApi.rateTrack(PlaybackState.item.id, themeId, delta);
        this.#themeRatings = this.#themeRatings.map(r =>
            r.themeId === themeId ? { ...r, rating } : r
        );
    }

    getRating(themeId: number): number {
        return this.#themeRatings.find(r => r.themeId === themeId)?.rating ?? 0;
    }

    // ---------- SEARCH / SORT ----------
    // Called from windowState, which owns selectedView/selectedId and passes
    // the relevant theme id in — search/sort behavior itself lives here since
    // it's driving a data fetch.

    async applySort(col: string, themeId: number | null) {
        if (this.#sortBy === col) {
            this.#sortOrder = this.#sortOrder === 'DESC' ? 'ASC' : 'DESC';
        } else {
            this.#sortBy = col;
            this.#sortOrder = 'DESC';
        }
        if (themeId) await this.loadThemeSongs(themeId);
    }

    // ---------- SETTINGS ----------

    async loadSettings() {
        const [data, extAccess] = await Promise.all([
            backendApi.getSettings(),
            backendApi.getExternalAccess()
        ]);
        this.#settingsData = data;
        this.#externalAccess = extAccess;
    }

    async saveSettings() {
        if (!this.#settingsData) return;
        await backendApi.saveSettings({
            spotifyClientId: this.#settingsData.spotifyClientId,
            skipPenalty: this.#settingsData.skipPenalty,
            replayBonus: this.#settingsData.replayBonus,
            autoMin: this.#settingsData.autoMin,
            autoMax: this.#settingsData.autoMax,
            autoRate: this.#settingsData.autoRate
        });
        this.#settingsSaved = true;
        setTimeout(() => this.#settingsSaved = false, 2000);
    }

    async saveThemedPlaylist() {
        if (!this.#settingsData?.themedPlaylistUri) return;
        await backendApi.saveThemedPlaylistUri(this.#settingsData.themedPlaylistUri);
    }

    async saveMasterPlaylist() {
        if (!this.#settingsData?.masterPlaylistUri) return;
        this.#masterImported = await backendApi.saveMasterPlaylistUri(this.#settingsData.masterPlaylistUri);
        setTimeout(() => this.#masterImported = null, 3000);
    }

    async regenerateToken() {
        const secretToken = await backendApi.regenerateToken();
        if (this.#settingsData) this.#settingsData.secretToken = secretToken;
    }

    async toggleExternalAccess() {
        this.#externalAccess = await backendApi.toggleExternalAccess();
    }

    spotifyLogin() {
        window.location.href = '/api/spotify/auth';
    }

    // ---------- HELPERS ----------

    formatTime(ms: number): string {
        const total = Math.floor(ms / 1000);
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
}

export default new DataStore();
//*/