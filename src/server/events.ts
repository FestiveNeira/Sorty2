import dgram from 'dgram';
import config from '../utils/appconfig.js';

export function startUdpEventListener() {
    const udpServer = dgram.createSocket('udp4');
    
    const UDP_PORT = config.activePort;

    udpServer.on('message', (msg) => {
        try {
            const data = JSON.parse(msg.toString());
            console.log('Librespot Event:', data.event);
            
            // --- YOUR APPLICATION FLOW ACTIONS GO HERE ---
            // Route events instantly to your application state handlers:
            // if (data.event === 'stop') handlePauseState();
            // if (data.event === 'change') handleTrackChange();
            
        } catch (e) {
            console.error("Failed to parse incoming UDP event string context:", e);
        }
    });

    udpServer.on('error', (err) => {
        console.error('UDP Server error framework exception:', err);
        udpServer.close();
    });

    udpServer.bind(UDP_PORT, '127.0.0.1', () => {
        console.log(`🚀 Fast Track UDP Event Monitor initialized on 127.0.0.1:${UDP_PORT}`);
    });
}