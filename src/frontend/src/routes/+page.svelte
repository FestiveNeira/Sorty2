<!--
This is the main frontend file and the page that users will most often interact with.
It contains all logic for the app to function and can communicate with the server directly via http and websockets.Page
todo: rip css to a different file
todo: build overlay
todo: rip the queue logic to PlaybackStore.svelte
todo: sort everything in all files, code is a bit disorganized
-->

<script lang="ts">
    import { PlaybackStore } from '$lib/PlaybackStore.svelte';
    import type { Track, Episode, TrackItem } from '@spotify/web-api-ts-sdk';
    import { onMount, onDestroy } from 'svelte';
    import type { Theme, Playlist, SongWithRating } from '../../../types/types';

    // ---------- TYPES ----------
    interface ThemeRating {
        themeId: number;
        rating: number;
    }

    type SidebarView = 'themed' | 'playlist' | 'theme' | 'settings';
 
    // ---------- STATE ----------
    let events: EventSource;

    // There is a moment on startup where playbackstate will not be populated, this should not cause any errors and should rectify quickly
    let playbackState = new PlaybackStore();
    const loadStateDelay = 300;

    let nextTracks = $state<TrackItem[]>([]);
    let previousTracks = $state<TrackItem[]>([]);

    // Used to prevent multiple quick calls from running in parallel
    let syncTimeout: ReturnType<typeof setTimeout> | null = null;
 
    // Sidebar
    let themes = $state<Theme[]>([]);
    let playlists = $state<Playlist[]>([]);
    let selectedView = $state<SidebarView>('themed');
    let selectedId = $state<number | null>(null);
    let themesOpen = $state(true);
    let playlistsOpen = $state(true);
 
    // Main content
    let songs = $state<SongWithRating[]>([]);
    let search = $state('');
    let sortBy = $state('rating');
    let sortOrder = $state('DESC');
    let contentTitle = $state('Themed Playlist');
 
    // Playlist builder
    let builderThemeId = $state<number | null>(1);
    let builderRatingMin = $state<number | null>(null);
    let builderRatingMax = $state<number | null>(null);
    let builderSort = $state('top');
    let builderLimit = $state<number | null>(null);
 
    // Right sidebar
    let themeRatings = $state<ThemeRating[]>([]);

    // Bottom Bar
    let showDevicePicker = $state(false);
    let devices = $state<any[]>([]);
 
    // Modals
    let showNewTheme = $state(false);
    let showSavePlaylist = $state(false);
    let showDeleteConfirm = $state(false);
    let deleteTarget = $state<{ type: 'theme' | 'playlist', id: number, name: string } | null>(null);
    let newThemeName = $state('');
    let cloneFromThemeId = $state<number | null>(null);
    let savePlaylistName = $state('');
    let savePlaylistDynamic = $state(true);
 
    // ---------- LIFECYCLE ----------
 
    let progressInterval: ReturnType<typeof setInterval>;
 
    onMount(async () => {
        // Load App Data
        await loadThemes();
        await loadPlaylists();
        await loadThemedPlaylistSongs();
        await loadBuilderPreview();
        // Update When Focused
        document.addEventListener('visibilitychange', handleVisibilityChange);
        // Format Window
        window.addEventListener('resize', handleResize);
        setTimeout(handleResize, 500);

        // Event triggers
        events = new EventSource(`/api/events`);
        events.addEventListener('deviceConnected', () => {
            setTimeout(() => loadPlaybackState(true), loadStateDelay);
        });
        events.addEventListener('playbackStateUpdate', () => {
            setTimeout(() => loadPlaybackState(), loadStateDelay);
        });
    });
 
    onDestroy(() => {
        clearInterval(progressInterval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('resize', handleResize);
        events.close();
    });
 
    // ---------- EFFECTS ----------
 
    $effect(() => {
        if (builderThemeId && selectedView === 'themed') {
            loadBuilderPreview();
        }
    });
 
    // ---------- PLAYBACK CORE ----------
 
    function startProgressTimer() {
        clearInterval(progressInterval);
        if (!playbackState.is_playing || !playbackState.item) return;

        progressInterval = setInterval(() => {
            if (!playbackState.item) return;
            playbackState.progress_ms = Math.min(playbackState.progress_ms + 1000, playbackState.duration_ms);
            if (playbackState.progress_ms == playbackState.duration_ms) {
                clearInterval(progressInterval);
                loadPlaybackState();
            }
        }, 1000);
    }

    async function handleVisibilityChange() {
        if (document.visibilityState === 'visible') {
            await loadPlaybackState();
            await loadQueue(true);
        }
    }

    async function loadPlaybackState(queueChanged: boolean = false, attempts = 5) {
        const res = await fetch('/api/playback');
        if (!res.ok) {
            // Try to connect a device
            const deviceRes = await fetch('/api/devices/connect', { method: 'POST' });
            const { connected } = await deviceRes.json();
            if (connected) {
                // Wait a moment for transfer to complete then retry
                setTimeout(() => loadPlaybackState(queueChanged), 1000);
            }
            return;
        }
        const data = await res.json();
        if (data) {
            playbackState.raw = data;
            startProgressTimer();
            await loadCurrentTrackRatings();
            loadQueue(queueChanged);
        }
        else if (attempts > 1) {
            setTimeout(() => loadPlaybackState(queueChanged, attempts - 1), loadStateDelay);
        }
    }

    async function loadQueue(forceNew?: boolean) {
        if (nextTracks.length <= 5 || forceNew) {
            const res = await fetch('/api/queue');
            const data = await res.json();
            nextTracks = data.queue;
        }
    }

    // ---------- DATA LOADING ----------
 
    async function loadThemes() {
        const res = await fetch('/api/themes');
        themes = await res.json();
        themeRatings = themes.map(t => ({ themeId: t.id, rating: 0 }));
        builderThemeId = getDefaultTheme()?.id ?? null;
    }
 
    async function loadPlaylists() {
        const res = await fetch('/api/playlists');
        playlists = await res.json();
    }
 
    async function loadThemedPlaylistSongs() {
        const res = await fetch('/api/playlists/themed/songs');
        songs = await res.json();
    }
 
    async function loadThemeSongs(themeId: number) {
        const params = new URLSearchParams({ sortBy, order: sortOrder });
        if (search) params.set('search', search);
        const res = await fetch(`/api/themes/${themeId}/songs?${params}`);
        songs = await res.json();
    }
 
    async function loadSavedPlaylistSongs(playlistId: number) {
        const res = await fetch(`/api/playlists/${playlistId}/songs`);
        songs = await res.json();
    }
 
    async function loadCurrentTrackRatings() {
        if (!playbackState.item?.id) return;
        const res = await fetch(`/api/songs/${playbackState.item.id}/ratings`);
        const ratings = await res.json();
        themeRatings = themes.map(t => ({
            themeId: t.id,
            rating: ratings.find((r: any) => r.theme_id === t.id)?.rating ?? 0
        }));
    }

    async function loadBuilderPreview() {
        if (!builderThemeId) return;
        const params = new URLSearchParams();
        params.set('themeId', String(builderThemeId));
        params.set('sort', builderSort);
        if (builderRatingMin !== null) params.set('ratingMin', String(builderRatingMin));
        if (builderRatingMax !== null) params.set('ratingMax', String(builderRatingMax));
        if (builderLimit !== null) params.set('limitCount', String(builderLimit));
        const res = await fetch(`/api/playlists/preview?${params}`);
        songs = await res.json();
    }

    // ---------- SIDEBAR FORMATTING ----------

    const AUTO_COLLAPSE_WIDTH = 1000;

    let leftOpen = $state(true);
    let rightOpen = $state(true);

    let reopenLeft = $state(true);
    let reopenRight = $state(true);

    function handleResize() {
        if (window.innerWidth < AUTO_COLLAPSE_WIDTH && rightOpen) {
            rightOpen = false;
        }
        if (window.innerWidth > AUTO_COLLAPSE_WIDTH) {
            if (reopenLeft) leftOpen = true;
            if (reopenRight) rightOpen = true;
        }
    }

    function toggleLeft() {
        if (!leftOpen) {
            // opening left
            if (window.innerWidth < AUTO_COLLAPSE_WIDTH) {
                rightOpen = false; // collapse right to make room
            }
            leftOpen = true;
        } else {
            leftOpen = false;
            reopenLeft = false;
        }
    }

    function toggleRight() {
        if (!rightOpen) {
            // opening right
            if (window.innerWidth < AUTO_COLLAPSE_WIDTH) {
                leftOpen = false; // collapse left to make room
            }
            rightOpen = true;
        } else {
            rightOpen = false;
            reopenRight = false;
        }
    }
 
    // ---------- SIDEBAR SELECTION ----------
 
    async function selectThemed() {
        selectedView = 'themed';
        selectedId = null;
        contentTitle = 'Themed Playlist';
        await loadThemedPlaylistSongs();
    }
 
    async function selectTheme(theme: Theme) {
        selectedView = 'theme';
        selectedId = theme.id;
        contentTitle = theme.name;
        await loadThemeSongs(theme.id);
    }
 
    async function selectPlaylist(playlist: Playlist) {
        selectedView = 'playlist';
        selectedId = playlist.id;
        contentTitle = playlist.name;
        await loadSavedPlaylistSongs(playlist.id);
    }
 
    async function selectSettings() {
        selectedView = 'settings';
        selectedId = null;
        contentTitle = 'Settings';
        await loadSettings();
    }
 
    // ---------- PLAYBACK ----------

    async function loadDevices() {
        const res = await fetch('/api/devices');
        devices = await res.json() ?? [];
    }

    async function connectDevice(deviceId: string) {
        await fetch('/api/devices/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId })
        });
        showDevicePicker = false;
        setTimeout(loadPlaybackState, 500);
    }
    
    async function setVolume(v: number) {
        if (playbackState) {
            playbackState.volume = v;
            await fetch('/api/playback/volume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ volume: v })
            });
        }
        else {
            await loadPlaybackState();
            setTimeout(() => setVolume(v), loadStateDelay);
        }
    }

    async function play(context_uri?: string) {
        if (context_uri) {
            await fetch(`/api/playback/${context_uri}/play`, { method: 'POST' });
            setTimeout(() => loadPlaybackState(true), loadStateDelay);
        }
        else {
            await fetch('/api/playback/play', { method: 'POST' });
            setTimeout(() => loadPlaybackState(), loadStateDelay);
        }
        if (playbackState) playbackState.is_playing = true;
    }

    async function pause() {
        await fetch('/api/playback/pause', { method: 'POST' });
        if (playbackState) playbackState.is_playing = false;

        setTimeout(() => loadPlaybackState(), loadStateDelay);
    }
 
    async function skipNext() {
        // Clear any planned calls to update player
        if (syncTimeout) {
            clearTimeout(syncTimeout);
            syncTimeout = null;
        }

        // Update
        let nextTrack = nextTracks.shift();
        if (nextTrack && playbackState.item) {
            previousTracks.push(playbackState.item);
            playbackState.raw = {
                ...playbackState.raw!,
                item: nextTrack,
                progress_ms: 0,
                is_playing: true
            };
            startProgressTimer();
            await loadCurrentTrackRatings();
        }

        // Sync
        await fetch('/api/playback/next', { method: 'POST' });

        // Only sync after the user has stopped clicking
        syncTimeout = setTimeout(async () => {
            await loadPlaybackState();
            await loadQueue();
            syncTimeout = null;
        }, loadStateDelay);
    }
 
    async function skipPrevious() {
        // Clear any planned calls to update player
        if (syncTimeout) {
            clearTimeout(syncTimeout);
            syncTimeout = null;
        }

        // Update
        let previousTrack = previousTracks.pop();
        if (previousTrack && playbackState.item) {
            nextTracks.unshift(playbackState.item);
            playbackState.raw = {
                ...playbackState.raw!,
                item: previousTrack,
                progress_ms: 0,
                is_playing: true
            };
            startProgressTimer();
            await loadCurrentTrackRatings();
        }

        // Sync
        await fetch('/api/playback/previous', { method: 'POST' });

        // Only sync after the user has stopped clicking
        syncTimeout = setTimeout(async () => {
            await loadPlaybackState();
            await loadQueue();
            syncTimeout = null;
        }, loadStateDelay);
    }
 
    async function seek(percent: number) {
        if (!playbackState) return;
        const positionMs = Math.floor((percent / 100) * playbackState.duration_ms);
        await fetch('/api/playback/seek', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ positionMs })
        });
        playbackState.progress_ms = positionMs;
        setTimeout(() => loadPlaybackState(), loadStateDelay);
    }
 
    // ---------- RATING ----------
 
    async function rate(themeId: number, delta: number) {
        if (!playbackState?.item?.id) return;
        const res = await fetch('/api/ratings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spotifyId: playbackState.item.id, themeId, delta })
        });
        const { rating } = await res.json();
        themeRatings = themeRatings.map(r =>
            r.themeId === themeId ? { ...r, rating } : r
        );
        if (selectedView === 'theme' && selectedId === themeId) {
            await loadThemeSongs(themeId);
        }
    }
 
    function getRating(themeId: number): number {
        return themeRatings.find(r => r.themeId === themeId)?.rating ?? 0;
    }
 
    // ---------- THEMES ----------

    async function playTheme(themeId: number) {
        const res = await fetch(`/api/themes/${themeId}/play`, { method: 'POST' });
        setTimeout(() => loadPlaybackState(true), loadStateDelay);
    }
 
    async function createTheme() {
        if (!newThemeName.trim()) return;
        await fetch('/api/themes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: newThemeName.trim(),
                cloneFromThemeId: cloneFromThemeId ?? undefined
            })
        });
        newThemeName = '';
        cloneFromThemeId = null;
        showNewTheme = false;
        await loadThemes();
    }
 
    function confirmDeleteTheme(theme: Theme) {
        deleteTarget = { type: 'theme', id: theme.id, name: theme.name };
        showDeleteConfirm = true;
    }
 
    // ---------- PLAYLISTS ----------

    async function updateAndPlayThemedPlaylist() {
        if (!builderThemeId) return;
        
        const res = await fetch('/api/playlists/themed/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                themeId: builderThemeId,
                ratingMin: builderRatingMin,
                ratingMax: builderRatingMax,
                sort: builderSort,
                limitCount: builderLimit
            })
        });

        const { uri } = await res.json();
        await play(uri);
    }

    async function playSavedPlaylist(playlistId: number) {
        const res = await fetch(`/api/playlists/${playlistId}/play`, { method: 'POST' });
    }
 
    async function savePlaylist() {
        if (!savePlaylistName.trim() || !builderThemeId) return;
        await fetch('/api/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: savePlaylistName.trim(),
                themeId: builderThemeId,
                ratingMin: builderRatingMin,
                ratingMax: builderRatingMax,
                sort: builderSort,
                limitCount: builderLimit,
                isDynamic: savePlaylistDynamic
            })
        });
        savePlaylistName = '';
        showSavePlaylist = false;
        await loadPlaylists();
    }
 
    function confirmDeletePlaylist(playlist: Playlist) {
        deleteTarget = { type: 'playlist', id: playlist.id, name: playlist.name };
        showDeleteConfirm = true;
    }
 
    async function confirmDelete() {
        if (!deleteTarget) return;
        if (deleteTarget.type === 'theme') {
            await fetch(`/api/themes/${deleteTarget.id}`, { method: 'DELETE' });
            await loadThemes();
            if (selectedId === deleteTarget.id) await selectThemed();
        } else {
            await fetch(`/api/playlists/${deleteTarget.id}`, { method: 'DELETE' });
            await loadPlaylists();
            if (selectedId === deleteTarget.id) await selectThemed();
        }
        showDeleteConfirm = false;
        deleteTarget = null;
    }
    
    // ---------- SEARCH / SORT ----------
 
    async function applySearch() {
        if (selectedView === 'theme' && selectedId) {
            await loadThemeSongs(selectedId);
        }
    }
 
    async function applySort(col: string) {
        if (sortBy === col) {
            sortOrder = sortOrder === 'DESC' ? 'ASC' : 'DESC';
        } else {
            sortBy = col;
            sortOrder = 'DESC';
        }
        if (selectedView === 'theme' && selectedId) {
            await loadThemeSongs(selectedId);
        }
    }
 
    // ---------- SETTINGS ----------

    // Settings state
    let settingsData = $state<{
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
    } | null>(null);

    let tokenVisible = $state(false);
    let settingsSaved = $state(false);
    let masterImported = $state<number | null>(null);
    let externalAccess = $state(false);

    async function loadSettings() {
        const [settingsRes, externalRes] = await Promise.all([
            fetch('/api/settings'),
            fetch('/api/external-access')
        ]);
        settingsData = await settingsRes.json();
        const { externalAccessEnabled } = await externalRes.json();
        externalAccess = externalAccessEnabled;
    }

    async function saveSettings() {
        if (!settingsData) return;
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                spotifyClientId: settingsData.spotifyClientId,
                skipPenalty: settingsData.skipPenalty,
                replayBonus: settingsData.replayBonus,
                autoMin: settingsData.autoMin,
                autoMax: settingsData.autoMax,
                autoRate: settingsData.autoRate
            })
        });
        settingsSaved = true;
        setTimeout(() => settingsSaved = false, 2000);
    }

    async function saveThemedPlaylist() {
        if (!settingsData?.themedPlaylistUri) return;
        await fetch('/api/settings/themed-playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uri: settingsData.themedPlaylistUri })
        });
    }

    async function saveMasterPlaylist() {
        if (!settingsData?.masterPlaylistUri) return;
        const res = await fetch('/api/settings/master-playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uri: settingsData.masterPlaylistUri })
        });
        const { imported } = await res.json();
        masterImported = imported;
        setTimeout(() => masterImported = null, 3000);
    }

    async function regenerateToken() {
        const res = await fetch('/api/settings/regenerate-token', { method: 'POST' });
        const { secretToken } = await res.json();
        if (settingsData) settingsData.secretToken = secretToken;
    }

    async function toggleExternalAccess() {
        const res = await fetch('/api/external-access/toggle', { method: 'POST' });
        const { externalAccessEnabled } = await res.json();
        externalAccess = externalAccessEnabled;
    }

    async function spotifyLogin() {
        window.location.href = '/api/spotify/auth';
    }

    // ---------- HELPERS ----------
 
    function formatTime(ms: number): string {
        const total = Math.floor(ms / 1000);
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
 
    function progressPercent(): number {
        return Math.min((playbackState.progress_ms / playbackState.duration_ms) * 100, 100);
    }
 
    function getDefaultTheme(): Theme | undefined {
        return themes.find(t => t.is_default === 1);
    }
 
    function getNonDefaultThemes(): Theme[] {
        return themes.filter(t => t.is_default === 0).sort((a, b) => a.name.localeCompare(b.name));
    }
</script>
 
<svelte:head>
    <title>Sorty</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
</svelte:head>
 
<div class="app"
    style="
        --left-width: {leftOpen ? '220px' : '40px'};
        --right-width: {rightOpen ? '220px' : '40px'};
    "
>
    <div class="bg-grid"></div>

    <!-- LEFT SIDEBAR -->
    <aside class="sidebar-left {leftOpen ? '' : 'collapsed'}">
        <button class="sidebar-toggle left" onclick={toggleLeft} aria-label="Toggle left sidebar">
            {leftOpen ? '‹' : '›'}
        </button>
        
        {#if leftOpen}
            <div class="sidebar-top-box">
                <div class="appname">SORTY</div>
            </div>

            <div class="scroll-box">
                <button
                    class="sidebar-item themed {selectedView === 'themed' ? 'active' : ''}"
                    onclick={selectThemed}
                >
                    <span class="item-icon">⚡</span>
                    <span class="item-label">Themed Playlist</span>
                </button>

                <div class="section">
                    <button class="section-header" onclick={() => playlistsOpen = !playlistsOpen}>
                        <span class="chevron {playlistsOpen ? 'open' : ''}">›</span>
                        <span>Saved Playlists</span>
                    </button>
                    {#if playlistsOpen}
                        <div class="section-items">
                            {#each playlists as playlist}
                                <div class="sidebar-item-row">
                                    <button
                                        class="sidebar-item {selectedView === 'playlist' && selectedId === playlist.id ? 'active' : ''}"
                                        onclick={() => selectPlaylist(playlist)}
                                    >
                                        <span class="item-icon">◈</span>
                                        <span class="item-label">{playlist.name}</span>
                                    </button>
                                    <button class="play-btn" onclick={() => playSavedPlaylist(playlist.id)}>▶</button>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>

                <div class="section">
                    <button class="section-header" onclick={() => themesOpen = !themesOpen}>
                        <span class="chevron {themesOpen ? 'open' : ''}">›</span>
                        <span>Themes</span>
                    </button>
                    {#if themesOpen}
                        <div class="section-items">
                            {#if getDefaultTheme()}
                                {@const theme = getDefaultTheme()!}
                                <div class="sidebar-item-row">
                                    <button
                                        class="sidebar-item {selectedView === 'theme' && selectedId === theme.id ? 'active' : ''}"
                                        onclick={() => selectTheme(theme)}
                                    >
                                        <span class="item-icon">★</span>
                                        <span class="item-label">{theme.name}</span>
                                    </button>
                                    <button class="play-btn" onclick={() => playTheme(theme.id)}>▶</button>
                                </div>
                            {/if}
                            {#each getNonDefaultThemes() as theme}
                                <div class="sidebar-item-row">
                                    <button
                                        class="sidebar-item {selectedView === 'theme' && selectedId === theme.id ? 'active' : ''}"
                                        onclick={() => selectTheme(theme)}
                                    >
                                        <span class="item-icon">◆</span>
                                        <span class="item-label">{theme.name}</span>
                                    </button>
                                    <button class="play-btn" onclick={() => playTheme(theme.id)}>▶</button>
                                </div>
                            {/each}
                            <button class="add-btn" onclick={() => showNewTheme = true}>+ Add Theme</button>
                        </div>
                    {/if}
                </div>

                <div class="sidebar-footer">
                    <button 
                        class="sidebar-item {selectedView === 'settings' ? 'active' : ''}"
                        onclick={() => selectSettings()}
                    >
                        <span class="item-icon">⚙</span>
                        <span class="item-label">Settings</span>
                    </button>
                </div>
            </div>
        {/if}
    </aside>

    <!-- MAIN CONTENT -->
    <main class="main">
        <div class="main-header">
            <div class="main-title-row">
                <h1 class="main-title">{contentTitle}</h1>
                <div class="main-actions">
                    {#if selectedView === 'theme' && selectedId}
                        <button class="action-btn" onclick={() => playTheme(selectedId!)}>▶ Play</button>
                        {#if !themes.find(t => t.id === selectedId)?.is_default}
                            <button class="action-btn danger" onclick={() => {
                                const theme = themes.find(t => t.id === selectedId);
                                if (theme) confirmDeleteTheme(theme);
                            }}>Delete</button>
                        {/if}
                    {/if}
                    {#if selectedView === 'playlist' && selectedId}
                        <button class="action-btn" onclick={() => playSavedPlaylist(selectedId!)}>▶ Play</button>
                        <button class="action-btn danger" onclick={() => {
                            const playlist = playlists.find(p => p.id === selectedId);
                            if (playlist) confirmDeletePlaylist(playlist);
                        }}>Delete</button>
                    {/if}
                    {#if selectedView === 'themed'}
                        <button class="action-btn" onclick={() => showSavePlaylist = true}>Save Playlist</button>
                    {/if}
                </div>
            </div>

            {#if selectedView === 'theme'}
                <div class="search-row">
                    <input
                        class="search-input"
                        type="text"
                        placeholder="Search songs, artists..."
                        bind:value={search}
                        oninput={applySearch}
                    />
                    <div class="sort-btns">
                        <button class="sort-btn {sortBy === 'rating' ? 'active' : ''}" onclick={() => applySort('rating')}>
                            Rating {sortBy === 'rating' ? (sortOrder === 'DESC' ? '↓' : '↑') : ''}
                        </button>
                        <button class="sort-btn {sortBy === 'name' ? 'active' : ''}" onclick={() => applySort('name')}>
                            Name {sortBy === 'name' ? (sortOrder === 'DESC' ? '↓' : '↑') : ''}
                        </button>
                        <button class="sort-btn {sortBy === 'artist' ? 'active' : ''}" onclick={() => applySort('artist')}>
                            Artist {sortBy === 'artist' ? (sortOrder === 'DESC' ? '↓' : '↑') : ''}
                        </button>
                    </div>
                </div>
            {/if}

            {#if selectedView === 'themed'}
                <div class="builder">
                    <select class="builder-select" bind:value={builderThemeId}>
                        {#each themes as theme}
                            <option value={theme.id}>{theme.name}</option>
                        {/each}
                    </select>
                    <input class="builder-input" type="number" placeholder="Min rating" bind:value={builderRatingMin} />
                    <input class="builder-input" type="number" placeholder="Max rating" bind:value={builderRatingMax} />
                    <select class="builder-select" bind:value={builderSort}>
                        <option value="top">Top</option>
                        <option value="bottom">Bottom</option>
                        <option value="random">Random</option>
                    </select>
                    <input class="builder-input" type="number" placeholder="Limit" bind:value={builderLimit} />
                    <button class="action-btn" onclick={updateAndPlayThemedPlaylist}>▶ Play</button>
                    <button class="action-btn" onclick={() => showSavePlaylist = true}>Save</button>
                </div>
            {/if}
        </div>

        <div class="scroll-box">
            {#if selectedView === 'settings'}
                <div class="settings-content">
                    {#if settingsData}

                        <!-- SPOTIFY -->
                        <div class="settings-section">
                            <h2 class="settings-section-title">Spotify</h2>

                            <div class="settings-field">
                                <p class="settings-label">Client ID</p>
                                <input
                                    class="settings-input"
                                    type="text"
                                    placeholder="Spotify app client ID"
                                    bind:value={settingsData.spotifyClientId}
                                />
                            </div>

                            <button class="settings-btn spotify" onclick={spotifyLogin}>
                                Connect Spotify Account
                            </button>

                            <div class="settings-field">
                                <p class="settings-label">Themed Playlist URI</p>
                                <div class="settings-input-row">
                                    <input
                                        class="settings-input"
                                        type="text"
                                        placeholder="spotify:playlist:..."
                                        bind:value={settingsData.themedPlaylistUri}
                                    />
                                    <button class="settings-btn" onclick={saveThemedPlaylist}>Save</button>
                                </div>
                                <p class="settings-hint">Point to an existing Spotify playlist to use as your themed playlist</p>
                            </div>

                            <div class="settings-field">
                                <p class="settings-label">Master Playlist URI</p>
                                <div class="settings-input-row">
                                    <input
                                        class="settings-input"
                                        type="text"
                                        placeholder="spotify:playlist:..."
                                        bind:value={settingsData.masterPlaylistUri}
                                    />
                                    <button class="settings-btn" onclick={saveMasterPlaylist}>Import</button>
                                </div>
                                <p class="settings-hint">
                                    {#if masterImported !== null}
                                        ✓ Imported {masterImported} new songs
                                    {:else}
                                        All songs from this playlist will be added to your database with rating 0
                                    {/if}
                                </p>
                            </div>
                        </div>

                        <!-- SERVER -->
                        <div class="settings-section">
                            <h2 class="settings-section-title">Server</h2>

                            <div class="settings-field">
                                <p class="settings-label">Local Address</p>
                                <div class="settings-address">
                                    <span class="settings-address-text">{settingsData.localIp}:7878</span>
                                    <button class="copy-btn" onclick={() => navigator.clipboard.writeText(`${settingsData!.localIp}:7878`)}>Copy</button>
                                </div>
                            </div>

                            <div class="settings-field">
                                <div class="settings-toggle-row">
                                    <div>
                                        <p class="settings-label">External Access</p>
                                        <p class="settings-hint">Allow connections from outside your local network</p>
                                    </div>
                                    <button
                                        class="toggle {externalAccess ? 'on' : ''}"
                                        onclick={toggleExternalAccess}
                                        aria-label="Toggle external access"
                                    >
                                        <span class="toggle-knob"></span>
                                    </button>
                                </div>
                            </div>

                            {#if externalAccess}
                                <div class="settings-field">
                                    <p class="settings-label">Access Token</p>
                                    <div class="settings-input-row">
                                        <input
                                            class="settings-input"
                                            type={tokenVisible ? 'text' : 'password'}
                                            value={settingsData.secretToken}
                                            readonly
                                        />
                                        <button class="settings-icon-btn" onclick={() => tokenVisible = !tokenVisible}>
                                            {tokenVisible ? '🙈' : '👁'}
                                        </button>
                                        <button class="settings-icon-btn" onclick={() => navigator.clipboard.writeText(settingsData!.secretToken)}>
                                            ⎘
                                        </button>
                                        <button class="settings-icon-btn danger" onclick={regenerateToken}>↺</button>
                                    </div>
                                    <p class="settings-hint">Share this token with devices you want to allow access</p>
                                </div>
                            {/if}
                        </div>

                        <!-- RATING BEHAVIOR -->
                        <div class="settings-section">
                            <h2 class="settings-section-title">Rating Behavior</h2>
                            <p class="settings-hint" style="margin-bottom: 1rem">These values will be applied automatically when songs are skipped or replayed (coming soon)</p>

                            <div class="settings-field">
                                <div class="settings-toggle-row">
                                    <div>
                                        <p class="settings-label">Auto-Rating</p>
                                        <p class="settings-hint">Automatically apply skip/replay adjustments</p>
                                    </div>
                                    <button
                                        class="toggle {settingsData.autoRate ? 'on' : ''}"
                                        onclick={() => settingsData!.autoRate = !settingsData!.autoRate}
                                        aria-label="Toggle auto-rating"
                                    >
                                        <span class="toggle-knob"></span>
                                    </button>
                                </div>
                            </div>

                            <div class="settings-field">
                                <p class="settings-label">Skip Penalty <span class="value-badge">{settingsData.skipPenalty}</span></p>
                                <input
                                    type="range"
                                    min="-5"
                                    max="0"
                                    step="1"
                                    bind:value={settingsData.skipPenalty}
                                    class="settings-slider"
                                    style="--fill: {((settingsData.skipPenalty + 5) / 5) * 100}%"
                                />
                                <div class="range-labels">
                                    <span>-5</span>
                                    <span>0</span>
                                </div>
                            </div>

                            <div class="settings-field">
                                <p class="settings-label">Replay Bonus <span class="value-badge">{settingsData.replayBonus}</span></p>
                                <input
                                    type="range"
                                    min="0"
                                    max="5"
                                    step="1"
                                    bind:value={settingsData.replayBonus}
                                    class="settings-slider"
                                    style="--fill: {(settingsData.replayBonus / 5) * 100}%"
                                />
                                <div class="range-labels">
                                    <span>0</span>
                                    <span>+5</span>
                                </div>
                            </div>

                            <div class="settings-field">
                                <p class="settings-label">Min Allowable Rating <span class="value-badge">{settingsData.autoMin}</span></p>
                                <input
                                    type="range"
                                    min="-10"
                                    max="10"
                                    step="1"
                                    bind:value={settingsData.autoMin}
                                    class="settings-slider"
                                    style="--fill: {((settingsData.autoMin + 100) / 100) * 100}%"
                                />
                                <div class="range-labels">
                                    <span>-10</span>
                                    <span>10</span>
                                </div>
                            </div>

                            <div class="settings-field">
                                <p class="settings-label">Max Allowable Rating <span class="value-badge">{settingsData.autoMax}</span></p>
                                <input
                                    type="range"
                                    min="-10"
                                    max="10"
                                    step="1"
                                    bind:value={settingsData.autoMax}
                                    class="settings-slider"
                                    style="--fill: {(settingsData.autoMax / 100) * 100}%"
                                />
                                <div class="range-labels">
                                    <span>-10</span>
                                    <span>10</span>
                                </div>
                            </div>
                        </div>

                        <!-- SAVE -->
                        <div class="settings-save">
                            <button class="settings-btn primary {settingsSaved ? 'saved' : ''}" onclick={saveSettings}>
                                {settingsSaved ? '✓ Saved' : 'Save Changes'}
                            </button>
                        </div>

                    {:else}
                        <div class="empty">Loading settings...</div>
                    {/if}
                </div>
            {:else}
                <div class="song-list">
                    {#if songs.length === 0}
                        <div class="empty">No songs found</div>
                    {:else}
                        <div class="song-list-header">
                            <span class="col-title">Title</span>
                            <span class="col-artist">Artist</span>
                            <span class="col-rating">Rating</span>
                        </div>
                        {#each songs as song}
                            <div class="song-row">
                                <span class="col-title song-title">{song.title}</span>
                                <span class="col-artist song-artist">{song.artist}</span>
                                <span class="col-rating song-rating">{song.rating}</span>
                            </div>
                        {/each}
                    {/if}
                </div>
            {/if}
        </div>
    </main>

    <!-- RIGHT SIDEBAR -->
    <aside class="sidebar-right {rightOpen ? '' : 'collapsed'}">
        <button class="sidebar-toggle right" onclick={toggleRight} aria-label="Toggle right sidebar">
            {rightOpen ? '›' : '‹'}
        </button>

        {#if rightOpen}
            <div class="sidebar-top-box"></div>
            <div class="now-playing">
                {#if playbackState?.item?.type == 'track'}
                    {@const track = playbackState.item as Track}
                    {#if track.album?.images?.[0]?.url}
                        <img class="album-art" src={track.album.images[0].url} alt="Album art" />
                    {:else}
                        <div class="album-art-placeholder">♪</div>
                    {/if}
                    <p class="np-title">{track.name}</p>
                    <p class="np-artist">{track.artists?.map(a => a.name).join(', ') ?? ''}</p>
                {:else if playbackState?.item?.type == 'episode'}
                    {@const episode = playbackState.item as Episode}
                    {#if episode.images?.[0]?.url}
                        <img class="album-art" src={episode.images[0].url} alt="Episode art" />
                    {:else}
                        <div class="album-art-placeholder">♪</div>
                    {/if}
                    <p class="np-title">{episode.name}</p>
                    <p class="np-artist">{episode?.show?.name ?? ''}</p>
                {:else}
                    <div class="album-art-placeholder">♪</div>
                    <p class="np-title">Nothing Playing</p>
                    <p class="np-artist">—</p>
                {/if}
            </div>

            <div class="divider"></div>

            <div class="scroll-box">
                {#if getDefaultTheme()}
                    {@const theme = getDefaultTheme()!}
                    <div class="theme-rating-row">
                        <span class="theme-rating-name">{theme.name}</span>
                        <div class="rating-controls">
                            <button class="rating-btn" onclick={() => rate(theme.id, -3)}>-3</button>
                            <button class="rating-btn" onclick={() => rate(theme.id, -1)}>-1</button>
                            <span class="rating-value">{getRating(theme.id)}</span>
                            <button class="rating-btn" onclick={() => rate(theme.id, 1)}>+1</button>
                            <button class="rating-btn" onclick={() => rate(theme.id, 3)}>+3</button>
                        </div>
                    </div>
                {/if}
                {#each getNonDefaultThemes() as theme}
                    <div class="theme-rating-row">
                        <span class="theme-rating-name">{theme.name}</span>
                        <div class="rating-controls">
                            <button class="rating-btn" onclick={() => rate(theme.id, -3)}>-3</button>
                            <button class="rating-btn" onclick={() => rate(theme.id, -1)}>-1</button>
                            <span class="rating-value">{getRating(theme.id)}</span>
                            <button class="rating-btn" onclick={() => rate(theme.id, 1)}>+1</button>
                            <button class="rating-btn" onclick={() => rate(theme.id, 3)}>+3</button>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </aside>

    <!-- BOTTOM BAR -->
    <footer class="bottom-bar">
        <!-- LEFT: Track info -->
        <div class="track-info">
            {#if playbackState?.item?.type === 'track'}
                {@const track = playbackState.item as Track}
                <p class="track-name">{track.name}</p>
                <p class="track-artist">{track.artists?.map(a => a.name).join(', ') ?? '—'}</p>
            {:else if playbackState?.item?.type === 'episode'}
                {@const episode = playbackState.item as Episode}
                <p class="track-name">{episode.name}</p>
                <p class="track-artist">{episode?.show?.name ?? ''}</p>
            {:else}
                <p class="track-name">—</p>
                <p class="track-artist">—</p>
            {/if}
        </div>

        <!-- CENTER: Controls + Progress -->
        <div class="center-section">
            <div class="playback-controls">
                <button class="ctrl-btn" onclick={skipPrevious}>⏮</button>
                <button class="ctrl-btn play" onclick={() => playbackState?.is_playing ? pause() : play()}>
                    {playbackState?.is_playing ? '⏸' : '▶'}
                </button>
                <button class="ctrl-btn" onclick={skipNext}>⏭</button>
            </div>
            <div class="progress-section">
                <span class="time">{playbackState ? formatTime(playbackState.progress_ms) : '--:--'}</span>
                <input
                    type="range"
                    min="0"
                    max={playbackState?.item?.duration_ms ?? 100}
                    bind:value={playbackState!.progress_ms}
                    onchange={() => seek((playbackState!.progress_ms / (playbackState?.item?.duration_ms ?? 1)) * 100)}
                    class="progress-bar"
                    style="--fill: {progressPercent()}%"
                />
                <span class="time">{playbackState ? formatTime(playbackState.item?.duration_ms ?? 0) : '--:--'}</span>
            </div>
        </div>

        <!-- RIGHT: Volume + Device -->
        <div class="bottom-right">
            <div class="volume-control">
                <span class="volume-icon">
                    {#if !playbackState?.volume || playbackState.volume === 0}🔇
                    {:else if playbackState.volume < 50}🔉
                    {:else}🔊{/if}
                </span>
                <input
                    type="range"
                    min="0"
                    max="100"
                    bind:value={playbackState!.volume}
                    onchange={() => setVolume(playbackState!.volume)}
                    class="volume-bar"
                    style="--fill: {playbackState?.volume ?? 0}%"
                />
            </div>
            <button class="ctrl-btn device" onclick={async () => { await loadDevices(); showDevicePicker = true; }}>
                💻
            </button>
        </div>
    </footer>
</div>
 
<!-- MODALS -->

{#if showNewTheme}
    <div class="modal-overlay" role="button" tabindex="0" onclick={() => showNewTheme = false} onkeydown={(e) => e.key === 'Escape' && (showNewTheme = false)}>
        <div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
            <h3 class="modal-title">New Theme</h3>
            <input
                class="modal-input"
                type="text"
                placeholder="Theme name"
                bind:value={newThemeName}
                onkeydown={(e) => e.key === 'Enter' && createTheme()}
            />
            <div class="field">
                <p class="field-label">Clone Ratings From</p>
                <select class="modal-select" bind:value={cloneFromThemeId}>
                    <option value={null}>None</option>
                    {#each themes as theme}
                        <option value={theme.id}>{theme.name}</option>
                    {/each}
                </select>
            </div>
            <div class="modal-actions">
                <button class="modal-btn" onclick={() => showNewTheme = false}>Cancel</button>
                <button class="modal-btn primary" onclick={createTheme}>Create</button>
            </div>
        </div>
    </div>
{/if}

{#if showSavePlaylist}
    <div class="modal-overlay" role="button" tabindex="0" onclick={() => showSavePlaylist = false} onkeydown={(e) => e.key === 'Escape' && (showSavePlaylist = false)}>
        <div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
            <h3 class="modal-title">Save Playlist</h3>
            <input
                class="modal-input"
                type="text"
                placeholder="Playlist name"
                bind:value={savePlaylistName}
            />
            <div class="toggle-row">
                <span class="toggle-label">Dynamic</span>
                <button
                    aria-label="Toggle Dynamic"
                    class="toggle {savePlaylistDynamic ? 'on' : ''}"
                    onclick={() => savePlaylistDynamic = !savePlaylistDynamic}
                >
                    <span class="toggle-knob"></span>
                </button>
            </div>
            <p class="modal-hint">
                {savePlaylistDynamic
                    ? 'Dynamic: updates automatically as ratings change'
                    : 'Frozen: saves current songs, does not update'}
            </p>
            <div class="modal-actions">
                <button class="modal-btn" onclick={() => showSavePlaylist = false}>Cancel</button>
                <button class="modal-btn primary" onclick={savePlaylist}>Save</button>
            </div>
        </div>
    </div>
{/if}

{#if showDeleteConfirm && deleteTarget}
    <div class="modal-overlay" role="button" tabindex="0" onclick={() => showDeleteConfirm = false} onkeydown={(e) => e.key === 'Escape' && (showDeleteConfirm = false)}>
        <div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
            <h3 class="modal-title">Delete {deleteTarget.type === 'theme' ? 'Theme' : 'Playlist'}</h3>
            <p class="modal-body">
                Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
                {#if deleteTarget.type === 'theme'}
                    This will also delete all ratings for this theme.
                {/if}
                This cannot be undone.
            </p>
            <div class="modal-actions">
                <button class="modal-btn" onclick={() => showDeleteConfirm = false}>Cancel</button>
                <button class="modal-btn danger" onclick={confirmDelete}>Delete</button>
            </div>
        </div>
    </div>
{/if}
        
{#if showDevicePicker}
    <div class="modal-overlay" role="button" tabindex="0" onclick={() => showDevicePicker = false} onkeydown={(e) => e.key === 'Escape' && (showDevicePicker = false)}>
        <div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
            <h3 class="modal-title">Select Device</h3>
            {#each devices as device}
                <button
                    class="device-row {playbackState?.device?.id === device.id ? 'active' : ''}"
                    onclick={() => connectDevice(device.id)}
                >
                    <span class="device-name">{device.name}</span>
                    <span class="device-type">{device.type}</span>
                </button>
            {/each}
            {#if devices.length === 0}
                <p class="modal-body">No devices found. Open Spotify on a device first.</p>
            {/if}
        </div>
    </div>
{/if}

<!-------------------- STYLE -------------------->
 
<style>
    :global(*) { margin: 0; padding: 0; box-sizing: border-box; }
    :global(body) {
        background: #0e0e0f;
        color: #e8e4dc;
        font-family: 'DM Mono', monospace;
        overflow: hidden;
        height: 100vh;
    }
 
    .app {
        display: grid;
        grid-template-columns: var(--left-width, 220px) 1fr var(--right-width, 220px);
        grid-template-rows: 1fr 90px;
        grid-template-areas:
            'sidebar-left main sidebar-right'
            'bottom bottom bottom';
        height: 100vh;
        transition: grid-template-columns 0.2s ease;
    }
 
    .bg-grid {
        position: fixed;
        inset: 0;
        background-image:
            linear-gradient(rgba(255, 140, 40, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 140, 40, 0.03) 1px, transparent 1px);
        background-size: 40px 40px;
        pointer-events: none;
        z-index: 0;
    }
 
    .sidebar-left {
        grid-area: sidebar-left;
        background: rgba(10, 10, 11, 0.95);
        border-right: 1px solid rgba(255, 140, 40, 0.1);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
        z-index: 1;
        transition: width 0.2s ease;
    }

    .sidebar-right {
        grid-area: sidebar-right;
        background: rgba(10, 10, 11, 0.95);
        border-left: 1px solid rgba(255, 140, 40, 0.1);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
        z-index: 1;
        transition: width 0.2s ease;
    }

    .sidebar-top-box {
        position: relative;
        height: 40px;
    }

    .sidebar-left.collapsed,
    .sidebar-right.collapsed {
        cursor: pointer;
    }

    .sidebar-toggle {
        position: absolute;
        top: 0;
        width: 40px;
        height: 40px;
        background: none;
        border: none;
        color: #4a4640;
        font-size: 1rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s;
        z-index: 2;
    }

    .sidebar-toggle.left {
        right: 0;
    }
    
    .sidebar-toggle.right {
        left: 0;
    }

    .sidebar-toggle:hover {
        color: #ff8c28;
    }

    .appname {
        font-family: 'Syne', sans-serif;
        font-weight: 800;
        font-size: 1.2rem;
        letter-spacing: 0.2em;
        color: #ff8c28;
        display: flex;
        align-items: center;
        padding: 0 1.25rem;
        height: 100%;
        border-bottom: 1px solid rgba(255, 140, 40, 0.1);
        margin-bottom: 1rem;
    }
 
    .sidebar-item {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        width: 100%;
        padding: 0.5rem 1.25rem;
        background: none;
        border: none;
        color: #6b6660;
        font-family: 'DM Mono', monospace;
        font-size: 0.78rem;
        text-align: left;
        cursor: pointer;
        transition: color 0.15s, background 0.15s;
    }
 
    .sidebar-item:hover { color: #c8c4bc; background: rgba(255,255,255,0.03); }
    .sidebar-item.active { color: #ff8c28; background: rgba(255, 140, 40, 0.08); }
    .sidebar-item.themed { margin-bottom: 0.5rem; }
 
    .item-icon { font-size: 0.7rem; flex-shrink: 0; }
    .item-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
 
    .sidebar-item-row { display: flex; align-items: center; }
 
    .sidebar-footer {
        margin-top: auto;
        padding: 0.4rem 1.25rem;
        border-top: 1px solid rgba(255,255,255,0.05);
    }
 
    .play-btn {
        background: none;
        border: none;
        color: #4a4640;
        font-size: 0.65rem;
        padding: 0.5rem 0.75rem 0.5rem 0;
        cursor: pointer;
        transition: color 0.15s;
        flex-shrink: 0;
    }
 
    .play-btn:hover { color: #ff8c28; }
 
    .section { margin-bottom: 0.5rem; }
 
    .section-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.4rem 1.25rem;
        background: none;
        border: none;
        color: #4a4640;
        font-family: 'DM Mono', monospace;
        font-size: 0.68rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        cursor: pointer;
        transition: color 0.15s;
        text-align: left;
    }
 
    .section-header:hover { color: #8a8480; }
 
    .chevron {
        display: inline-block;
        transition: transform 0.2s;
        font-size: 0.9rem;
    }
 
    .chevron.open { transform: rotate(90deg); }
    .section-items { padding-bottom: 0.25rem; }
 
    .add-btn {
        width: 100%;
        padding: 0.4rem 1.25rem;
        background: none;
        border: none;
        color: #4a4640;
        font-family: 'DM Mono', monospace;
        font-size: 0.75rem;
        text-align: left;
        cursor: pointer;
        transition: color 0.15s;
    }
 
    .add-btn:hover { color: #ff8c28; }
 
    .main {
        grid-area: main;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        position: relative;
        z-index: 1;
    }
 
    .main-header {
        padding: 1.5rem 2rem 0;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        flex-shrink: 0;
    }
 
    .main-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
    }
 
    .main-title {
        font-family: 'Syne', sans-serif;
        font-size: 1.8rem;
        font-weight: 800;
        color: #f0ebe0;
    }
 
    .main-actions { display: flex; gap: 0.5rem; }
 
    .action-btn {
        background: rgba(255, 140, 40, 0.1);
        border: 1px solid rgba(255, 140, 40, 0.2);
        border-radius: 6px;
        color: #ff8c28;
        font-family: 'DM Mono', monospace;
        font-size: 0.75rem;
        padding: 0.4rem 0.9rem;
        cursor: pointer;
        transition: background 0.15s;
    }
 
    .action-btn:hover { background: rgba(255, 140, 40, 0.2); }
    .action-btn.danger {
        background: rgba(255, 80, 60, 0.1);
        border-color: rgba(255, 80, 60, 0.2);
        color: #ff6050;
    }
    .action-btn.danger:hover { background: rgba(255, 80, 60, 0.2); }
 
    .search-row {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        padding-bottom: 1rem;
    }
 
    .search-input {
        flex: 1;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 6px;
        padding: 0.5rem 0.75rem;
        color: #e8e4dc;
        font-family: 'DM Mono', monospace;
        font-size: 0.8rem;
        outline: none;
        transition: border-color 0.15s;
    }
 
    .search-input:focus { border-color: rgba(255, 140, 40, 0.4); }
 
    .sort-btns { display: flex; gap: 0.4rem; }
 
    .sort-btn {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 6px;
        color: #6b6660;
        font-family: 'DM Mono', monospace;
        font-size: 0.72rem;
        padding: 0.4rem 0.7rem;
        cursor: pointer;
        transition: all 0.15s;
        white-space: nowrap;
    }
 
    .sort-btn:hover { color: #c8c4bc; }
    .sort-btn.active { border-color: rgba(255, 140, 40, 0.3); color: #ff8c28; }
 
    .builder {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        padding-bottom: 1rem;
        flex-wrap: wrap;
    }
 
    .builder-select, .builder-input {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 6px;
        padding: 0.45rem 0.7rem;
        color: #e8e4dc;
        font-family: 'DM Mono', monospace;
        font-size: 0.78rem;
        outline: none;
        transition: border-color 0.15s;
    }
 
    .builder-select:focus, .builder-input:focus { border-color: rgba(255, 140, 40, 0.4); }
    .builder-input { width: 90px; }
 
    .song-list {
        flex: 1;
        padding: 0 2rem;
    }
 
    .song-list-header {
        display: grid;
        grid-template-columns: 1fr 1fr 80px;
        padding: 0.75rem 0.5rem;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        font-size: 0.68rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #4a4640;
        position: sticky;
        top: 0;
        background: #0e0e0f;
    }
 
    .song-row {
        display: grid;
        grid-template-columns: 1fr 1fr 80px;
        padding: 0.6rem 0.5rem;
        border-bottom: 1px solid rgba(255,255,255,0.03);
        transition: background 0.1s;
    }
 
    .song-row:hover { background: rgba(255,255,255,0.02); }
 
    .song-title { color: #c8c4bc; font-size: 0.82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .song-artist { color: #6b6660; font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .song-rating { color: #ff8c28; font-size: 0.82rem; text-align: right; }
    .col-rating { text-align: right; }
 
    .empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 200px;
        color: #4a4640;
        font-size: 0.85rem;
    }
 
    .now-playing {
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        flex-shrink: 0;
    }
 
    .album-art {
        width: 160px;
        height: 160px;
        border-radius: 8px;
        object-fit: cover;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        margin-bottom: 0.5rem;
    }
 
    .album-art-placeholder {
        width: 160px;
        height: 160px;
        border-radius: 8px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
        color: #4a4640;
        margin-bottom: 0.5rem;
    }
 
    .np-title {
        font-family: 'Syne', sans-serif;
        font-size: 0.95rem;
        font-weight: 700;
        color: #f0ebe0;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        width: 100%;
    }
 
    .np-artist {
        font-size: 0.78rem;
        color: #6b6660;
        text-align: center;
    }
 
    .divider {
        height: 1px;
        background: rgba(255,255,255,0.05);
        margin: 0 1.5rem;
        flex-shrink: 0;
    }
 
    .scroll-box {
        flex: 1;
        overflow-y: auto;
    }
 
    .theme-rating-row {
        padding: 0.5rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        border-bottom: 1px solid rgba(255,255,255,0.03);
    }
 
    .theme-rating-name {
        font-size: 0.72rem;
        color: #8a8480;
        letter-spacing: 0.05em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
 
    .rating-controls {
        display: flex;
        align-items: center;
        gap: 0.3rem;
    }
 
    .rating-btn {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 4px;
        color: #8a8480;
        font-family: 'DM Mono', monospace;
        font-size: 0.68rem;
        padding: 0.25rem 0.4rem;
        cursor: pointer;
        transition: all 0.15s;
        flex: 1;
    }
 
    .rating-btn:hover {
        border-color: rgba(255, 140, 40, 0.3);
        color: #ff8c28;
        background: rgba(255, 140, 40, 0.08);
    }
 
    .rating-value {
        font-size: 0.85rem;
        color: #ff8c28;
        font-weight: 500;
        min-width: 28px;
        text-align: center;
        flex-shrink: 0;
    }
 
    .bottom-bar {
        grid-area: bottom;
        display: grid;
        grid-template-columns: 220px 1fr 220px;
        align-items: center;
        padding: 0 1.5rem;
        gap: 1rem;
        background: rgba(10, 10, 11, 0.98);
        border-top: 1px solid rgba(255, 140, 40, 0.1);
        position: relative;
        z-index: 10;
    }
 
    .track-info {
        overflow: hidden;
    }
 
    .track-name {
        font-size: 0.82rem;
        color: #c8c4bc;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .track-artist {
        font-size: 0.72rem;
        color: #6b6660;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .center-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
        min-width: 0;
    }
 
    .playback-controls {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
    }

    .progress-section {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        min-width: 0;
    }

    .bottom-right {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.5rem;
        min-width: 0;
        overflow: hidden;
        container-type: inline-size;
    }

    .volume-control {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1;
        min-width: 0;
    }
 
    .time {
        font-size: 0.68rem;
        color: #4a4640;
        flex-shrink: 0;
        min-width: 32px;
    }

    .volume-icon {
        font-size: 0.85rem;
        color: #6b6660;
        overflow: hidden;
    }

    .progress-bar,
    .volume-bar {
        appearance: none;
        flex: 1;
        height: 4px;
        border-radius: 999px;
        padding: 0;
        cursor: pointer;
        position: relative;
        background: linear-gradient(
            to right,
            #ff8c28 var(--fill, 0%),
            rgba(255,255,255,0.08) var(--fill, 0%)
        );
        overflow: hidden;
    }

    .progress-bar {
        min-width: 100px;
    }

    .volume-bar {
        min-width: 40px;
    }

    .progress-bar::-webkit-slider-thumb,
    .volume-bar::-webkit-slider-thumb {
        appearance: none;
        width: 12px;
        height: 12px;
        background: #ff8c28;
        border-radius: 50%;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s;
        box-shadow: 0 0 8px rgba(255, 140, 40, 0.4);
        overflow: hidden;
    }

    .progress-bar:hover::-webkit-slider-thumb,
    .volume-bar:hover::-webkit-slider-thumb {
        opacity: 1;
    }
 
    .ctrl-btn {
        background: none;
        border: none;
        color: #6b6660;
        font-size: 1rem;
        cursor: pointer;
        padding: 0.4rem;
        transition: color 0.15s;
        border-radius: 50%;
    }
 
    .ctrl-btn:hover { color: #c8c4bc; }
 
    .ctrl-btn.play {
        background: #ff8c28;
        color: #0e0e0f;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        font-size: 0.85rem;
    }
 
    .ctrl-btn.play:hover { background: #ffaa55; color: #0e0e0f; }
 
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
        backdrop-filter: blur(4px);
    }
 
    .modal {
        background: #161617;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        padding: 2rem;
        width: 380px;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
 
    .modal-title {
        font-family: 'Syne', sans-serif;
        font-size: 1.1rem;
        font-weight: 700;
        color: #f0ebe0;
    }
 
    .modal-body {
        font-size: 0.82rem;
        color: #8a8480;
        line-height: 1.6;
    }
 
    .modal-body strong { color: #c8c4bc; }
 
    .modal-input {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 0.6rem 0.8rem;
        color: #e8e4dc;
        font-family: 'DM Mono', monospace;
        font-size: 0.85rem;
        outline: none;
        transition: border-color 0.15s;
        width: 100%;
    }
 
    .modal-input:focus { border-color: rgba(255, 140, 40, 0.4); }
 
    .modal-hint {
        font-size: 0.72rem;
        color: #5a5650;
        line-height: 1.5;
    }
 
    .modal-actions {
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
    }
 
    .modal-btn {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 6px;
        color: #8a8480;
        font-family: 'DM Mono', monospace;
        font-size: 0.78rem;
        padding: 0.5rem 1rem;
        cursor: pointer;
        transition: all 0.15s;
    }
 
    .modal-btn:hover { color: #c8c4bc; background: rgba(255,255,255,0.08); }
 
    .modal-btn.primary {
        background: rgba(255, 140, 40, 0.15);
        border-color: rgba(255, 140, 40, 0.3);
        color: #ff8c28;
    }
 
    .modal-btn.primary:hover { background: rgba(255, 140, 40, 0.25); }
 
    .modal-btn.danger {
        background: rgba(255, 80, 60, 0.1);
        border-color: rgba(255, 80, 60, 0.25);
        color: #ff6050;
    }
 
    .modal-btn.danger:hover { background: rgba(255, 80, 60, 0.2); }
 
    .toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
 
    .toggle-label { font-size: 0.82rem; color: #8a8480; }
 
    .toggle {
        width: 44px;
        height: 24px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 999px;
        cursor: pointer;
        position: relative;
        transition: all 0.25s;
    }
 
    .toggle.on {
        background: rgba(255, 140, 40, 0.3);
        border-color: rgba(255, 140, 40, 0.5);
    }
 
    .toggle-knob {
        position: absolute;
        top: 3px;
        left: 3px;
        width: 16px;
        height: 16px;
        background: #6b6660;
        border-radius: 50%;
        transition: all 0.25s;
    }
 
    .toggle.on .toggle-knob {
        transform: translateX(20px);
        background: #ff8c28;
    }

    .device-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 0.75rem 0.5rem;
        background: none;
        border: none;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        color: #8a8480;
        font-family: 'DM Mono', monospace;
        font-size: 0.82rem;
        cursor: pointer;
        transition: all 0.15s;
        border-radius: 6px;
    }

    .device-row:hover { background: rgba(255,255,255,0.04); color: #c8c4bc; }
    .device-row.active { color: #ff8c28; }

    .device-type {
        font-size: 0.68rem;
        color: #4a4640;
        text-transform: uppercase;
        letter-spacing: 0.08em;
    }

    /* Settings CSS */

    .settings-content {
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem 2rem;
        display: flex;
        flex-direction: column;
        gap: 2rem;
    }

    .settings-section {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 12px;
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }

    .settings-section:hover {
        border-color: rgba(255, 140, 40, 0.2);
    }

    .settings-section-title {
        font-family: 'Syne', sans-serif;
        font-size: 1rem;
        font-weight: 700;
        color: #f0ebe0;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .settings-field {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    .settings-label {
        font-size: 0.72rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #8a8480;
    }

    .settings-input {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 0.6rem 0.8rem;
        color: #e8e4dc;
        font-family: 'DM Mono', monospace;
        font-size: 0.85rem;
        outline: none;
        transition: border-color 0.15s;
        width: 100%;
    }

    .settings-input:focus { border-color: rgba(255, 140, 40, 0.4); }
    .settings-input[readonly] { color: #6b6660; cursor: default; }

    .settings-input-row {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .settings-input-row .settings-input { flex: 1; }

    .settings-hint {
        font-size: 0.72rem;
        color: #5a5650;
        line-height: 1.5;
    }

    .settings-address {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 0.6rem 0.8rem;
    }

    .settings-address-text {
        flex: 1;
        font-size: 0.85rem;
        color: #ff8c28;
    }

    .copy-btn {
        background: rgba(255, 140, 40, 0.1);
        border: 1px solid rgba(255, 140, 40, 0.2);
        border-radius: 6px;
        color: #ff8c28;
        font-family: 'DM Mono', monospace;
        font-size: 0.72rem;
        padding: 0.25rem 0.6rem;
        cursor: pointer;
        transition: background 0.2s;
    }

    .copy-btn:hover { background: rgba(255, 140, 40, 0.2); }

    .settings-toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
    }

    .settings-icon-btn {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        color: #8a8480;
        font-size: 0.95rem;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.15s;
        flex-shrink: 0;
    }

    .settings-icon-btn:hover { background: rgba(255,255,255,0.1); color: #e8e4dc; }
    .settings-icon-btn.danger:hover {
        background: rgba(255, 80, 60, 0.15);
        border-color: rgba(255, 80, 60, 0.3);
        color: #ff6050;
    }

    .settings-btn {
        background: rgba(255, 140, 40, 0.1);
        border: 1px solid rgba(255, 140, 40, 0.2);
        border-radius: 8px;
        color: #ff8c28;
        font-family: 'DM Mono', monospace;
        font-size: 0.78rem;
        padding: 0.6rem 1rem;
        cursor: pointer;
        transition: background 0.15s;
        white-space: nowrap;
    }

    .settings-btn:hover { background: rgba(255, 140, 40, 0.2); }

    .settings-btn.spotify {
        background: rgba(30, 215, 96, 0.1);
        border-color: rgba(30, 215, 96, 0.25);
        color: #1ed760;
    }

    .settings-btn.spotify:hover { background: rgba(30, 215, 96, 0.18); }

    .settings-btn.primary {
        background: #ff8c28;
        border: none;
        color: #0e0e0f;
        padding: 0.75rem 2rem;
    }

    .settings-btn.primary:hover { background: #ffaa55; }
    .settings-btn.primary.saved {
        background: rgba(30, 215, 96, 0.2);
        border: 1px solid rgba(30, 215, 96, 0.4);
        color: #1ed760;
    }

    .settings-slider {
        appearance: none;
        width: 100%;
        height: 4px;
        border-radius: 999px;
        outline: none;
        border: none;
        padding: 0;
        cursor: pointer;
        background: linear-gradient(
            to right,
            #ff8c28 var(--fill, 0%),
            rgba(255,255,255,0.08) var(--fill, 0%)
        );
    }

    .settings-slider::-webkit-slider-thumb {
        appearance: none;
        width: 14px;
        height: 14px;
        background: #ff8c28;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 8px rgba(255, 140, 40, 0.4);
    }

    .range-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.68rem;
        color: #5a5650;
    }

    .value-badge {
        display: inline-block;
        background: rgba(255, 140, 40, 0.15);
        border: 1px solid rgba(255, 140, 40, 0.25);
        border-radius: 4px;
        color: #ff8c28;
        font-size: 0.7rem;
        padding: 0.1rem 0.4rem;
        margin-left: 0.5rem;
    }

    .settings-save {
        display: flex;
        justify-content: flex-end;
        padding-bottom: 1rem;
    }

    /* Scrollbar Stuff */
 
    :global(::-webkit-scrollbar) { width: 4px; }
    :global(::-webkit-scrollbar-track) { background: transparent; }
    :global(::-webkit-scrollbar-thumb) { background: rgba(255,255,255,0.08); border-radius: 999px; }
    :global(::-webkit-scrollbar-thumb:hover) { background: rgba(255,255,255,0.15); }
</style>