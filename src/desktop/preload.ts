const _requestMediaKeySystemAccess = navigator.requestMediaKeySystemAccess.bind(navigator);

console.log('preload running, navigator:', typeof navigator);
console.log('original requestMediaKeySystemAccess:', navigator.requestMediaKeySystemAccess.toString().slice(0, 50));

navigator.requestMediaKeySystemAccess = (keySystem: string, configs: MediaKeySystemConfiguration[]) => {
    if (keySystem === 'com.widevine.alpha') {
        configs = configs.map(config => ({
            ...config,
            audioCapabilities: (config.audioCapabilities ?? []).map(cap => ({
                ...cap,
                robustness: 'SW_SECURE_CRYPTO',
            })),
            videoCapabilities: (config.videoCapabilities ?? []).map(cap => ({
                ...cap,
                robustness: 'SW_SECURE_CRYPTO',
            })),
        }));
    }
    return _requestMediaKeySystemAccess(keySystem, configs);
};

console.log('patched requestMediaKeySystemAccess:', navigator.requestMediaKeySystemAccess.toString().slice(0, 50));
