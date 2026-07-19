import { ChildProcess } from 'child_process';
import { ioserver } from '../socket.js';

const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 4; // F32
const BYTES_PER_SEC = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE; // 352800

const CHUNK_MS = 500; // 0.5 seconds
const CHUNK_SIZE = BYTES_PER_SEC * (CHUNK_MS / 1000); // 176400 bytes per chunk / 0.5 seconds of audio

let nextchunk: Buffer | null = null;

let librespotProcess: ChildProcess | null = null;
let ffmpegProcess: ChildProcess | null = null;

// Called before server starts and registers client request event note: keep this pattern in mind
export function initAudioEvents() {
    ioserver.on('connection', (socket: any) => {
        // Sends the preloaded chunk and loads another chunk
        socket.on('request-chunk', () => {
            if (nextchunk) ioserver.emit('audio-chunk', nextchunk);
            nextchunk = librespotProcess?.stdout?.read(CHUNK_SIZE);
        });
        // Wipes the preloaded chunk and loads the next one after it
        socket.on('flush-chunk', () => {
            nextchunk = null;
        });
    });
}

export function initAudioStream(librespot: ChildProcess) {
    if (!librespot || !ioserver) return;

    librespotProcess = librespot;

    librespotProcess?.stdout!.pause(); // switch to paused mode so it won't drain automatically

    librespotProcess?.stdout?.on('end', () => {
        console.log('audio stream ended');
        ioserver.emit('audio-end');
    });

    librespotProcess?.stdout?.on('error', (err) => console.error('audio stream error:', err));
}