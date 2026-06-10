const { app, BrowserWindow, Menu, dialog, ipcMain, shell, session } = require('electron');
const fs = require('fs');
const { existsSync } = fs;
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const desktopPackage = require('../package.json');

// Auto-update (ADR 0007). Chargé paresseusement : absent en dev tant que
// `npm install` n'a pas tourné → on ne casse pas le lancement.
let autoUpdater = null;
try {
    ({ autoUpdater } = require('electron-updater'));
} catch (err) {
    // electron-updater non disponible : auto-update désactivé (dev).
}
let manualUpdateCheck = false;

let mainWindow;
let backendProcess = null;
let backendUrl = null; // ex: http://127.0.0.1:54321/api  (null en dev → fallback REACT_APP_API_URL)
let backendPort = null;
let apiKey = null; // clé X-API-Key de session (générée au lancement packagé, ADR 0007/Phase B)

// PCBFLOW_FORCE_PROD=1 force le comportement « packagé » (spawn backend + build
// React local) même hors installeur — utile pour valider le runtime sans signer.
const isDev = !app.isPackaged && process.env.PCBFLOW_FORCE_PROD !== '1';
const devServerUrl = 'http://localhost:3000';
const appVersion = app.getVersion() || desktopPackage.version || '0.0.0';

// ───────────────────────── Backend packagé (ADR 0006) ─────────────────────────

/** Détecte un port TCP libre sur 127.0.0.1 (évite le 8000 figé + collisions). */
const findFreePort = () =>
    new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });

/** Localise pcb-flow-server.exe : embarqué (extraResources) ou build local de test. */
const resolveBackendExe = () => {
    const packaged = path.join(process.resourcesPath, 'pcb-flow-server', 'pcb-flow-server.exe');
    if (existsSync(packaged)) return packaged;

    // Repli : build local depuis les sources (serveur/dist/pcb-flow-server/) pour tester
    // un lancement « façon packagé » sans installer l'app.
    const local = path.join(__dirname, '../../../../serveur/dist/pcb-flow-server/pcb-flow-server.exe');
    if (existsSync(local)) return local;

    return null;
};

/** Modèle de config runtime, écrit au 1er lancement (éditable post-install). */
const DEFAULT_ENV_TEMPLATE = `# Configuration PCB Flow Production Suite (éditable, relancez l'app après modif).
# --- Base de données ---
# Cible production : SQL Server central (renseignez vos paramètres).
SQL_SERVER_HOST=
SQL_SERVER_PORT=1433
SQL_SERVER_USER=
SQL_SERVER_PASSWORD=
SQL_SERVER_DATABASE=ECB_Production
SQL_SERVER_DRIVER=ODBC Driver 17 for SQL Server
# Pour un poste de test local sans SQL Server, décommentez :
# DATABASE_URL=sqlite:///./database/dev.db

# --- Limites / divers ---
MAX_UPLOAD_MB=25

# --- Feature flags (fonctionnalités en cours, désactivées par défaut) ---
# FEATURE_MACHINE_PNP_PLAN=0
`;

/** Écrit un .env par défaut dans le dossier de données s'il est absent (D12). */
const seedDefaultConfig = (dataDir) => {
    const envPath = path.join(dataDir, '.env');
    if (!existsSync(envPath)) {
        fs.writeFileSync(envPath, DEFAULT_ENV_TEMPLATE, 'utf-8');
    }
    // Dossiers runtime inscriptibles.
    for (const sub of ['database', 'logs', 'uploads', 'exports', 'backups']) {
        fs.mkdirSync(path.join(dataDir, sub), { recursive: true });
    }
};

