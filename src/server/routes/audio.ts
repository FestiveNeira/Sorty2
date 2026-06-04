import { ioserver } from '../socket.js';

const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 4; // F32
const BYTES_PER_SEC = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE; // 352800

const CHUNK_MS = 50;
const CHUNK_SIZE = BYTES_PER_SEC * (CHUNK_MS / 1000); // ~17640 bytes per tick

let nextchunk: Buffer | null = null;

let audiostream: NodeJS.ReadableStream | null = null;

// Called before server starts and registers client request event note: keep this pattern in mind
export function initAudioEvents() {
    ioserver.on('connection', (socket: any) => {
        console.log('Audio Events Registered:', socket.id);
        socket.on('request-chunk', () => {
            if (audiostream) {
                if (nextchunk) {
                    ioserver.emit('audio-chunk', nextchunk);
                }
                nextchunk = audiostream.read(CHUNK_SIZE) as Buffer | null;
            }
        });
    });
}

export function initAudioStream(stdout: NodeJS.ReadableStream | null) {
    if (!stdout || !ioserver) return;

    audiostream = stdout;

    audiostream.pause(); // switch to paused mode — Node won't drain it automatically

    setInterval(() => {
        if (audiostream) {
            if (nextchunk) {
                ioserver.emit('audio-chunk', nextchunk);
            }
            nextchunk = audiostream.read(CHUNK_SIZE) as Buffer | null;
        }
    }, CHUNK_MS);

    audiostream.on('end', () => {
        console.log('audio stream ended');
        ioserver.emit('audio-end');
    });

    audiostream.on('error', (err) => console.error('audio stream error:', err));
}