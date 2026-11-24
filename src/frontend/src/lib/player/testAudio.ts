// todo: make so changing the window size and moving it doesn't affect playback

import type { Socket } from 'socket.io-client';

const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 4;
const FRAME_BYTES = CHANNELS * BYTES_PER_SAMPLE; // 8 bytes per stereo frame

const SCHEDULE_AHEAD = 1;
const MIN_BUFFER = 0.5;

let audioCtx: AudioContext | null = null;
let nextPlayTime = 0;
let socket: Socket | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

// New: bridge for Media Session support
let mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
let audioEl: HTMLAudioElement | null = null;

const scheduledSources: AudioBufferSourceNode[] = [];

function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
        console.log('Buffered Ahead: ' + secondsBuffered());
        if (secondsBuffered() < MIN_BUFFER) {
            socket?.emit('request-chunk');
        }
    }, 50);
}

function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
}

function getAudioContext(): AudioContext {
    if (!audioCtx) {
        audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
        nextPlayTime = audioCtx.currentTime;

        // New: set up the Media Session bridge alongside context creation
        mediaStreamDest = audioCtx.createMediaStreamDestination();
        audioEl = document.getElementById('player') as HTMLAudioElement;
        if (audioEl) {
            audioEl.srcObject = mediaStreamDest.stream;
            audioEl.play().catch(() => { });
        }
    }
    return audioCtx;
}

function schedulePCM(bytes: Uint8Array) {
    const ctx = getAudioContext();
    // Align to frame boundary just in case
    const aligned = bytes.subarray(0, bytes.byteLength - (bytes.byteLength % FRAME_BYTES));
    const float32 = new Float32Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / BYTES_PER_SAMPLE);
    const frameCount = float32.length / CHANNELS;
    const audioBuffer = ctx.createBuffer(CHANNELS, frameCount, SAMPLE_RATE);

    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    for (let i = 0; i < frameCount; i++) {
        left[i] = float32[i * 2];
        right[i] = float32[i * 2 + 1];
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    //source.connect(ctx.destination); // todo: remove
    if (mediaStreamDest) source.connect(mediaStreamDest); // New: also feed the bridge

    if (nextPlayTime < ctx.currentTime) {
        console.warn('audio underrun, resetting schedule');
        nextPlayTime = ctx.currentTime + SCHEDULE_AHEAD;
    }

    source.start(nextPlayTime);

    // Track all scheduled sources
    scheduledSources.push(source);
    source.onended = () => {
        source.disconnect();
        scheduledSources.splice(scheduledSources.indexOf(source), 1);
    };

    nextPlayTime += audioBuffer.duration;
    source.onended = () => source.disconnect();
}

function secondsBuffered(): number {
    const ctx = getAudioContext();
    return Math.max(0, nextPlayTime - ctx.currentTime);
}

function processChunk(data: ArrayBuffer | Uint8Array) {
    const chunk = data instanceof Uint8Array ? data : new Uint8Array(data);
    schedulePCM(chunk);
}

// note: Export below is redundant, it's included for ease of reading
async function initAudio(audioSocket: Socket) {
    socket = audioSocket;
    const ctx = getAudioContext();
    await ctx.resume();
    nextPlayTime = ctx.currentTime + SCHEDULE_AHEAD;

    socket.on('audio-chunk', processChunk);
    socket.on('audio-end', () => console.log('audio stream ended'));

    startPolling();
}

async function stopAudio() {
    stopPolling();

    socket?.off('audio-chunk', processChunk);
    socket?.off('audio-end');
    socket = null;

    nextPlayTime = 0;
    if (audioCtx) await audioCtx.close();
    audioCtx = null;

    // New: tear down the bridge alongside the context
    audioEl?.pause();
    audioEl = null;
    mediaStreamDest = null;
}

// ---------- AUDIO CONTEXT ----------
// These can be called in other files the above functions are only for this file's logic

// Call alongside your play/pause logic
async function pauseAudio() {
    await audioCtx?.suspend();
}

async function resumeAudio() {
    await audioCtx?.resume();
}

// Call before seek/next/prev — flushes scheduled audio and requests fresh data
function flushAudio() {
    stopPolling(); // Stop requesting old song data while we flush

    scheduledSources.forEach(s => { try { s.stop(); } catch { } });
    scheduledSources.length = 0;
    nextPlayTime = audioCtx ? audioCtx.currentTime + SCHEDULE_AHEAD : 0;

    // todo: at the moment this can fetch faster than spotify processes the api request meaning some old audio continues before the update
    socket?.emit('flush-chunk');

    startPolling(); // Start polling new data
}

export default { initAudio, stopAudio, pauseAudio, resumeAudio, flushAudio };