/** Démarre le backend sur 127.0.0.1:<port>. */
const startBackend = (port) => {
    const exe = resolveBackendExe();
    if (!exe) {
        throw new Error(
            'pcb-flow-server.exe introuvable. Construisez-le via serveur\\CONSTRUIRE_SERVEUR.bat '
            + 'ou vérifiez l\'embarquement extraResources.',
        );
    }

    const childEnv = {
        ...process.env,
        PCBFLOW_SERVER_HOST: '127.0.0.1',
        PCBFLOW_SERVER_PORT: String(port),
        // Mode production : /docs et /redoc désactivés côté backend (D10).
        API_ENV: 'production',
        // Auth obligatoire (D5) : on impose NOTRE clé de session, ce qui écrase
        // au passage une éventuelle API_KEY d'environnement polluée.
        API_KEY: apiKey || '',
    };

    // Config runtime éditable post-install (D12) : une fois installé, les
    // ressources (Program Files) sont en lecture seule. Le backend lit/écrit
    // donc dans un dossier inscriptible par utilisateur (.env, logs, uploads…).
    if (app.isPackaged) {
        const dataDir = path.join(app.getPath('userData'), 'server');
        try {
            fs.mkdirSync(dataDir, { recursive: true });
            seedDefaultConfig(dataDir);
            childEnv.PCBFLOW_DATA_DIR = dataDir;
        } catch (err) {
            console.error('Préparation du dossier de données échouée:', err);
        }
    }

    backendProcess = spawn(exe, ['--host', '127.0.0.1', '--port', String(port)], {
        cwd: path.dirname(exe),
        env: childEnv,
        stdio: 'ignore',
        windowsHide: true,
    });

    backendProcess.on('exit', () => {
        backendProcess = null;
    });

    backendProcess.on('error', (err) => {
        console.error('Backend spawn error:', err);
        backendProcess = null;
    });
};

/** Attend que GET /api/health réponde 200 (timeout borné). */
const waitForHealth = (port, timeoutMs = 30000) => {
    const url = `http://127.0.0.1:${port}/api/health`;
    const start = Date.now();

    return new Promise((resolve, reject) => {
        const retry = () => {
            if (Date.now() - start > timeoutMs) {
                reject(new Error('Le backend n\'a pas répondu dans le délai imparti.'));
            } else {
                setTimeout(attempt, 500);
            }
        };

        const attempt = () => {
            const req = http.get(url, (res) => {
                if (res.statusCode === 200) {
                    res.resume();
                    resolve();
                } else {
                    res.resume();
                    retry();
                }
            });
            req.on('error', retry);
            req.setTimeout(2000, () => {
                req.destroy();
                retry();
            });
        };

        attempt();
    });
};

/** Tue proprement le process backend (anti-orphelin). */
const stopBackend = () => {
    if (backendProcess && !backendProcess.killed) {
        try {
            backendProcess.kill();
        } catch (err) {
            console.warn('stopBackend:', err.message);
        }
    }
    backendProcess = null;
};

// ───────────────────────── Écrans (attente / erreur) ─────────────────────────

const screenShell = (title, body) => `
    <html lang="fr">
        <head>
            <meta charset="utf-8" />
            <title>${title}</title>
            <style>
                body {
                    margin: 0; min-height: 100vh;
                    display: flex; align-items: center; justify-content: center;
                    font-family: "Segoe UI", Tahoma, sans-serif;
                    background: linear-gradient(180deg, #123448, #1d5f74);
                    color: #f7fafc;
                }
                main {
                    max-width: 720px; padding: 32px; border-radius: 20px;
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.12);
                    text-align: center;
                }
                h1 { margin-top: 0; }
                .spinner {
                    margin: 18px auto 0; width: 36px; height: 36px;
                    border: 4px solid rgba(255,255,255,0.25);
                    border-top-color: #f7fafc; border-radius: 50%;
                    animation: spin 0.9s linear infinite;
                }
                code {
                    display: inline-block; padding: 2px 6px; border-radius: 8px;
                    background: rgba(255,255,255,0.12);
                }
                @keyframes spin { to { transform: rotate(360deg); } }
            </style>
        </head>
        <body><main>${body}</main></body>
    </html>
`;

const loadLoadingScreen = (win) => {
    const html = screenShell(
        'PCB Flow Production Suite',
        '<h1>Démarrage…</h1><p>Initialisation du moteur de production.</p><div class="spinner"></div>',
    );
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
};

