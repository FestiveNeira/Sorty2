import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';

import config from '../utils/appconfig.js';

const router = Router();

router.use((req, res, next) => {
    const isLocal = req.ip === '127.0.0.1' || req.ip === '::1';
    if (isLocal) return next();
    next();
}, rateLimit({ windowMs: 5 * 60 * 1000, max: 100 }));
router.use(cookieParser());
router.use(cors());
router.use(express.json());
router.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://sdk.scdn.co"],
            frameSrc: ["'self'", "https://sdk.scdn.co"],
            connectSrc: ["'self'", "https://api.spotify.com", "wss://dealer.spotify.com", "https://dealer.spotify.com"],
            imgSrc: ["'self'", "data:", "https://i.scdn.co", "https://*.scdn.co", "https://*.spotifycdn.com"],
        }
    }
}));
router.use((req: Request, res: Response, next) => {
    const isLocal = req.ip === '127.0.0.1' || req.ip === '::1';
    if (isLocal) return next();

    if (!config.externalAccessEnabled) {
        req.socket.destroy();
        return;
    }

    if (req.path === '/api/login') return next();

    try {
        jwt.verify(req.cookies?.auth, config.secretToken);
        next();
    } catch {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.redirect('/login');
    }
});

// Serve SvelteKit frontend
router.use(express.static('dist/frontend'));

export async function initMiddleware(app: any) {
    app.use(router);
}