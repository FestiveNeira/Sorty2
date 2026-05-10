import net from 'net';
import { generateCodeVerifier, generateCodeChallenge } from './pkce.js';
import { saveSpotifyTokens } from '../database/database.js';
import { activePort } from './appconfig.js';

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

function isPortAvailable(port: number): Promise<boolean> {
    return new Promise(resolve => {
        const tester = net.createServer()
            .once('error', () => resolve(false))
            .once('listening', () => tester.close(() => resolve(true)))
            .listen(port, '127.0.0.1');
    });
}

export function getRedirectUri() {
    return `http://127.0.0.1:${activePort}/api/spotify/callback`;
}

// Generates the Spotify auth URL
export async function getAuthUrl(clientId: string): Promise<string> {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);

    // Store verifier so callback can use it
    currentVerifier = verifier;

    console.log('Redirect URI:', getRedirectUri()); // testing

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

    console.log('Redirect URI:', getRedirectUri()); // testing

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
    saveSpotifyTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);
}

let currentVerifier: string | null = null;