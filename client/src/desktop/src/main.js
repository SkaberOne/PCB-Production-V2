const { app, BrowserWindow, Menu, dialog } = require('electron');
const { existsSync } = require('fs');
const path = require('path');

const desktopPackage = require('../package.json');

let mainWindow;
const isDev = !app.isPackaged;
const devServerUrl = 'http://localhost:3000';
const appVersion = app.getVersion() || desktopPackage.version || '0.0.0';

const resolveFrontendEntry = () => {
    const packagedBuild = path.join(process.resourcesPath, 'frontend', 'build', 'index.html');
    const localBuild = path.join(__dirname, '../../frontend/build/index.html');

    if (!isDev && existsSync(packagedBuild)) {
        return `file://${packagedBuild}`;
    }

    if (existsSync(localBuild)) {
        return `file://${localBuild}`;
    }

    return null;
};

const loadFallbackScreen = (windowInstance) => {
    const html = `
        <html lang="fr">
            <head>
                <meta charset="utf-8" />
                <title>PCB Production Manager</title>
                <style>
                    body {
                        margin: 0;
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-family: "Segoe UI", Tahoma, sans-serif;
                        background: linear-gradient(180deg, #123448, #1d5f74);
                        color: #f7fafc;
                    }
                    main {
                        max-width: 720px;
                        padding: 32px;
                        border-radius: 20px;
                        background: rgba(255, 255, 255, 0.08);
                        border: 1px solid rgba(255, 255, 255, 0.12);
                    }
                    h1 { margin-top: 0; }
                    code {
                        display: inline-block;
                        padding: 2px 6px;
                        border-radius: 8px;
                        background: rgba(255,255,255,0.12);
                    }
                </style>
            </head>
            <body>
                <main>
                    <h1>Frontend non compile</h1>
                    <p>Le shell desktop est pret, mais le build frontend est introuvable.</p>
                    <p>En developpement, lance le frontend sur <code>http://localhost:3000</code>. Pour le packaging, genere d'abord le build React.</p>
                </main>
            </body>
        </html>
    `;

    windowInstance.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
};

const loadRenderer = async (windowInstance) => {
    if (isDev) {
        try {
            await windowInstance.loadURL(devServerUrl);
            windowInstance.webContents.openDevTools();
            return;
        } catch (error) {
            console.warn('Dev server React indisponible, tentative de fallback local.');
        }
    }

    const frontendEntry = resolveFrontendEntry();

    if (frontendEntry) {
        await windowInstance.loadURL(frontendEntry);
        return;
    }

    loadFallbackScreen(windowInstance);
};

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1180,
        minHeight: 760,
        title: 'PCB Production Manager',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    loadRenderer(mainWindow).catch(() => {
        if (mainWindow) {
            loadFallbackScreen(mainWindow);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

const template = [
    {
        label: 'Fichier',
        submenu: [
            {
                label: 'Quitter',
                accelerator: 'CmdOrCtrl+Q',
                click: () => app.quit()
            }
        ]
    },
    {
        label: 'Edition',
        submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' }
        ]
    },
    {
        label: 'Affichage',
        submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
        ]
    },
    {
        label: 'Aide',
        submenu: [
            {
                label: 'A propos',
                click: () => {
                    dialog.showMessageBox(mainWindow, {
                        type: 'info',
                        title: 'A propos',
                        message: 'PCB Production Manager',
                        detail: `Version ${appVersion}`,
                        buttons: ['OK']
                    });
                }
            }
        ]
    }
];

Menu.setApplicationMenu(Menu.buildFromTemplate(template));
