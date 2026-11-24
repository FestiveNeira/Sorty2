import type { Socket } from 'socket.io-client';
// this is the main player control layer, it imports from the other files in this folder and manages the different aspects of the player
// file for updating the playerstate when player functions are called
import PlaybackState from "./PlaybackState.svelte";
import libraryController from './libraryController';
import mediaSession from "./mediaSession";
import audioContext from "./testAudio"; // todo: test line file
import backendApi from "./backendApi";
import type { Episode, Track } from '@spotify/web-api-ts-sdk';

// todo: song change triggers load current track ratings, this will be in another file probs
// todo: natural song end isn't updating player state properly

// There is a moment on startup where playbackstate will not be populated, this should not cause any errors and should rectify quickly
const loadStateDelay = 300;

// Used to prevent multiple quick calls from running in parallel
let syncTimeout: ReturnType<typeof setTimeout> | null = null;

let progressInterval = (() => {
    const id = setInterval(() => { }, 0);
    clearInterval(id);
    return id;
})();

async function loadPlaybackState(queueChanged: boolean = false, attempts = 5) {
    console.log('loading...' + attempts);
    const data = await backendApi.loadPlayerState();
    if (data) {
        PlaybackState.raw = data;
        if (PlaybackState.item?.type == 'track') {
            const track = PlaybackState.item as Track;
            mediaSession.setMetadata(
                track?.name,
                track?.artists?.map(a => a.name).join(', ') ?? '',
                track?.album?.images?.[0]?.url ?? ''
            );
        }
        else if (PlaybackState.item?.type == 'episode') {
            const episode = PlaybackState.item as Episode;
            mediaSession.setMetadata(
                episode?.name,
                episode?.show?.name ?? '',
                episode?.images?.[0]?.url ?? ''
            );
        }
        startProgressTimer();
        await libraryController.loadCurrentTrackRatings();
        await loadQueue(queueChanged);
    }
    else if (attempts > 1) {
        setTimeout(() => loadPlaybackState(queueChanged, attempts - 1), loadStateDelay);
    }
}

async function loadQueue(forceNew?: boolean) {
    if (PlaybackState.nextTracks.length <= 5 || forceNew) {
        const data = await backendApi.loadQueue();
        PlaybackState.nextTracks = data.queue;
    }
}

async function initAudio(audioSocket: Socket) {
    audioContext.initAudio(audioSocket);
    console.log('test init'); // todo: test
    mediaSession.initMediaSession({ play: play, pause: pause, skip: skipNext, back: skipPrevious, seek: seek });
}
async function stopAudio() {
    audioContext.stopAudio();
    mediaSession.stopMediaSession();
}

// Playback Functions
async function loadDevices() {
    const devices = await backendApi.loadDevices();
    PlaybackState.devices = await devices;
}

async function connectDevice(audioSocket: Socket, deviceId: string) {
    await audioContext.stopAudio(); // if an audio context exists destroy it
    backendApi.connectDevice(deviceId);
    await audioContext.initAudio(audioSocket); // create a new audio context for the device
}

// todo: rip this and use local volume from the audio context as it's more flexible for smooth playback
async function setVolume(v: number) {
    if (PlaybackState) {
        PlaybackState.volume = v;
        backendApi.setVolume(v);
    }
    else {
        setTimeout(() => setVolume(v), loadStateDelay);
    }
}

async function play(context_uri?: string) {
    backendApi.play(context_uri);
    audioContext.resumeAudio(); // audio context function
    mediaSession.play(); // media session function
    setTimeout(() => loadPlaybackState(true), loadStateDelay);
    if (PlaybackState) PlaybackState.is_playing = true;
}

async function playTheme(themeId: number) {
    await backendApi.playTheme(themeId);
    audioContext.resumeAudio(); // audio context function
    mediaSession.play(); // media session function
    setTimeout(() => loadPlaybackState(true), loadStateDelay);
    if (PlaybackState) PlaybackState.is_playing = true;
}

async function playSavedPlaylist(playlistId: number) {
    await backendApi.playPlaylist(playlistId);
    audioContext.resumeAudio(); // audio context function
    mediaSession.play(); // media session function
    setTimeout(() => loadPlaybackState(true), loadStateDelay);
    if (PlaybackState) PlaybackState.is_playing = true;
}

async function pause() {
    backendApi.pause();
    audioContext.pauseAudio(); // audio context function
    mediaSession.pause(); // media session function
    if (PlaybackState) PlaybackState.is_playing = false;
}

async function skipNext() {
    // Clear any planned calls to update player
    if (syncTimeout) {
        clearTimeout(syncTimeout);
        syncTimeout = null;
    }

    // Update
    if (PlaybackState.item) {
        PlaybackState.skipNext();
        startProgressTimer();
        await libraryController.loadCurrentTrackRatings();
    }

    backendApi.skipNext();

    await audioContext.flushAudio(); // audio context function
    mediaSession.play(); // media session function

    // Only sync after the user has stopped clicking
    syncTimeout = setTimeout(async () => {
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
    if (PlaybackState.item) {
        PlaybackState.skipPrevious();
        startProgressTimer();
        await libraryController.loadCurrentTrackRatings();
    }

    // Sync
    backendApi.skipPrevious();

    await audioContext.flushAudio(); // audio context function
    mediaSession.play(); // media session function

    // Only sync after the user has stopped clicking
    syncTimeout = setTimeout(async () => {
        await loadQueue();
        syncTimeout = null;
    }, loadStateDelay);
}

async function seek(percent: number) {
    if (!PlaybackState) return;
    const positionMs = Math.floor((percent / 100) * PlaybackState.duration_ms);
    backendApi.seek(positionMs);
    await audioContext.flushAudio(); // audio context function
    PlaybackState.progress_ms = positionMs;
}

// Helpers

function startProgressTimer() {
    clearInterval(progressInterval);
    if (!PlaybackState.is_playing || !PlaybackState.item) return;

    progressInterval = setInterval(() => {
        if (!PlaybackState.item) return;
        PlaybackState.progress_ms = Math.min(PlaybackState.progress_ms + 1000, PlaybackState.duration_ms);
        if (PlaybackState.progress_ms == PlaybackState.duration_ms) {
            clearInterval(progressInterval);
            loadPlaybackState();
        }
    }, 1000);
}

export default { loadPlaybackState, loadQueue, initAudio, stopAudio, loadDevices, connectDevice, setVolume, play, playTheme, playSavedPlaylist, pause, skipNext, skipPrevious, seek };