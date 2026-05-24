import config from '../utils/appconfig.js';

// PKCE functions
export function generateCodeVerifier(length = 128) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let verifier = '';
  for (let i = 0; i < length; i++) {
    verifier += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return verifier;
}

export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Auth Flow
const SPOTIFY_SCOPES = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'playlist-read-private',
    'playlist-modify-private',
    'playlist-modify-public',
].join(' ');

export function getRedirectUri() {
    return `http://127.0.0.1:${config.activePort}/api/spotify/callback`;
}

// Generates the Spotify auth URL
export async function getAuthUrl(clientId: string): Promise<string> {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);

    // Store verifier so callback can use it
    currentVerifier = verifier;

    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: getRedirectUri(),
        scope: SPOTIFY_SCOPES,
        code_challenge_method: 'S256',
        code_challenge: challenge
    });

    return `https://accounts.spotify.com/authorize?${params}`;
}

// Handles the callback from Spotify
export async function handleCallback(code: string, clientId: string): Promise<void> {
    if (!currentVerifier) throw new Error('No code verifier found');

    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: getRedirectUri(),
        client_id: clientId,
        code_verifier: currentVerifier
    });

    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });

    const tokens = await tokenRes.json();
    currentVerifier = null;
    config.spotifyAccessToken = tokens.access_token;
    config.spotifyRefreshToken = tokens.refresh_token;
    config.spotifyTokenExpiry = Date.now() + (tokens.expires_in * 1000);
}

let currentVerifier: string | null = null;