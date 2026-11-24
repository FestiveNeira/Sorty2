// pcm-ring-buffer.ts
// Reference only — documents the shared layout used by audio-worker.ts and pcm-processor.js.
// Not imported directly by the worklet (worklets can't reliably import ES modules cross-browser),
// but audio-worker.ts (a normal Vite-bundled Worker) does import this.

export const RING_CAPACITY_FRAMES = 44100 * 4; // 4 seconds of buffer at 44.1kHz — generous cushion
export const CHANNELS = 2;

// Control buffer layout (Int32Array, SharedArrayBuffer):
export const CTRL_WRITE_INDEX = 0; // next frame index the worker will write to
export const CTRL_READ_INDEX = 1;  // next frame index the processor will read from
export const CTRL_LENGTH = 2;      // total Int32 slots needed

export function createSharedBuffers() {
    const ringBuffer = new SharedArrayBuffer(RING_CAPACITY_FRAMES * CHANNELS * 4); // Float32 = 4 bytes
    const ctrlBuffer = new SharedArrayBuffer(CTRL_LENGTH * 4);
    return { ringBuffer, ctrlBuffer };
}