import { Router, Request, Response } from 'express';
import bridge from '../../utils/bridge.js';
import { handleError } from '../errors.js';

import jwt from 'jsonwebtoken';
import { getAuthUrl, handleCallback } from '../../spotify/spotifyauth.js';
import config from '../../utils/appconfig.js';
import { startLibrespot } from '../../player/librespot.js';

const router = Router();

router.post('/librespot-event', (req: Request, res: Response) => {
    const { event } = req.body;
    console.log('librespot event:', event);
});

router.post('/login', (req: Request, res: Response) => {
    if (req.body.token === config.secretToken) {
        const token = jwt.sign(
            { authenticated: true },
            config.secretToken,
            { expiresIn: '30d' }
        );
        res.cookie('auth', token, {
            httpOnly: true,
            secure: true,
            maxAge: 30 * 24 * 60 * 60 * 1000
        });
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid token' });
    }
});

router.post('/logout', (req: Request, res: Response) => {
    res.clearCookie('auth');
    res.json({ success: true });
});

router.get('/spotify/auth', async (req: Request, res: Response) => {
    const url = await getAuthUrl(config.spotifyClientId);
    res.redirect(url);
});

router.get('/spotify/callback', async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const error = req.query.error as string;

    if (error || !code) {
        return res.redirect('?spotify=error');
    }

    await handleCallback(code, config.spotifyClientId);

    // Start librespot with the new token
    if (config.tokenValidCheck()) {
        // todo might move this out of the callback, feels weird to start a program off a http request
        startLibrespot(config.spotifyAccessToken)
        .catch(console.error);
    }

    res.redirect(`http://localhost:${config.activePort}`);
});

/*// todo probably don't need this anymore
router.get('/api/spotify/token', (req: Request, res: Response) => {
    try {
        const tokens = bridge.getSpotifyTokens();
        if (!tokens) return res.status(401).json({ error: 'Not authenticated' });

        // Refresh if expired before sending
        if (bridge.isTokenExpired()) {
            // Token will auto refresh on next spotify call
        }

        res.json({ accessToken: tokens.access_token });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});
//*/

// External

router.get('/external-access', (req: Request, res: Response) => {
    res.json({ ExternalAccessEnabled: config.externalAccessEnabled });
});

router.post('/external-access/toggle', (req: Request, res: Response) => {
    try {
        config.externalAccessEnabled = !config.externalAccessEnabled;
        // todo fix external access stuff
        // io.emit('externalAccessUpdate', externalAccessEnabled);
        res.json({ ExternalAccessEnabled: config.externalAccessEnabled });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;