// This file controls the system media overlay that most systems have, it should work for all systems but testing is required
let silentAudio: HTMLAudioElement | null = null;
// todo: add a real static wav file to the app since this doesn't currently work
const SILENT_WAV = 'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';

function initMediaSession(handlers: {
    play: () => void,
    pause: () => void,
    skip: () => void,
    back: () => void,
    seek?: (positionMs: number) => void
}) {
    // silent audio element to satisfy OS media session requirements
    silentAudio = document.getElementById('silent-player') as HTMLAudioElement;
    silentAudio.src = SILENT_WAV;
    silentAudio.loop = true;
    silentAudio.volume = 0;
    silentAudio.play().catch(() => { });

    navigator.mediaSession.setActionHandler('play', handlers.play);
    navigator.mediaSession.setActionHandler('pause', handlers.pause);
    navigator.mediaSession.setActionHandler('nexttrack', handlers.skip);
    navigator.mediaSession.setActionHandler('previoustrack', handlers.back);
}

function stopMediaSession() {
    silentAudio?.pause();
    navigator.mediaSession.playbackState = 'none';
    navigator.mediaSession.metadata = null;
}

function play() {
    silentAudio?.play().catch(() => { });
    navigator.mediaSession.playbackState = 'playing';
}

function pause() {
    silentAudio?.pause();
    navigator.mediaSession.playbackState = 'paused';
}

function setMetadata(title: string, artist: string, artwork: string) {
    navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        artwork: [{ src: artwork }]
    });
}

export default { initMediaSession, stopMediaSession, play, pause, setMetadata };