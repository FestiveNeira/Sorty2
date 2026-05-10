export interface Song {
    spotify_id: string;
    title: string;
    artist: string;
}

export interface Theme {
    id: number;
    name: string;
    is_default: number;
}

export interface Rating {
    spotify_id: string;
    theme_id: number;
    rating: number;
}

export interface Playlist {
    id: number;
    name: string;
    theme_id: number;
    rating_min: number | null;
    rating_max: number | null;
    sort: string;
    limit_count: number | null;
    is_dynamic: number;
    is_themed: number;
    spotify_playlist_id: string | null;
}

export interface PlaylistSong {
    playlist_id: number;
    spotify_id: string;
    position: number;
}

export interface SpotifyTokens {
    id: number;
    access_token: string;
    refresh_token: string;
    expires_at: number;
}

export interface SongWithRating extends Song {
    rating: number;
}

export interface SongWithPosition extends Song {
    position: number;
}