import * as bridge from '../utils/bridge.js';

// Funtions for processing errors and retrying logic
export async function handleError(e: any, func?: () => Promise<any>): Promise<void> {
    // Print the error
    console.error(`Error ${e.status}: ${e.message}`);
    // If error was because no active device was found, then try to reconnect
    if (e.reason == 'NO_ACTIVE_DEVICE') {
        let success = await reconnectDevice();
        if (success && func) {
            try {
                // After reconnecting try to rerun the function that threw the error
                await new Promise(resolve => setTimeout(resolve, 1000));
                await func();
            }
            catch (e: any) {
                console.error(`Error ${e.status}: ${e.message}`);
            }
        }
    }
}

async function reconnectDevice(): Promise<boolean> {
    let status = await bridge.connectDevice();
    console.log(status);
    if (status == 404) console.error('Error 404: No playback devices found.');
    if (status == 204) return true;
    return false;
}