// This runs entirely off the main thread. It owns the socket connection and
// writes incoming PCM samples into the shared ring buffer. No DOM/main-thread
// dependency of any kind lives here.

import { io, type Socket } from 'socket.io-client';
import { RING_CAPACITY_FRAMES, CHANNELS, CTRL_WRITE_INDEX, CTRL_READ_INDEX } from './pcm-ring-buffer';

let socket: Socket | null = null;
let ringView: Float32Array | null = null;
let ctrlView: Int32Array | null = null;
let sampleRate = 44100;

const BYTES_PER_SAMPLE = 4; // Float32
const FRAME_BYTES = CHANNELS * BYTES_PER_SAMPLE;

function writeFramesToRing(interleaved: Float32Array) {
    if (!ringView || !ctrlView) return;

    const frameCount = interleaved.length / CHANNELS;
    let writeIndex = Atomics.load(ctrlView, CTRL_WRITE_INDEX);

    for (let i = 0; i < frameCount; i++) {
        const ringPos = (writeIndex % RING_CAPACITY_FRAMES) * CHANNELS;
        ringView[ringPos] = interleaved[i * CHANNELS];
        ringView[ringPos + 1] = interleaved[i * CHANNELS + 1];
        writeIndex++;
    }

    Atomics.store(ctrlView, CTRL_WRITE_INDEX, writeIndex);
}

function processChunk(bytes: Uint8Array) {
    const aligned = bytes.subarray(0, bytes.byteLength - (bytes.byteLength % FRAME_BYTES));
    const float32 = new Float32Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / BYTES_PER_SAMPLE);
    writeFramesToRing(float32);
}

function secondsBuffered(): number {
    if (!ctrlView) return 0;
    const writeIndex = Atomics.load(ctrlView, CTRL_WRITE_INDEX);
    const readIndex = Atomics.load(ctrlView, CTRL_READ_INDEX);
    return Math.max(0, (writeIndex - readIndex) / sampleRate);
}

self.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'init': {
            ringView = new Float32Array(payload.ringBuffer);
            ctrlView = new Int32Array(payload.ctrlBuffer);
            sampleRate = payload.sampleRate;

            socket = io(payload.origin, { transports: ['websocket'] }); // websocket-only: workers lack XHR
            socket.on('audio-chunk', (chunk: ArrayBuffer) => processChunk(new Uint8Array(chunk)));
            socket.on('audio-end', () => self.postMessage({ type: 'audio-end' }));

            // Same polling responsibility your old file had — just running here instead of main thread
            setInterval(() => {
                if (secondsBuffered() < payload.minBuffer) {
                    socket?.emit('request-chunk');
                }
            }, 50);
            break;
        }
        case 'flush': {
            // Drop everything buffered — reset both pointers together so reader doesn't see stale data
            if (ctrlView) {
                const writeIndex = Atomics.load(ctrlView, CTRL_WRITE_INDEX);
                Atomics.store(ctrlView, CTRL_READ_INDEX, writeIndex);
            }
            socket?.emit('flush-chunk');
            break;
        }
        case 'stop': {
            socket?.off('audio-chunk');
            socket?.off('audio-end');
            socket?.disconnect();
            socket = null;
            break;
        }
    }
};