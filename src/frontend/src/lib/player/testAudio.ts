// this is a test file that will directly play audio through the audio tag in page.svelte
// the goal is to find a way to play audio in a way that doesn't produce scheduling or breaking errors but allows for the media session api to function.

import type { Socket } from 'socket.io-client';

const SCHEDULE_AHEAD_SEC = 3; // how far ahead of the playhead we try to keep buffered
const MIN_BUFFER_SEC = 1;     // request more once we drop below this

let audioEl: HTMLAudioElement | null = null;
let mediaSource: MediaSource | null = null;
let sourceBuffer: SourceBuffer | null = null;
let socket: Socket | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pendingChunks: Uint8Array[] = []; // queued while sourceBuffer is busy appending

function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
        const secondsBuffered = getBufferedAheadSeconds(); // <- reads audio.buffered, main thread
        if (secondsBuffered < MIN_BUFFER_SEC) {
            socket?.emit('request-chunk'); // <- asking server for more, main thread
        }
    }, 250);
}

async function initAudio(socket: Socket) {
    socket = socket;
    audioEl = document.getElementById('player') as HTMLAudioElement;

    mediaSource = new MediaSource();
    audioEl.src = URL.createObjectURL(mediaSource);

    await new Promise<void>(resolve => {
        mediaSource!.addEventListener('sourceopen', () => resolve(), { once: true });
    });

    sourceBuffer = mediaSource!.addSourceBuffer('audio/mpeg'); // depends on your codec
    sourceBuffer.addEventListener('updateend', () => flushPendingChunks());

    audioEl.play().catch(() => { });

    socket.on('audio-chunk', (chunk: ArrayBuffer) => handleChunk(new Uint8Array(chunk)));

    startPolling();
}

// ---------- THE FEEDING LOOP — this is the part exposed to main-thread jank ----------

function handleChunk(chunk: Uint8Array) {
    pendingChunks.push(chunk);
    flushPendingChunks();
}

function flushPendingChunks() {
    if (!sourceBuffer || sourceBuffer.updating) return; // must wait for updateend
    const next = pendingChunks.shift();
    if (next) sourceBuffer.appendBuffer(next); // <- runs on main thread
}

function getBufferedAheadSeconds(): number {
    if (!audioEl) return 0;
    const { buffered, currentTime } = audioEl;
    for (let i = 0; i < buffered.length; i++) {
        if (currentTime >= buffered.start(i) && currentTime <= buffered.end(i)) {
            return buffered.end(i) - currentTime;
        }
    }
    return 0;
}

export default { initAudio, stopAudio, pauseAudio, resumeAudio, flushAudio };
