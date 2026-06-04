import type { Socket } from 'socket.io-client';

const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 4;
const FRAME_BYTES = CHANNELS * BYTES_PER_SAMPLE; // 8 bytes per stereo frame

const SCHEDULE_AHEAD = 0.5;
const MIN_BUFFER = 0.25;

let audioCtx: AudioContext | null = null;
let nextPlayTime = 0;
let socket: Socket | null = null;

const scheduledSources: AudioBufferSourceNode[] = [];

function getAudioContext(): AudioContext {
    if (!audioCtx) {
        audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
        nextPlayTime = audioCtx.currentTime;
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
    source.connect(ctx.destination);

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
    if (secondsBuffered() < MIN_BUFFER) {
        socket?.emit('request-chunk');
    }
}

export async function initAudio(audioSocket: Socket) {
    socket = audioSocket;
    const ctx = getAudioContext();
    await ctx.resume();
    nextPlayTime = ctx.currentTime + SCHEDULE_AHEAD;

    socket.on('audio-chunk', processChunk);
    socket.on('audio-end', () => console.log('audio stream ended'));

    socket.emit('request-chunk'); // prime the pump
}

export async function stopAudio() {
    socket?.off('audio-chunk', processChunk);
    socket?.off('audio-end');
    socket = null;

    nextPlayTime = 0;
    if (audioCtx) await audioCtx.close();
    audioCtx = null;
}

// ---------- AUDIO CONTEXT ----------

// Call alongside your play/pause logic
export async function pauseAudio() {
    await audioCtx?.suspend();
}

export async function resumeAudio() {
    await audioCtx?.resume();
}

// Call before seek/next/prev — flushes scheduled audio and requests fresh data
export function flushAudio() {
    scheduledSources.forEach(s => { try { s.stop(); } catch {} });
    scheduledSources.length = 0;
    nextPlayTime = audioCtx ? audioCtx.currentTime + SCHEDULE_AHEAD : 0;
    // todo: at the mooment this can fetch faster than spotify processes the api request meaning some old audio continues before the update
    socket?.emit('request-chunk');
}