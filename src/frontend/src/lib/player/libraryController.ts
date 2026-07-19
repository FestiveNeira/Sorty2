// Orchestrates LibraryState + PlaybackState + backendApi. Not a store itself —
// no $state here, this file just coordinates.

import backendApi from './backendApi';
import LibraryState from './LibraryState.svelte';
import PlaybackState from './PlaybackState.svelte';

async function loadThemes() {
    LibraryState.themes = await backendApi.getThemes();
    // LibraryState.resetThemeRatings(); todo: this should be used when making new playlists only to 0 them out
    LibraryState.builderThemeId = LibraryState.getDefaultTheme()?.id ?? null;
}

async function loadThemeSongs(themeId: number) {
    LibraryState.songs = await backendApi.getThemeSongs(
        themeId, LibraryState.sortBy, LibraryState.sortOrder, LibraryState.search || undefined
    );
}

async function createTheme(name: string, cloneid: number | null) {
    if (!name.trim()) return;
    await backendApi.createTheme(name.trim(), cloneid);
    await loadThemes();
}

async function deleteTheme(id: number) {
    await backendApi.deleteTheme(id);
    await loadThemes();
}

async function loadPlaylists() {
    LibraryState.playlists = await backendApi.getPlaylists();
}

async function loadThemedPlaylistSongs() {
    LibraryState.songs = await backendApi.getThemedPlaylistSongs();
}

async function loadSavedPlaylistSongs(playlistId: number) {
    LibraryState.songs = await backendApi.getPlaylistSongs(playlistId);
}

async function loadBuilderPreview() {
    if (!LibraryState.builderThemeId) return;
    LibraryState.songs = await backendApi.getBuilderPreview({
        themeId: LibraryState.builderThemeId,
        sort: LibraryState.builderSort,
        ratingMin: LibraryState.builderRatingMin,
        ratingMax: LibraryState.builderRatingMax,
        limitCount: LibraryState.builderLimit
    });
}

async function updateThemedPlaylist() {
    if (!LibraryState.builderThemeId) return;
    const uri = await backendApi.updateAndPlayThemedPlaylist({
        themeId: LibraryState.builderThemeId,
        ratingMin: LibraryState.builderRatingMin,
        ratingMax: LibraryState.builderRatingMax,
        sort: LibraryState.builderSort,
        limitCount: LibraryState.builderLimit
    });
    
    return uri;
}

async function savePlaylist(name: string, isDynamic: boolean) {
    if (!name.trim() || !LibraryState.builderThemeId) return;
    await backendApi.savePlaylist({
        name: name.trim(),
        themeId: LibraryState.builderThemeId,
        ratingMin: LibraryState.builderRatingMin,
        ratingMax: LibraryState.builderRatingMax,
        sort: LibraryState.builderSort,
        limitCount: LibraryState.builderLimit,
        isDynamic: isDynamic
    });
    await loadPlaylists();
}

async function deletePlaylist(id: number) {
    await backendApi.deletePlaylist(id);
    await loadPlaylists();
}

async function loadCurrentTrackRatings() {
    if (!PlaybackState.item?.id) return;
    const ratings = await backendApi.getRatingsForTrack(PlaybackState.item.id);
    LibraryState.themeRatings = LibraryState.themes.map(t => ({
        themeId: t.id,
        rating: ratings.find(r => r.theme_id === t.id)?.rating ?? 0
    }));
}

async function rate(themeId: number, delta: number) {
    if (!PlaybackState.item?.id) return;
    const rating = await backendApi.rateTrack(PlaybackState.item.id, themeId, delta);
    LibraryState.updateRating(themeId, rating);
}

async function applySort(col: string, themeId: number | null) {
    LibraryState.toggleSort(col);
    if (themeId) await loadThemeSongs(themeId);
}

async function loadSettings() {
    const [data, extAccess] = await Promise.all([
        backendApi.getSettings(),
        backendApi.getExternalAccess()
    ]);
    LibraryState.settingsData = data;
    LibraryState.externalAccess = extAccess;
}

async function saveSettings() {
    const s = LibraryState.settingsData;
    if (!s) return;
    await backendApi.saveSettings({
        spotifyClientId: s.spotifyClientId,
        skipPenalty: s.skipPenalty,
        replayBonus: s.replayBonus,
        autoMin: s.autoMin,
        autoMax: s.autoMax,
        autoRate: s.autoRate
    });
    LibraryState.settingsSaved = true;
    setTimeout(() => LibraryState.settingsSaved = false, 2000);
}

async function saveThemedPlaylist() {
    if (!LibraryState.settingsData?.themedPlaylistUri) return;
    await backendApi.saveThemedPlaylistUri(LibraryState.settingsData.themedPlaylistUri);
}

async function saveMasterPlaylist() {
    if (!LibraryState.settingsData?.masterPlaylistUri) return;
    LibraryState.masterImported = await backendApi.saveMasterPlaylistUri(LibraryState.settingsData.masterPlaylistUri);
    setTimeout(() => LibraryState.masterImported = null, 3000);
}

async function regenerateToken() {
    const secretToken = await backendApi.regenerateToken();
    if (LibraryState.settingsData) LibraryState.settingsData.secretToken = secretToken;
}

async function toggleExternalAccess() {
    LibraryState.externalAccess = await backendApi.toggleExternalAccess();
}

function spotifyLogin() {
    window.location.href = '/api/spotify/auth';
}

export default {
    loadThemes, loadThemeSongs, createTheme, deleteTheme,
    loadPlaylists, loadThemedPlaylistSongs, loadSavedPlaylistSongs, loadBuilderPreview,
    updateThemedPlaylist, savePlaylist, deletePlaylist,
    loadCurrentTrackRatings, rate, applySort,
    loadSettings, saveSettings, saveThemedPlaylist, saveMasterPlaylist,
    regenerateToken, toggleExternalAccess, spotifyLogin
};