const loadBackendErrorScreen = (win, error) => {
    const html = screenShell(
        'Backend indisponible',
        `<h1>Backend indisponible</h1>
         <p>Le moteur de production n'a pas pu démarrer.</p>
         <p><code>${(error && error.message ? error.message : String(error)).replace(/</g, '&lt;')}</code></p>
         <p>Fermez puis relancez l'application. Si le problème persiste, vérifiez le pilote
         <strong>ODBC Driver 17</strong> et la connexion à la base.</p>`,
    );
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
};

// ───────────────────────── Renderer (build React) ─────────────────────────

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

const loadFallbackScreen = (win) => {
    const html = screenShell(
        'Frontend non compilé',
        `<h1>Frontend non compilé</h1>
         <p>Le shell desktop est prêt, mais le build frontend est introuvable.</p>
         <p>En dev, lance le frontend sur <code>http://localhost:3000</code>.
         Pour le packaging, génère d'abord le build React.</p>`,
    );
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
};

const loadRenderer = async (win) => {
    if (isDev) {
        try {
            await win.loadURL(devServerUrl);
            win.webContents.openDevTools();
            return;
        } catch (error) {
            console.warn('Dev server React indisponible, tentative de fallback local.');
        }
    }

    const frontendEntry = resolveFrontendEntry();
    if (frontendEntry) {
        await win.loadURL(frontendEntry);
        return;
    }
    loadFallbackScreen(win);
};

/** Content-Security-Policy appliquée à tout le contenu rendu (D13). */
const hardenSession = () => {
    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",      // 'unsafe-inline' requis par le runtime CRA
        "style-src 'self' 'unsafe-inline'",       // styles inline MUI
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self' http://127.0.0.1:* http://localhost:*",  // backend local
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join('; ');

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [csp],
            },
        });
    });
};

/** Verrouille la surface d'attaque d'une fenêtre : pas de pop-up ni navigation externe. */
const hardenWindow = (win) => {
    // Aucune fenêtre interne ; les liens http(s) s'ouvrent dans le navigateur système.
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });
    // Bloque toute navigation pleine page hors de l'app (le routage interne est
    // en hash → géré en in-page, non concerné).
    win.webContents.on('will-navigate', (event, url) => {
        if (url !== win.webContents.getURL()) {
            event.preventDefault();
            if (url.startsWith('http://') || url.startsWith('https://')) {
                shell.openExternal(url);
            }
        }
    });
};

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1180,
        minHeight: 760,
        title: 'PCB Flow Production Suite',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            // Electron 20+ sandboxe le renderer par défaut, ce qui empêche le
            // preload de faire require() (package.json) → contextBridge ne
            // s'exécute pas → window.electronAPI absent → getBackendUrl() KO.
            // sandbox:false rétablit l'accès Node du preload (l'isolation de
            // contexte reste active, + CSP/navigation durcies ci-dessous).
            sandbox: false,
        },
    });

    hardenWindow(mainWindow);
    loadLoadingScreen(mainWindow);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

// ───────────────────────── Auto-update (ADR 0007) ─────────────────────────

/** Branche les événements de l'updater (une seule fois). */
const setupAutoUpdater = () => {
    if (!autoUpdater) return;

    autoUpdater.on('update-available', () => {
        if (manualUpdateCheck && mainWindow) {
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Mise à jour disponible',
                message: 'Une nouvelle version est disponible.',
                detail: 'Téléchargement en cours… vous serez notifié une fois prête.',
                buttons: ['OK'],
            });
        }
    });

    autoUpdater.on('update-not-available', () => {
        if (manualUpdateCheck && mainWindow) {
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'À jour',
                message: 'Vous utilisez déjà la dernière version.',
                buttons: ['OK'],
            });
        }
        manualUpdateCheck = false;
    });

    autoUpdater.on('update-downloaded', (info) => {
        if (!mainWindow) return;
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Mise à jour prête',
            message: `La version ${info && info.version ? info.version : ''} a été téléchargée.`,
            detail: 'Redémarrer maintenant pour l\'installer ?',
            buttons: ['Redémarrer', 'Plus tard'],
            defaultId: 0,
            cancelId: 1,
        }).then(({ response }) => {
            // (isSilent=false, isForceRunAfter=true) : relance l'app après
            // l'installation de la MAJ (sinon elle s'installe mais ne redémarre pas).
            if (response === 0) autoUpdater.quitAndInstall(false, true);
        });
    });

    autoUpdater.on('error', (err) => {
        console.error('autoUpdater error:', err);
        if (manualUpdateCheck && mainWindow) {
            dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Échec de la vérification',
                message: 'Impossible de vérifier les mises à jour.',
                detail: String(err && err.message ? err.message : err),
                buttons: ['OK'],
            });
            manualUpdateCheck = false;
        }
    });
};

