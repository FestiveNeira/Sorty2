<!--
This is the main frontend file and the page that users will most often interact with.
It contains all logic for the app to function and can communicate with the server directly via http and websockets.Page
todo: rip css to a different file
todo: build overlay
todo: rip the queue logic to PlaybackStore.svelte
todo: sort everything in all files, code is a bit disorganized
-->

<script lang="ts">
    import PlaybackState from '$lib/player/PlaybackState.svelte';
    import LibraryState from '$lib/player/LibraryState.svelte';
    import NavigatorState from '$lib/player/NavigatorState.svelte';
    import playerController from '$lib/player/playerController';
    import libraryController from '$lib/player/libraryController';
    import navigatorController from '$lib/player/navigatorController';
    import type { Track, Episode } from '@spotify/web-api-ts-sdk';
    import { onMount, onDestroy } from 'svelte';

    // ---------- STATE ----------
    // Events
    import { io } from 'socket.io-client';
    const socket = io(window.location.origin);

    // There is a moment on startup where playbackstate will not be populated, this should not cause any errors and should rectify quickly
    const loadStateDelay = 300;

    // ---------- LIFECYCLE ----------

    function handleResize() {
        NavigatorState.handleResize();
    }

    onMount(async () => {
        // Load App Data
        await libraryController.loadThemes();
        await libraryController.loadPlaylists();
        await libraryController.loadThemedPlaylistSongs();
        await libraryController.loadBuilderPreview();

        // Update When Focused
        document.addEventListener('visibilitychange', handleVisibilityChange);
        // Format Window
        window.addEventListener('resize', handleResize);
        setTimeout(handleResize, 500);

        // Event triggers
        // todo: restore once player.ts/playerAPI is wired back in
        socket.on('playbackStateUpdate', (queueChanged: boolean = false) => setTimeout(() => playerController.loadPlaybackState(queueChanged), loadStateDelay));
    });

    onDestroy(() => {
        // todo: clearInterval(progressInterval) and remove all player related processes
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('resize', handleResize);
        socket.disconnect();
    });

    // ---------- EFFECTS ----------

    $effect(() => {
        if (LibraryState.builderThemeId && NavigatorState.selectedView === 'themed') {
            libraryController.loadBuilderPreview();
        }
    });

    // ---------- PLAYBACK CORE ----------

    async function handleVisibilityChange() {
        if (document.visibilityState === 'visible') {
            await playerController.loadPlaybackState(true);
        }
    }

    // ---------- HELPERS ----------

    function formatTime(ms: number): string {
        const total = Math.floor(ms / 1000);
        const m = Math.floor(total / 60);
        const s = total % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

</script>
 
<svelte:head>
    <title>Sorty</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap" rel="stylesheet">
</svelte:head>
 
<div class="app"
    style="
        --left-width: {NavigatorState.leftOpen ? '220px' : '40px'};
        --right-width: {NavigatorState.rightOpen ? '220px' : '40px'};
    "
>
    <!-- <audio id="player" style="display:none" autoplay></audio> todo: may need but probably not -->
    <audio id="silent-player" style="display:none" autoplay></audio>

    <div class="bg-grid"></div>

    <!-- LEFT SIDEBAR -->
    <aside class="sidebar-left {NavigatorState.leftOpen ? '' : 'collapsed'}">
        <button class="sidebar-toggle left" onclick={() => NavigatorState.toggleLeft()} aria-label="Toggle left sidebar">
            {NavigatorState.leftOpen ? '‹' : '›'}
        </button>
        
        {#if NavigatorState.leftOpen}
            <div class="sidebar-top-box">
                <div class="appname">SORTY</div>
            </div>

            <div class="scroll-box">
                <button
                    class="sidebar-item themed {NavigatorState.selectedView === 'themed' ? 'active' : ''}"
                    onclick={() => navigatorController.selectThemed()}
                >
                    <span class="item-icon">⚡</span>
                    <span class="item-label">Themed Playlist</span>
                </button>

                <div class="section">
                    <button class="section-header" onclick={() => NavigatorState.playlistsOpen = !NavigatorState.playlistsOpen}>
                        <span class="chevron {NavigatorState.playlistsOpen ? 'open' : ''}">›</span>
                        <span>Saved Playlists</span>
                    </button>
                    {#if NavigatorState.playlistsOpen}
                        <div class="section-items">
                            {#each LibraryState.playlists as playlist}
                                <div class="sidebar-item-row">
                                    <button
                                        class="sidebar-item {NavigatorState.selectedView === 'playlist' && NavigatorState.selectedId === playlist.id ? 'active' : ''}"
                                        onclick={() => navigatorController.selectPlaylist(playlist)}
                                    >
                                        <span class="item-icon">◈</span>
                                        <span class="item-label">{playlist.name}</span>
                                    </button>
                                    <button class="play-btn" onclick={() => playerController.playSavedPlaylist(playlist.id)}>▶</button>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>

                <div class="section">
                    <button class="section-header" onclick={() => NavigatorState.themesOpen = !NavigatorState.themesOpen}>
                        <span class="chevron {NavigatorState.themesOpen ? 'open' : ''}">›</span>
                        <span>Themes</span>
                    </button>
                    {#if NavigatorState.themesOpen}
                        <div class="section-items">
                            {#if LibraryState.getDefaultTheme()}
                                {@const theme = LibraryState.getDefaultTheme()!}
                                <div class="sidebar-item-row">
                                    <button
                                        class="sidebar-item {NavigatorState.selectedView === 'theme' && NavigatorState.selectedId === theme.id ? 'active' : ''}"
                                        onclick={() => navigatorController.selectTheme(theme)}
                                    >
                                        <span class="item-icon">★</span>
                                        <span class="item-label">{theme.name}</span>
                                    </button>
                                    <button class="play-btn" onclick={() => playerController.playTheme(theme.id)}>▶</button>
                                </div>
                            {/if}
                            {#each LibraryState.getNonDefaultThemes() as theme}
                                <div class="sidebar-item-row">
                                    <button
                                        class="sidebar-item {NavigatorState.selectedView === 'theme' && NavigatorState.selectedId === theme.id ? 'active' : ''}"
                                        onclick={() => navigatorController.selectTheme(theme)}
                                    >
                                        <span class="item-icon">◆</span>
                                        <span class="item-label">{theme.name}</span>
                                    </button>
                                    <button class="play-btn" onclick={() => playerController.playTheme(theme.id)}>▶</button>
                                </div>
                            {/each}
                            <button class="add-btn" onclick={() => NavigatorState.showNewTheme = true}>+ Add Theme</button>
                        </div>
                    {/if}
                </div>

                <div class="sidebar-footer">
                    <button 
                        class="sidebar-item {NavigatorState.selectedView === 'settings' ? 'active' : ''}"
                        onclick={() => navigatorController.selectSettings()}
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
                <h1 class="main-title">{NavigatorState.contentTitle}</h1>
                <div class="main-actions">
                    {#if NavigatorState.selectedView === 'theme' && NavigatorState.selectedId}
                        <button class="action-btn" onclick={() => playerController.playTheme(NavigatorState.selectedId!)}>▶ Play</button>
                        {#if !LibraryState.themes.find(t => t.id === NavigatorState.selectedId)?.is_default}
                            <button class="action-btn danger" onclick={() => {
                                const theme = LibraryState.themes.find(t => t.id === NavigatorState.selectedId);
                                if (theme) NavigatorState.requestDeleteTheme(theme);
                            }}>Delete</button>
                        {/if}
                    {/if}
                    {#if NavigatorState.selectedView === 'playlist' && NavigatorState.selectedId}
                        <button class="action-btn" onclick={() => playerController.playSavedPlaylist(NavigatorState.selectedId!)}>▶ Play</button>
                        <button class="action-btn danger" onclick={() => {
                            const playlist = LibraryState.playlists.find(p => p.id === NavigatorState.selectedId);
                            if (playlist) NavigatorState.requestDeletePlaylist(playlist);
                        }}>Delete</button>
                    {/if}
                    {#if NavigatorState.selectedView === 'themed'}
                        <button class="action-btn" onclick={() => NavigatorState.showSavePlaylist = true}>Save Playlist</button>
                    {/if}
                </div>
            </div>

            {#if NavigatorState.selectedView === 'theme'}
                <div class="search-row">
                    <input
                        class="search-input"
                        type="text"
                        placeholder="Search songs, artists..."
                        bind:value={LibraryState.search}
                        oninput={() => navigatorController.applySearch()}
                    />
                    <div class="sort-btns">
                        <button class="sort-btn {LibraryState.sortBy === 'rating' ? 'active' : ''}" onclick={() => navigatorController.applySort('rating')}>
                            Rating {LibraryState.sortBy === 'rating' ? (LibraryState.sortOrder === 'DESC' ? '↓' : '↑') : ''}
                        </button>
                        <button class="sort-btn {LibraryState.sortBy === 'name' ? 'active' : ''}" onclick={() => navigatorController.applySort('name')}>
                            Name {LibraryState.sortBy === 'name' ? (LibraryState.sortOrder === 'DESC' ? '↓' : '↑') : ''}
                        </button>
                        <button class="sort-btn {LibraryState.sortBy === 'artist' ? 'active' : ''}" onclick={() => navigatorController.applySort('artist')}>
                            Artist {LibraryState.sortBy === 'artist' ? (LibraryState.sortOrder === 'DESC' ? '↓' : '↑') : ''}
                        </button>
                    </div>
                </div>
            {/if}

            {#if NavigatorState.selectedView === 'themed'}
                <div class="builder">
                    <select class="builder-select" bind:value={LibraryState.builderThemeId}>
                        {#each LibraryState.themes as theme}
                            <option value={theme.id}>{theme.name}</option>
                        {/each}
                    </select>
                    <input class="builder-input" type="number" placeholder="Min rating" bind:value={LibraryState.builderRatingMin} />
                    <input class="builder-input" type="number" placeholder="Max rating" bind:value={LibraryState.builderRatingMax} />
                    <select class="builder-select" bind:value={LibraryState.builderSort}>
                        <option value="top">Top</option>
                        <option value="bottom">Bottom</option>
                        <option value="random">Random</option>
                    </select>
                    <input class="builder-input" type="number" placeholder="Limit" bind:value={LibraryState.builderLimit} />
                    <button class="action-btn" onclick={async () => {
                        // todo: not sure if this is the best way to do this but i do need to make sure that the playlist updates before the playlist plays so idk.
                        let uri = await libraryController.updateThemedPlaylist();
                        if (uri) playerController.play(uri);
                    }}>▶ Play</button>
                    <button class="action-btn" onclick={() => NavigatorState.showSavePlaylist = true}>Save</button>
                </div>
            {/if}
        </div>

        <div class="scroll-box">
            {#if NavigatorState.selectedView === 'settings'}
                <div class="settings-content">
                    {#if LibraryState.settingsData}

                        <!-- SPOTIFY -->
                        <div class="settings-section">
                            <h2 class="settings-section-title">Spotify</h2>

                            <div class="settings-field">
                                <p class="settings-label">Client ID</p>
                                <input
                                    class="settings-input"
                                    type="text"
                                    placeholder="Spotify app client ID"
                                    bind:value={LibraryState.settingsData.spotifyClientId}
                                />
                            </div>

                            <button class="settings-btn spotify" onclick={() => libraryController.spotifyLogin()}>
                                Connect Spotify Account
                            </button>

                            <div class="settings-field">
                                <p class="settings-label">Themed Playlist URI</p>
                                <div class="settings-input-row">
                                    <input
                                        class="settings-input"
                                        type="text"
                                        placeholder="spotify:playlist:..."
                                        bind:value={LibraryState.settingsData.themedPlaylistUri}
                                    />
                                    <button class="settings-btn" onclick={() => libraryController.saveThemedPlaylist()}>Save</button>
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
                                        bind:value={LibraryState.settingsData.masterPlaylistUri}
                                    />
                                    <!-- import doesn't seem to be working to add missing songs atm -->
                                    <button class="settings-btn" onclick={() => libraryController.saveMasterPlaylist()}>Import</button>
                                </div>
                                <p class="settings-hint">
                                    {#if LibraryState.masterImported !== null}
                                        ✓ Imported {LibraryState.masterImported} new songs
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
                                    <span class="settings-address-text">{LibraryState.settingsData.localIp}:7878</span>
                                    <button class="copy-btn" onclick={() => navigator.clipboard.writeText(`${LibraryState.settingsData!.localIp}:7878`)}>Copy</button>
                                </div>
                            </div>

                            <div class="settings-field">
                                <div class="settings-toggle-row">
                                    <div>
                                        <p class="settings-label">External Access</p>
                                        <p class="settings-hint">Allow connections from outside your local network</p>
                                    </div>
                                    <button
                                        class="toggle {LibraryState.externalAccess ? 'on' : ''}"
                                        onclick={() => libraryController.toggleExternalAccess()}
                                        aria-label="Toggle external access"
                                    >
                                        <span class="toggle-knob"></span>
                                    </button>
                                </div>
                            </div>

                            {#if LibraryState.externalAccess}
                                <div class="settings-field">
                                    <p class="settings-label">Access Token</p>
                                    <div class="settings-input-row">
                                        <input
                                            class="settings-input"
                                            type={LibraryState.tokenVisible ? 'text' : 'password'}
                                            value={LibraryState.settingsData.secretToken}
                                            readonly
                                        />
                                        <button class="settings-icon-btn" onclick={() => LibraryState.tokenVisible = !LibraryState.tokenVisible}>
                                            {LibraryState.tokenVisible ? '🙈' : '👁'}
                                        </button>
                                        <button class="settings-icon-btn" onclick={() => navigator.clipboard.writeText(LibraryState.settingsData!.secretToken)}>
                                            ⎘
                                        </button>
                                        <button class="settings-icon-btn danger" onclick={() => libraryController.regenerateToken()}>↺</button>
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
                                        class="toggle {LibraryState.settingsData.autoRate ? 'on' : ''}"
                                        onclick={() => LibraryState.settingsData!.autoRate = !LibraryState.settingsData!.autoRate}
                                        aria-label="Toggle auto-rating"
                                    >
                                        <span class="toggle-knob"></span>
                                    </button>
                                </div>
                            </div>

                            <div class="settings-field">
                                <p class="settings-label">Skip Penalty <span class="value-badge">{LibraryState.settingsData.skipPenalty}</span></p>
                                <input
                                    type="range"
                                    min="-5"
                                    max="0"
                                    step="1"
                                    bind:value={LibraryState.settingsData.skipPenalty}
                                    class="settings-slider"
                                    style="--fill: {((LibraryState.settingsData.skipPenalty + 5) / 5) * 100}%"
                                />
                                <div class="range-labels">
                                    <span>-5</span>
                                    <span>0</span>
                                </div>
                            </div>

                            <div class="settings-field">
                                <p class="settings-label">Replay Bonus <span class="value-badge">{LibraryState.settingsData.replayBonus}</span></p>
                                <input
                                    type="range"
                                    min="0"
                                    max="5"
                                    step="1"
                                    bind:value={LibraryState.settingsData.replayBonus}
                                    class="settings-slider"
                                    style="--fill: {(LibraryState.settingsData.replayBonus / 5) * 100}%"
                                />
                                <div class="range-labels">
                                    <span>0</span>
                                    <span>+5</span>
                                </div>
                            </div>

                            <div class="settings-field">
                                <p class="settings-label">Min Allowable Rating <span class="value-badge">{LibraryState.settingsData.autoMin}</span></p>
                                <input
                                    type="range"
                                    min="-10"
                                    max="10"
                                    step="1"
                                    bind:value={LibraryState.settingsData.autoMin}
                                    class="settings-slider"
                                    style="--fill: {((LibraryState.settingsData.autoMin + 100) / 100) * 100}%"
                                />
                                <div class="range-labels">
                                    <span>-10</span>
                                    <span>10</span>
                                </div>
                            </div>

                            <div class="settings-field">
                                <p class="settings-label">Max Allowable Rating <span class="value-badge">{LibraryState.settingsData.autoMax}</span></p>
                                <input
                                    type="range"
                                    min="-10"
                                    max="10"
                                    step="1"
                                    bind:value={LibraryState.settingsData.autoMax}
                                    class="settings-slider"
                                    style="--fill: {(LibraryState.settingsData.autoMax / 100) * 100}%"
                                />
                                <div class="range-labels">
                                    <span>-10</span>
                                    <span>10</span>
                                </div>
                            </div>
                        </div>

                        <!-- SAVE -->
                        <div class="settings-save">
                            <button class="settings-btn primary {LibraryState.settingsSaved ? 'saved' : ''}" onclick={() => libraryController.saveSettings()}>
                                {LibraryState.settingsSaved ? '✓ Saved' : 'Save Changes'}
                            </button>
                        </div>

                    {:else}
                        <div class="empty">Loading settings...</div>
                    {/if}
                </div>
            {:else}
                <div class="song-list">
                    {#if LibraryState.songs.length === 0}
                        <div class="empty">No songs found</div>
                    {:else}
                        <div class="song-list-header">
                            <span class="col-title">Title</span>
                            <span class="col-artist">Artist</span>
                            <span class="col-rating">Rating</span>
                        </div>
                        {#each LibraryState.songs as song}
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
    <aside class="sidebar-right {NavigatorState.rightOpen ? '' : 'collapsed'}">
        <button class="sidebar-toggle right" onclick={() => NavigatorState.toggleRight()} aria-label="Toggle right sidebar">
            {NavigatorState.rightOpen ? '›' : '‹'}
        </button>

        {#if NavigatorState.rightOpen}
            <div class="sidebar-top-box"></div>
            <div class="now-playing">
                {#if PlaybackState?.item?.type == 'track'}
                    {@const track = PlaybackState.item as Track}
                    {#if track.album?.images?.[0]?.url}
                        <img class="album-art" src={track.album.images[0].url} alt="Album art" />
                    {:else}
                        <div class="album-art-placeholder">♪</div>
                    {/if}
                    <p class="np-title">{track.name}</p>
                    <p class="np-artist">{track.artists?.map(a => a.name).join(', ') ?? ''}</p>
                {:else if PlaybackState?.item?.type == 'episode'}
                    {@const episode = PlaybackState.item as Episode}
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
                {#if LibraryState.getDefaultTheme()}
                    {@const theme = LibraryState.getDefaultTheme()!}
                    <div class="theme-rating-row">
                        <span class="theme-rating-name">{theme.name}</span>
                        <div class="rating-controls">
                            <button class="rating-btn" onclick={() => libraryController.rate(theme.id, -3)}>-3</button>
                            <button class="rating-btn" onclick={() => libraryController.rate(theme.id, -1)}>-1</button>
                            <span class="rating-value">{LibraryState.getRating(theme.id)}</span>
                            <button class="rating-btn" onclick={() => libraryController.rate(theme.id, 1)}>+1</button>
                            <button class="rating-btn" onclick={() => libraryController.rate(theme.id, 3)}>+3</button>
                        </div>
                    </div>
                {/if}
                {#each LibraryState.getNonDefaultThemes() as theme}
                    <div class="theme-rating-row">
                        <span class="theme-rating-name">{theme.name}</span>
                        <div class="rating-controls">
                            <button class="rating-btn" onclick={() => libraryController.rate(theme.id, -3)}>-3</button>
                            <button class="rating-btn" onclick={() => libraryController.rate(theme.id, -1)}>-1</button>
                            <span class="rating-value">{LibraryState.getRating(theme.id)}</span>
                            <button class="rating-btn" onclick={() => libraryController.rate(theme.id, 1)}>+1</button>
                            <button class="rating-btn" onclick={() => libraryController.rate(theme.id, 3)}>+3</button>
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
            {#if PlaybackState?.item?.type === 'track'}
                {@const track = PlaybackState.item as Track}
                <p class="track-name">{track.name}</p>
                <p class="track-artist">{track.artists?.map(a => a.name).join(', ') ?? '—'}</p>
            {:else if PlaybackState?.item?.type === 'episode'}
                {@const episode = PlaybackState.item as Episode}
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
                <button class="ctrl-btn" onclick={() => playerController.skipPrevious()}>⏮</button>
                <button class="ctrl-btn play" onclick={() => PlaybackState?.is_playing ? playerController.pause() : playerController.play()}>
                    {PlaybackState?.is_playing ? '⏸' : '▶'}
                </button>
                <button class="ctrl-btn" onclick={() => playerController.skipNext()}>⏭</button>
            </div>
            <div class="progress-section">
                <span class="time">{PlaybackState ? formatTime(PlaybackState.progress_ms) : '--:--'}</span>
                <input
                    type="range"
                    min="0"
                    max={PlaybackState?.item?.duration_ms ?? 100}
                    bind:value={PlaybackState!.progress_ms}
                    onchange={() => playerController.seek((PlaybackState!.progress_ms / (PlaybackState?.item?.duration_ms ?? 1)) * 100)}
                    class="progress-bar"
                    style="--fill: {PlaybackState.progressPercent()}%"
                />
                <span class="time">{PlaybackState ? formatTime(PlaybackState.item?.duration_ms ?? 0) : '--:--'}</span>
            </div>
        </div>

        <!-- RIGHT: Volume + Device -->
        <div class="bottom-right">
            <div class="volume-control">
                <span class="volume-icon">
                    {#if !PlaybackState?.volume || PlaybackState.volume === 0}🔇
                    {:else if PlaybackState.volume < 50}🔉
                    {:else}🔊{/if}
                </span>
                <input
                    type="range"
                    min="0"
                    max="100"
                    bind:value={PlaybackState!.volume}
                    onchange={() => playerController.setVolume(PlaybackState!.volume)}
                    class="volume-bar"
                    style="--fill: {PlaybackState?.volume ?? 0}%"
                />
            </div>
            <button class="ctrl-btn device" onclick={async () => { await playerController.loadDevices(); NavigatorState.showDevicePicker = true; }}>
                💻
            </button>
            <button onclick={async () => { await playerController.initAudio(socket); }}>
                E
            </button>
            <button onclick={async () => { await playerController.stopAudio(); }}>
                D
            </button>
        </div>
    </footer>
</div>
 
<!-- MODALS -->

{#if NavigatorState.showNewTheme}
    <div class="modal-overlay" role="button" tabindex="0" onclick={() => NavigatorState.showNewTheme = false} onkeydown={(e) => e.key === 'Escape' && (NavigatorState.showNewTheme = false)}>
        <div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
            <h3 class="modal-title">New Theme</h3>
            <form onsubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget as HTMLFormElement);
                const name = data.get('themeName') as string;
                const cloneFromThemeId = data.get('cloneFromThemeId') ? Number(data.get('cloneFromThemeId')) : null;

                if (!name.trim()) return;
                libraryController.createTheme(name.trim(), cloneFromThemeId);
                NavigatorState.showNewTheme = false;
            }}>
                <input
                    class="modal-input"
                    type="text"
                    name="themeName"
                    placeholder="Theme name"
                />
                <div class="field">
                    <p class="field-label">Clone Ratings From</p>
                    <select class="modal-select" name="cloneFromThemeId">
                        <option value="">None</option>
                        {#each LibraryState.themes as theme}
                            <option value={theme.id}>{theme.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="modal-actions">
                    <button type="button" class="modal-btn" onclick={() => NavigatorState.showNewTheme = false}>Cancel</button>
                    <button type="submit" class="modal-btn primary">Create</button>
                </div>
            </form>
        </div>
    </div>
{/if}

{#if NavigatorState.showSavePlaylist}
    <div class="modal-overlay" role="button" tabindex="0" onclick={() => NavigatorState.showSavePlaylist = false} onkeydown={(e) => e.key === 'Escape' && (NavigatorState.showSavePlaylist = false)}>
        <div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
            <form onsubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget as HTMLFormElement);
                const name = data.get('playlistName') as string;
                const isDynamic = data.get('isDynamic') === 'on';

                libraryController.savePlaylist(name, isDynamic);
                NavigatorState.showSavePlaylist = false;
            }}>
                <h3 class="modal-title">Save Playlist</h3>
                <input
                    class="modal-input"
                    type="text"
                    name="playlistName"
                    placeholder="Playlist name"
                />
                <label class="toggle-row">
                    <span class="toggle-label">Dynamic</span>
                    <input type="checkbox" name="isDynamic" class="toggle-checkbox" checked />
                    <span class="toggle">
                        <span class="toggle-knob"></span>
                    </span>
                </label>
                <p class="modal-hint">
                    <span class="dynamic-hint">Dynamic: updates automatically as ratings change</span>
                    <span class="frozen-hint">Frozen: saves current songs, does not update</span>
                </p>
                <div class="modal-actions">
                    <button type="button" class="modal-btn" onclick={() => NavigatorState.showSavePlaylist = false}>Cancel</button>
                    <button type="submit" class="modal-btn primary">Save</button>
                </div>
            </form>
        </div>
    </div>
{/if}

{#if NavigatorState.showDeleteConfirm && NavigatorState.deleteTarget}
    <div class="modal-overlay" role="button" tabindex="0" onclick={() => NavigatorState.showDeleteConfirm = false} onkeydown={(e) => e.key === 'Escape' && (NavigatorState.showDeleteConfirm = false)}>
        <div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
            <h3 class="modal-title">Delete {NavigatorState.deleteTarget.type === 'theme' ? 'Theme' : 'Playlist'}</h3>
            <p class="modal-body">
                Are you sure you want to delete <strong>{NavigatorState.deleteTarget.name}</strong>?
                {#if NavigatorState.deleteTarget.type === 'theme'}
                    This will also delete all ratings for this theme.
                {/if}
                This cannot be undone.
            </p>
            <div class="modal-actions">
                <button class="modal-btn" onclick={() => NavigatorState.showDeleteConfirm = false}>Cancel</button>
                <button class="modal-btn danger" onclick={() => navigatorController.confirmDelete()}>Delete</button>
            </div>
        </div>
    </div>
{/if}
        
{#if NavigatorState.showDevicePicker}
    <div class="modal-overlay" role="button" tabindex="0" onclick={() => NavigatorState.showDevicePicker = false} onkeydown={(e) => e.key === 'Escape' && (NavigatorState.showDevicePicker = false)}>
        <div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
            <h3 class="modal-title">Select Device</h3>
            {#each PlaybackState.devices as device}
                <button
                    class="device-row {PlaybackState?.device?.id === device.id ? 'active' : ''}"
                    onclick={() => {playerController.connectDevice(socket, device.id!); NavigatorState.showDevicePicker = false;}}
                >
                    <span class="device-name">{device.name}</span>
                    <span class="device-type">{device.type}</span>
                </button>
            {/each}
            {#if PlaybackState.devices.length === 0}
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