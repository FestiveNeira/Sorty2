import { Router, Request, Response } from 'express';
import bridge from '../../utils/bridge.js';
import { handleError } from '../errors.js';

import config from '../../utils/appconfig.js';

const router = Router();

// Themed Playlist

router.get('/themed/songs', async (req: Request, res: Response) => {
    try {
        const songs = bridge.getThemedPlaylistSongs();
        res.json(songs);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/themed/update', async (req: Request, res: Response) => {
    try {
        const { themeId, ratingMin, ratingMax, sort, limitCount } = req.body;
        if (!themeId) return res.status(400).json({ error: 'themeId is required' });

        const uri = await bridge.updateThemedPlaylist(
            themeId,
            ratingMin ?? null,
            ratingMax ?? null,
            sort ?? 'top',
            limitCount ?? null
        );
        res.json({ uri });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Playlist Endpoints

router.get('/', async (req: Request, res: Response) => {
    try {
        const playlists = bridge.getPlaylists();
        res.json(playlists);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/', async (req: Request, res: Response) => {
    try {
        const { name, themeId, ratingMin, ratingMax, sort, limitCount, isDynamic } = req.body;
        const id = await bridge.createSavedPlaylist(name, themeId, ratingMin, ratingMax, sort, limitCount, isDynamic);
        res.json({ id });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const { name, isDynamic, ratingMin, ratingMax, sort, limitCount } = req.body;
        bridge.updateSavedPlaylist(id, name, isDynamic, ratingMin, ratingMax, sort, limitCount);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        bridge.deleteSavedPlaylist(id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:id/songs', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const songs = bridge.getSavedPlaylistSongs(id);
        res.json(songs);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/:id/play', async (req: Request, res: Response) => {
    try {
        const id = parseInt(req.params.id as string);
        const uri = await bridge.loadSavedPlaylist(id);
        await bridge.play(uri);
        res.json({ uri });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/preview', async (req: Request, res: Response) => {
    try {
        const { themeId, ratingMin, ratingMax, sort, limitCount } = req.query as Record<string, string>;
        if (!themeId) return res.status(400).json({ error: 'themeId is required' });

        const songs = bridge.previewPlaylistCriteria(
            parseInt(themeId),
            ratingMin ? parseInt(ratingMin) : null,
            ratingMax ? parseInt(ratingMax) : null,
            sort ?? 'top',
            limitCount ? parseInt(limitCount) : null
        );
        res.json(songs);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;