import { Server } from 'socket.io';
import http from 'http';

export let ioserver: Server;

export function initSocket(httpServer: http.Server): Server {
    ioserver = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    ioserver.on('connection', (socket: any) => {
        console.log('Client connected:', socket.id);
        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });

    return ioserver;
}