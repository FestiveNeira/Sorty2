// This file contains the playback state object for use in the frontend to keep a reactive spotify state.

import type { PlaybackState, TrackItem, Device } from '@spotify/web-api-ts-sdk';

class PlaybackStore {
    #state = $state<PlaybackState | null>(null);

    #nextTracks = $state<TrackItem[]>([]);
    #previousTracks = $state<TrackItem[]>([]);

    #devices = $state<any[]>([]);

    // State Data
    get raw() { return this.#state; }
    set raw(value: PlaybackState | null) { this.#state = value; }

    get is_playing() { return this.#state?.is_playing ?? false; }
    set is_playing(value: boolean) {
        if (this.#state) this.#state.is_playing = value;
    }

    get volume() { return this.#state?.device?.volume_percent ?? 0; }
    set volume(value: number) {
        if (this.#state?.device) this.#state.device.volume_percent = value;
    }

    get item() { return this.#state?.item ?? null; }
    set item(value: TrackItem | null) {
        if (this.#state && value) {
            this.#state.item = value;
            this.#state.progress_ms = 0;
        }
    }

    get progress_ms() { return this.#state?.progress_ms ?? 0; }
    set progress_ms(value: number) {
        if (this.#state) this.#state.progress_ms = value;
    }

    get duration_ms() { return this.#state?.item?.duration_ms ?? 0; }

    get device() { return this.#state?.device ?? null; }
    set device(value: Device | null) {
        if (this.#state && value) this.#state.device = value;
    }

    // Queue Data
    get nextTracks() { return this.#nextTracks ?? []; }
    set nextTracks(value: TrackItem[]) {
        if (this.#nextTracks.length > 0 && this.#nextTracks[0] != value[0]) {
            // This means something ended up desynced shouldn't happen but has occurred in testing for the moment
            this.#previousTracks = [];
        }
        this.#nextTracks = value;
    }

    get previousTracks() { return this.#previousTracks ?? []; }
    set previousTracks(value: TrackItem[]) {
        this.#previousTracks = value;
    }

    skipNext() {
        let nextTrack = this.#nextTracks.shift();
        if (nextTrack && this.#state?.item) {
            this.#previousTracks.push(this.#state.item);
            this.#state = {
                ...this.#state!,
                item: nextTrack,
                progress_ms: 0,
                is_playing: true
            };
        }
    }
    skipPrevious() {
        let previousTrack = this.#previousTracks.pop();
        if (previousTrack && this.#state?.item) {
            this.#nextTracks.unshift(this.#state.item);
            this.#state = {
                ...this.#state!,
                item: previousTrack,
                progress_ms: 0,
                is_playing: true
            };
        }
    }

    // Device Picker
    get devices() { return this.#devices ?? []; }
    set devices(value: Device[]) {
        this.#devices = value;
    }
    
    // Helpers
    progressPercent(): number {
        return Math.min((this.progress_ms / this.duration_ms) * 100, 100);
    }
}

export default new PlaybackStore();