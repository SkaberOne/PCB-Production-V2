const { contextBridge, ipcRenderer } = require('electron');
const desktopPackage = require('../package.json');

const appVersion = desktopPackage.version || '0.0.0';

// Expose APIs to React app
contextBridge.exposeInMainWorld('electronAPI', {
    // Example: send messages to main process
    send: (channel, data) => {
        ipcRenderer.send(channel, data);
    },

    // Example: receive messages from main process
    // Remove existing listener before adding to prevent accumulation (memory leak guard)
    receive: (channel, func) => {
        ipcRenderer.removeAllListeners(channel);
        ipcRenderer.on(channel, (event, ...args) => func(...args));
    },

    // Get app version
    getVersion: () => appVersion,

    // URL du backend injectée par le process principal au runtime (ADR 0006).
    // Synchrone : lue au chargement par api/client.js. null en dev → fallback.
    getBackendUrl: () => {
        try {
            return ipcRenderer.sendSync('ecb:get-backend-url');
        } catch (err) {
            return null;
        }
    },

    // Clé X-API-Key de session, injectée par le process principal (Phase B).
    getApiKey: () => {
        try {
            return ipcRenderer.sendSync('ecb:get-api-key');
        } catch (err) {
            return null;
        }
    },

    // Config base de données pilotée par Electron (ADR 0009). Éditée hors backend
    // pour rester accessible même quand la base est injoignable (fail-fast).
    // Le mot de passe n'est jamais renvoyé (get() expose seulement `passwordSet`).
    dbConfig: {
        get: () => ipcRenderer.invoke('ecb:db-config:get'),
        test: (cfg) => ipcRenderer.invoke('ecb:db-config:test', cfg),
        save: (cfg) => ipcRenderer.invoke('ecb:db-config:save', cfg),
        restart: () => ipcRenderer.invoke('ecb:db-config:restart'),
    },
    runtimeStatus: () => ipcRenderer.invoke('ecb:runtime:status'),

    // Platform info
    platform: process.platform,
    nodeVersion: process.versions.node,
    chromeVersion: process.versions.chrome,
    electronVersion: process.versions.electron
});
