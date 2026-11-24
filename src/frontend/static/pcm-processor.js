// static/audio/pcm-processor.js
// Runs on the dedicated audio rendering thread. No imports here — kept
// self-contained for reliable cross-browser AudioWorklet support.

const RING_CAPACITY_FRAMES = 44100 * 4;
const CHANNELS = 2;
const CTRL_WRITE_INDEX = 0;
const CTRL_READ_INDEX = 1;

class PCMProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const { ringBuffer, ctrlBuffer } = options.processorOptions;
        this.ringView = new Float32Array(ringBuffer);
        this.ctrlView = new Int32Array(ctrlBuffer);
    }

    process(inputs, outputs) {
        const output = outputs[0];
        const left = output[0];
        const right = output[1];
        const frameCount = left.length; // typically 128

        let readIndex = Atomics.load(this.ctrlView, CTRL_READ_INDEX);
        const writeIndex = Atomics.load(this.ctrlView, CTRL_WRITE_INDEX);
        const available = writeIndex - readIndex;

        for (let i = 0; i < frameCount; i++) {
            if (i < available) {
                const ringPos = (readIndex % RING_CAPACITY_FRAMES) * CHANNELS;
                left[i] = this.ringView[ringPos];
                right[i] = this.ringView[ringPos + 1];
                readIndex++;
            } else {
                // Underrun: output silence rather than stale/garbage data
                left[i] = 0;
                right[i] = 0;
            }
        }

        Atomics.store(this.ctrlView, CTRL_READ_INDEX, readIndex);
        return true; // keep processor alive
    }
}

registerProcessor('pcm-processor', PCMProcessor);