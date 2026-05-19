import { Router, Request, Response } from 'express';
import * as bridge from '../bridge.js';
import { handleError } from '../errors.js';
import { io } from '../socket.js';

import { initPort, saveConfig, loadConfig } from '../../utils/appconfig.js';
let config = loadConfig();

const router = Router();

// Player Endpoints

router.get('/', async (req: Request, res: Response) => {
    try {
        const state = await bridge.getPlaybackState();
        res.json(state);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.getPlaybackState());
    }
});

router.get('/queue', async (req: Request, res: Response) => {
    try {
        const queue = await bridge.getQueue();
        res.json(queue);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.getQueue());
    }
});

router.get('/devices', async (req: Request, res: Response) => {
    try {
        const devices = await bridge.getDevices();
        res.json(devices);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.getDevices());
    }
});

router.post('/devices/connect', async (req: Request, res: Response) => {
    const deviceId = req.body.deviceId ?? config.lastDeviceId;
    try {
        const connected = await bridge.connectDevice(deviceId);
        if (connected) {
            config.lastDeviceId = deviceId;
            saveConfig(config);
        }
        res.json({ connected });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.connectDevice(deviceId));
    }
});

router.post('/volume', async (req: Request, res: Response) => {
    const { volume } = req.body;
    try {
        await bridge.setVolume(volume);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.setVolume(volume));
    }
});

router.post('/play', async (req: Request, res: Response) => {
    const uri = req.body.uri as string;
    try {
        await bridge.play(uri);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.play(uri));
    }
});

router.post('/pause', async (req: Request, res: Response) => {
    try {
        await bridge.pause();
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.pause());
    }
});

router.post('/next', async (req: Request, res: Response) => {
    try {
        await bridge.skipNext();
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.skipNext());
    }
});

router.post('/previous', async (req: Request, res: Response) => {
    try {
        await bridge.skipPrevious();
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.skipPrevious());
    }
});

router.post('/seek', async (req: Request, res: Response) => {
    const { positionMs } = req.body;
    try {
        await bridge.seekToPosition(positionMs);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
        await handleError(e, () => bridge.seekToPosition(positionMs))
    }
});

export default router;