// Config Playwright — prompt 004.
// Deux modes via variables d'environnement :
//   - défaut : Playwright démarre une **stack de test locale** (backend FastAPI
//     en SQLite servant le build front `build-e2e`) sur E2E_PORT, sans dépendre
//     du LAN. C'est ce mode qui tourne en CI (stack dans le runner).
//   - PW_BASE_URL=http://LAPTOP-053:8001 : joue les tests contre une instance
//     déjà démarrée (ex. staging), sans lancer de webServer.
//
// Chromium : Playwright utilise le navigateur installé (PLAYWRIGHT_BROWSERS_PATH
// est déjà positionné dans l'environnement orchestrateur — ne pas re-télécharger).
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const PORT = process.env.E2E_PORT || '8099';
const EXTERNAL = process.env.PW_BASE_URL;
const BASE_URL = EXTERNAL || `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      // Override optionnel du binaire Chromium (ex. navigateur pré-installé de
      // l'environnement orchestrateur). Non défini en CI/local standard.
      ...(process.env.PW_CHROMIUM_PATH
        ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
        : {}),
    },
  }],
  webServer: EXTERNAL ? undefined : {
    command: `python -m uvicorn src.app:app --host 127.0.0.1 --port ${PORT}`,
    cwd: path.join(__dirname, '..', 'serveur'),
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      DATABASE_URL: 'sqlite:///./e2e_test.db',
      WEB_STATIC_DIR: path.join(__dirname, '..', 'client', 'src', 'frontend', 'build-e2e'),
      PYTHONPATH: path.join(__dirname, '..', 'serveur'),
      API_ENV: 'development',
    },
  },
});
