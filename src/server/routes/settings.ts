import { Router, Request, Response } from 'express';
import bridge from '../../utils/bridge.js';
import { handleError } from '../errors.js';
import { io } from '../socket.js';

import crypto from 'crypto';
import os from 'os';

import config from '../../utils/appconfig.js';

const router = Router();

// Settings Endpoints

router.get('/', (req: Request, res: Response) => {
    try {
        const settings = bridge.getSettingsData();
        const networkInterfaces = os.networkInterfaces();
        const localIp = Object.values(networkInterfaces)
            .flat()
            .find((i) => i?.family === 'IPv4' && !i.internal)?.address ?? 'unknown';
        res.json({ ...settings, localIp });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/', (req: Request, res: Response) => {
    try {
        const { spotifyClientId, skipPenalty, replayBonus } = req.body;
        config.spotifyClientId = spotifyClientId;
        config.skipPenalty = skipPenalty;
        config.replayBonus = replayBonus;
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/regenerate-token', (req: Request, res: Response) => {
    try {
        const secretToken = crypto.randomBytes(32).toString('hex');
        config.secretToken = secretToken;
        res.json({ secretToken });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/themed-playlist', async (req: Request, res: Response) => {
    try {
        const { uri } = req.body;
        await bridge.setThemedPlaylist(uri);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/master-playlist', async (req: Request, res: Response) => {
    try {
        const { uri } = req.body;
        const imported = await bridge.setMasterPlaylist(uri);
        res.json({ success: true, imported });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;