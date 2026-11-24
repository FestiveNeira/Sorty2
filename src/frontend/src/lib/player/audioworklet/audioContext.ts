import { createSharedBuffers, RING_CAPACITY_FRAMES } from './pcm-ring-buffer';

const SAMPLE_RATE = 44100;
const SCHEDULE_MIN_BUFFER = 0.5; // passed to the worker; equivalent to your old MIN_BUFFER

let audioCtx: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let audioWorker: Worker | null = null;
let mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
let audioEl: HTMLAudioElement | null = null;
let ctrlView: Int32Array | null = null;

async function getAudioContext(): Promise<AudioContext> {
    if (audioCtx) return audioCtx;

    audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
    await audioCtx.audioWorklet.addModule('/audio/pcm-processor.js');

    const { ringBuffer, ctrlBuffer } = createSharedBuffers();
    ctrlView = new Int32Array(ctrlBuffer);

    workletNode = new AudioWorkletNode(audioCtx, 'pcm-processor', {
        outputChannelCount: [2],
        processorOptions: { ringBuffer, ctrlBuffer }
    });

    mediaStreamDest = audioCtx.createMediaStreamDestination();
    workletNode.connect(mediaStreamDest);
    // Add workletNode.connect(audioCtx.destination) too if you want dual-path
    // (real output direct + muted bridge) rather than single-path through the element.

    audioEl = document.getElementById('player') as HTMLAudioElement;
    if (audioEl) {
        audioEl.srcObject = mediaStreamDest.stream;
        audioEl.play().catch(() => { });
    }

    audioWorker = new Worker(new URL('./audio-worker.ts', import.meta.url), { type: 'module' });
    audioWorker.postMessage({
        type: 'init',
        payload: {
            ringBuffer,
            ctrlBuffer,
            sampleRate: SAMPLE_RATE,
            minBuffer: SCHEDULE_MIN_BUFFER,
            origin: window.location.origin
        }
    });
    audioWorker.onmessage = (e) => {
        if (e.data.type === 'audio-end') console.log('audio stream ended');
    };

    return audioCtx;
}

async function initAudio() {
    const ctx = await getAudioContext();
    await ctx.resume();
}

async function stopAudio() {
    audioWorker?.postMessage({ type: 'stop' });
    audioWorker?.terminate();
    audioWorker = null;

    audioEl?.pause();
    audioEl = null;
    mediaStreamDest = null;
    workletNode = null;
    ctrlView = null;

    if (audioCtx) await audioCtx.close();
    audioCtx = null;
}

async function pauseAudio() {
    await audioCtx?.suspend();
}

async function resumeAudio() {
    await audioCtx?.resume();
}

function flushAudio() {
    audioWorker?.postMessage({ type: 'flush' });
}

export default { initAudio, stopAudio, pauseAudio, resumeAudio, flushAudio };