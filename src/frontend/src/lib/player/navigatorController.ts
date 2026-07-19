import WindowStore from './NavigatorState.svelte';
import libraryController from './libraryController';
import LibraryStore from './LibraryState.svelte';
import type { Theme, Playlist } from '../../../../types/types';

async function selectThemed() {
    WindowStore.setView('themed', null, 'Themed Playlist');
    await libraryController.loadThemedPlaylistSongs();
}

async function selectTheme(theme: Theme) {
    WindowStore.setView('theme', theme.id, theme.name);
    await libraryController.loadThemeSongs(theme.id);
}

async function selectPlaylist(playlist: Playlist) {
    WindowStore.setView('playlist', playlist.id, playlist.name);
    await libraryController.loadSavedPlaylistSongs(playlist.id);
}

async function selectSettings() {
    WindowStore.setView('settings', null, 'Settings');
    await libraryController.loadSettings();
}

async function applySearch() {
    if (WindowStore.selectedView === 'theme' && WindowStore.selectedId) {
        await libraryController.loadThemeSongs(WindowStore.selectedId);
    }
}

async function applySort(col: string) {
    await libraryController.applySort(col, WindowStore.selectedView === 'theme' ? WindowStore.selectedId : null);
}

async function confirmDelete() {
    const target = WindowStore.deleteTarget;
    if (!target) return;

    if (target.type === 'theme') {
        await libraryController.deleteTheme(target.id);
    } else {
        await libraryController.deletePlaylist(target.id);
    }
    if (WindowStore.selectedId === target.id) await selectThemed();
    WindowStore.clearDeleteTarget();
}

export default { selectThemed, selectTheme, selectPlaylist, selectSettings, applySearch, applySort, confirmDelete };