/** Vérifie les mises à jour. `manual=true` → retour visuel même si aucune MAJ. */
const checkForUpdates = (manual) => {
    if (!app.isPackaged || !autoUpdater) {
        if (manual && mainWindow) {
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Mises à jour',
                message: 'Disponible uniquement dans l\'application installée.',
                buttons: ['OK'],
            });
        }
        return;
    }
    manualUpdateCheck = !!manual;
    autoUpdater.checkForUpdates().catch((err) => {
        console.error('checkForUpdates:', err);
    });
};

// ───────────────────────── Séquence de démarrage ─────────────────────────

const bootstrap = async () => {
    createWindow();

    // En dev, le backend est lancé séparément (DEMARRER_SERVEUR.bat) et le renderer
    // tape REACT_APP_API_URL. On ne spawn le backend packagé qu'en mode packagé.
    if (!isDev) {
        try {
            // Clé de session générée AVANT le spawn (passée au backend + renderer).
            apiKey = crypto.randomBytes(24).toString('hex');
            backendPort = await findFreePort();
            startBackend(backendPort);
            await waitForHealth(backendPort);
            backendUrl = `http://127.0.0.1:${backendPort}/api`;
        } catch (error) {
            console.error('Échec du démarrage backend:', error);
            if (mainWindow) loadBackendErrorScreen(mainWindow, error);
            return;
        }
    }

    if (mainWindow) {
        await loadRenderer(mainWindow);
    }

    // Auto-update au démarrage (uniquement app installée).
    if (app.isPackaged && autoUpdater) {
        setupAutoUpdater();
        autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error('autoUpdate:', err));
    }
};

// URL backend + clé API exposées au renderer (synchrone, lues au chargement
// par api/client.js). null en dev → pas d'en-tête, backend dev ouvert.
ipcMain.on('ecb:get-backend-url', (event) => {
    event.returnValue = backendUrl;
});
ipcMain.on('ecb:get-api-key', (event) => {
    event.returnValue = apiKey;
});

app.whenReady().then(() => {
    hardenSession();
    bootstrap();
});

app.on('before-quit', stopBackend);

app.on('window-all-closed', () => {
    stopBackend();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        bootstrap();
    }
});

// ───────────────────────── Menu ─────────────────────────

// En prod, on retire reload / forceReload / toggleDevTools (surface d'attaque
// + confusion utilisateur). Ils restent disponibles en dev.
const viewSubmenu = [];
if (isDev) {
    viewSubmenu.push(
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
    );
}
viewSubmenu.push(
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
);

const template = [
    {
        label: 'Fichier',
        submenu: [
            { label: 'Quitter', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
        ],
    },
    {
        label: 'Edition',
        submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
        ],
    },
    {
        label: 'Affichage',
        submenu: viewSubmenu,
    },
    {
        label: 'Aide',
        submenu: [
            {
                label: 'Rechercher les mises à jour',
                click: () => checkForUpdates(true),
            },
            { type: 'separator' },
            {
                label: 'A propos',
                click: () => {
                    dialog.showMessageBox(mainWindow, {
                        type: 'info',
                        title: 'A propos',
                        message: 'PCB Flow Production Suite',
                        detail: `Version ${appVersion}`,
                        buttons: ['OK'],
                    });
                },
            },
        ],
    },
];

Menu.setApplicationMenu(Menu.buildFromTemplate(template));
