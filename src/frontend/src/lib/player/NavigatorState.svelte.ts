// This file contains all the logic that dictates what get's displayed on the main page. This keeps a reactive state on things the user might interact with.
// Controls which view/theme/playlist is shown, sidebar & modal visibility,
// and responsive layout — the "chrome" of the app window itself.

import type { Theme, Playlist } from '../../../../types/types';

type SidebarView = 'themed' | 'playlist' | 'theme' | 'settings';

const AUTO_COLLAPSE_WIDTH = 1000;

class WindowStore {
    #selectedView = $state<SidebarView>('themed');
    #selectedId = $state<number | null>(null);
    #contentTitle = $state('Themed Playlist');

    #themesOpen = $state(true);
    #playlistsOpen = $state(true);

    #leftOpen = $state(true);
    #rightOpen = $state(true);
    #reopenLeft = $state(true);
    #reopenRight = $state(true);

    #showDevicePicker = $state(false);
    #showNewTheme = $state(false);
    #showSavePlaylist = $state(false);
    #showDeleteConfirm = $state(false);
    #deleteTarget = $state<{ type: 'theme' | 'playlist', id: number, name: string } | null>(null);

    get selectedView() { return this.#selectedView; }
    get selectedId() { return this.#selectedId; }
    get contentTitle() { return this.#contentTitle; }

    get themesOpen() { return this.#themesOpen; }
    set themesOpen(v: boolean) { this.#themesOpen = v; }
    get playlistsOpen() { return this.#playlistsOpen; }
    set playlistsOpen(v: boolean) { this.#playlistsOpen = v; }

    get leftOpen() { return this.#leftOpen; }
    get rightOpen() { return this.#rightOpen; }

    get showDevicePicker() { return this.#showDevicePicker; }
    set showDevicePicker(v: boolean) { this.#showDevicePicker = v; }
    get showNewTheme() { return this.#showNewTheme; }
    set showNewTheme(v: boolean) { this.#showNewTheme = v; }
    get showSavePlaylist() { return this.#showSavePlaylist; }
    set showSavePlaylist(v: boolean) { this.#showSavePlaylist = v; }
    get showDeleteConfirm() { return this.#showDeleteConfirm; }
    set showDeleteConfirm(v: boolean) { this.#showDeleteConfirm = v; }
    get deleteTarget() { return this.#deleteTarget; }
    set deleteTarget(v: { type: 'theme' | 'playlist', id: number, name: string } | null) { this.#deleteTarget = v; }

    // ---------- PURE VIEW TRANSITIONS ----------
    // No data-loading here — controller decides what to fetch after these run

    setView(view: SidebarView, id: number | null, title: string) {
        this.#selectedView = view;
        this.#selectedId = id;
        this.#contentTitle = title;
    }

    requestDeleteTheme(theme: Theme) {
        this.#deleteTarget = { type: 'theme', id: theme.id, name: theme.name };
        this.#showDeleteConfirm = true;
    }

    requestDeletePlaylist(playlist: Playlist) {
        this.#deleteTarget = { type: 'playlist', id: playlist.id, name: playlist.name };
        this.#showDeleteConfirm = true;
    }

    clearDeleteTarget() {
        this.#showDeleteConfirm = false;
        this.#deleteTarget = null;
    }

    // ---------- RESPONSIVE LAYOUT ----------

    handleResize() {
        if (window.innerWidth < AUTO_COLLAPSE_WIDTH && this.#rightOpen) {
            this.#rightOpen = false;
        }
        if (window.innerWidth > AUTO_COLLAPSE_WIDTH) {
            if (this.#reopenLeft) this.#leftOpen = true;
            if (this.#reopenRight) this.#rightOpen = true;
        }
    }

    toggleLeft() {
        if (!this.#leftOpen) {
            if (window.innerWidth < AUTO_COLLAPSE_WIDTH) this.#rightOpen = false;
            this.#leftOpen = true;
        } else {
            this.#leftOpen = false;
            this.#reopenLeft = false;
        }
    }

    toggleRight() {
        if (!this.#rightOpen) {
            if (window.innerWidth < AUTO_COLLAPSE_WIDTH) this.#leftOpen = false;
            this.#rightOpen = true;
        } else {
            this.#rightOpen = false;
            this.#reopenRight = false;
        }
    }
}

export default new WindowStore();

/*/
import DataState from './DataState.svelte';
import type { Theme, Playlist } from '../../../../types/types';

type SidebarView = 'themed' | 'playlist' | 'theme' | 'settings';

const AUTO_COLLAPSE_WIDTH = 1000;

class WindowState {
    #selectedView = $state<SidebarView>('themed');
    #selectedId = $state<number | null>(null);
    #contentTitle = $state('Themed Playlist');

    #themesOpen = $state(true);
    #playlistsOpen = $state(true);

    #leftOpen = $state(true);
    #rightOpen = $state(true);
    #reopenLeft = $state(true);
    #reopenRight = $state(true);

    #showDevicePicker = $state(false);
    #showNewTheme = $state(false);
    #showSavePlaylist = $state(false);
    #showDeleteConfirm = $state(false);
    #deleteTarget = $state<{ type: 'theme' | 'playlist', id: number, name: string } | null>(null);

    // ---------- ACCESSORS ----------
    get selectedView() { return this.#selectedView; }
    get selectedId() { return this.#selectedId; }
    get contentTitle() { return this.#contentTitle; }

    get themesOpen() { return this.#themesOpen; }
    set themesOpen(v: boolean) { this.#themesOpen = v; }
    get playlistsOpen() { return this.#playlistsOpen; }
    set playlistsOpen(v: boolean) { this.#playlistsOpen = v; }

    get leftOpen() { return this.#leftOpen; }
    get rightOpen() { return this.#rightOpen; }

    get showDevicePicker() { return this.#showDevicePicker; }
    set showDevicePicker(v: boolean) { this.#showDevicePicker = v; }
    get showNewTheme() { return this.#showNewTheme; }
    set showNewTheme(v: boolean) { this.#showNewTheme = v; }
    get showSavePlaylist() { return this.#showSavePlaylist; }
    set showSavePlaylist(v: boolean) { this.#showSavePlaylist = v; }
    get showDeleteConfirm() { return this.#showDeleteConfirm; }
    set showDeleteConfirm(v: boolean) { this.#showDeleteConfirm = v; }
    get deleteTarget() { return this.#deleteTarget; }

    // ---------- RESPONSIVE LAYOUT ----------

    handleResize() {
        if (window.innerWidth < AUTO_COLLAPSE_WIDTH && this.#rightOpen) {
            this.#rightOpen = false;
        }
        if (window.innerWidth > AUTO_COLLAPSE_WIDTH) {
            if (this.#reopenLeft) this.#leftOpen = true;
            if (this.#reopenRight) this.#rightOpen = true;
        }
    }

    toggleLeft() {
        if (!this.#leftOpen) {
            if (window.innerWidth < AUTO_COLLAPSE_WIDTH) {
                this.#rightOpen = false;
            }
            this.#leftOpen = true;
        } else {
            this.#leftOpen = false;
            this.#reopenLeft = false;
        }
    }

    toggleRight() {
        if (!this.#rightOpen) {
            if (window.innerWidth < AUTO_COLLAPSE_WIDTH) {
                this.#leftOpen = false;
            }
            this.#rightOpen = true;
        } else {
            this.#rightOpen = false;
            this.#reopenRight = false;
        }
    }

    // ---------- SIDEBAR SELECTION ----------

    async selectThemed() {
        this.#selectedView = 'themed';
        this.#selectedId = null;
        this.#contentTitle = 'Themed Playlist';
        await DataState.loadThemedPlaylistSongs();
    }

    async selectTheme(theme: Theme) {
        this.#selectedView = 'theme';
        this.#selectedId = theme.id;
        this.#contentTitle = theme.name;
        await DataState.loadThemeSongs(theme.id);
    }

    async selectPlaylist(playlist: Playlist) {
        this.#selectedView = 'playlist';
        this.#selectedId = playlist.id;
        this.#contentTitle = playlist.name;
        await DataState.loadSavedPlaylistSongs(playlist.id);
    }

    async selectSettings() {
        this.#selectedView = 'settings';
        this.#selectedId = null;
        this.#contentTitle = 'Settings';
        await DataState.loadSettings();
    }

    // ---------- SEARCH / SORT ----------

    async applySearch() {
        if (this.#selectedView === 'theme' && this.#selectedId) {
            await DataState.loadThemeSongs(this.#selectedId);
        }
    }

    async applySort(col: string) {
        await DataState.applySort(col, this.#selectedView === 'theme' ? this.#selectedId : null);
    }

    // ---------- DELETE FLOW ----------

    confirmDeleteTheme(theme: Theme) {
        this.#deleteTarget = { type: 'theme', id: theme.id, name: theme.name };
        this.#showDeleteConfirm = true;
    }

    confirmDeletePlaylist(playlist: Playlist) {
        this.#deleteTarget = { type: 'playlist', id: playlist.id, name: playlist.name };
        this.#showDeleteConfirm = true;
    }

    async confirmDelete() {
        if (!this.#deleteTarget) return;
        if (this.#deleteTarget.type === 'theme') {
            await DataState.deleteTheme(this.#deleteTarget.id);
            if (this.#selectedId === this.#deleteTarget.id) await this.selectThemed();
        } else {
            await DataState.deletePlaylist(this.#deleteTarget.id);
            if (this.#selectedId === this.#deleteTarget.id) await this.selectThemed();
        }
        this.#showDeleteConfirm = false;
        this.#deleteTarget = null;
    }
}

export default new WindowState();
//*/