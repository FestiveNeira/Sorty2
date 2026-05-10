import type { PlaybackState, TrackItem, Device } from '@spotify/web-api-ts-sdk';

export class PlaybackStore {
    #state = $state<PlaybackState | null>(null);

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
}