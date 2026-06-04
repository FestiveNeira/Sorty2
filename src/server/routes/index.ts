import { Router } from 'express';
import authRouter from './auth.js';
import playerRouter from './player.js';
import playlistsRouter from './playlists.js';
import themesRouter from './themes.js';
import settingsRouter from './settings.js';

const router = Router();

router.use('/api',  authRouter);
router.use('/api/player', playerRouter);
router.use('/api/playlists', playlistsRouter);
router.use('/api/themes', themesRouter);
router.use('/api/settings', settingsRouter);

export function setupRoutes(app: any) {
    app.use(router);
}