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

    // Platform info
    platform: process.platform,
    nodeVersion: process.versions.node,
    chromeVersion: process.versions.chrome,
    electronVersion: process.versions.electron
});
