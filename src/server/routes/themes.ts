import { Router, Request, Response } from 'express';
import * as bridge from '../bridge.js';
import { handleError } from '../errors.js';
import { io } from '../socket.js';

import { initPort, saveConfig, loadConfig } from '../../utils/appconfig.js';
let config = loadConfig();

const router = Router();

// Themes Endpoints

router.get('/', async (req: Request, res: Response) => {
    try {
        const themes = bridge.getThemes();
        res.json(themes);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/', async (req: Request, res: Response) => {
    try {
        const { name, cloneFromThemeId } = req.body;
        const id = bridge.createTheme(name, cloneFromThemeId);
        res.json({ id });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const { name } = req.body;
        bridge.renameTheme(id, name);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        bridge.deleteTheme(id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:id/songs', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const { search, sortBy, order } = req.query as Record<string, string>;
        const songs = bridge.getThemeSongs(id, search, sortBy, order);
        res.json(songs);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/:id/play', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const uri = await bridge.updateThemedPlaylist(id);
        await bridge.play(uri);
        io.emit('playbackStateUpdate', true);
        res.json({ uri });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Rating
router.post('/songs/rate', async (req: Request, res: Response) => {
    try {
        const { spotifyId, themeId, delta } = req.body;
        const newRating = await bridge.rateSong(spotifyId, themeId, delta);
        res.json({ rating: newRating });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/songs/ratings', async (req: Request, res: Response) => {
    try {
        const id = req.query.id as string;
        const ratings = bridge.getSongRatings(id);
        res.json(ratings);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;