/**
 * Centralized axios client for ECB Production Manager API.
 *
 * Usage:
 *   import apiClient from '../api/client';
 *   const res = await apiClient.get('/bom/references');
 *
 * Base URL resolution (ADR 0006), in priority order:
 *   1. window.electronAPI.getBackendUrl() — URL/port injectés par Electron au
 *      runtime quand l'app tourne packagée (backend sur un port libre dynamique).
 *   2. process.env.REACT_APP_API_URL — dev navigateur / build configuré.
 *   3. http://localhost:8000/api — repli dev par défaut.
 *
 * Errors are intercepted globally: network failures log to console,
 * HTTP errors expose response.data.detail when available.
 */

import axios from 'axios';

function resolveBaseUrl() {
    // Electron injecte l'URL backend (port dynamique) via le preload.
    if (typeof window !== 'undefined' && window.electronAPI
        && typeof window.electronAPI.getBackendUrl === 'function') {
        const injected = window.electronAPI.getBackendUrl();
        if (injected) return injected;
    }
    return process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
}

function resolveApiKey() {
    // Clé X-API-Key injectée par Electron en mode packagé (auth obligatoire).
    if (typeof window !== 'undefined' && window.electronAPI
        && typeof window.electronAPI.getApiKey === 'function') {
        return window.electronAPI.getApiKey() || null;
    }
    return null;
}

const BASE_URL = resolveBaseUrl();
const API_KEY = resolveApiKey();

const apiClient = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
        // En mode packagé, toutes les requêtes portent la clé de session.
        ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
    },
});

// ── Event helpers (used by AppShell to show loading bar + error banner) ───────
let _pendingRequests = 0;

function _emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
}

// ── Request interceptor ───────────────────────────────────────────────────────
apiClient.interceptors.request.use(
    (config) => {
        _pendingRequests += 1;
        if (_pendingRequests === 1) _emit('api:loading:start');
        return config;
    },
    (error) => Promise.reject(error),
);

// ── Response interceptor ─────────────────────────────────────────────────────
apiClient.interceptors.response.use(
    (response) => {
        _pendingRequests = Math.max(0, _pendingRequests - 1);
        if (_pendingRequests === 0) _emit('api:loading:end');
        return response;
    },
    (error) => {
        _pendingRequests = Math.max(0, _pendingRequests - 1);
        if (_pendingRequests === 0) _emit('api:loading:end');

        // Requête annulée volontairement (AbortController) — ne pas logger comme erreur
        if (error.code === 'ERR_CANCELED' || error.name === 'CanceledError') {
            return Promise.reject(error);
        }

        if (error.response) {
            // Server replied with a non-2xx status
            const status = error.response.status;
            const detail = error.response.data?.detail || error.response.statusText;
            console.error(`API error ${status}:`, detail);
        } else if (error.request) {
            // Request sent but no response received — backend unreachable
            console.error('API unreachable — no response received:', error.message);
            _emit('api:backend:down', { message: error.message });
        } else {
            console.error('API request setup error:', error.message);
        }
        return Promise.reject(error);
    },
);

export default apiClient;

/**
 * Helper: extract a user-friendly error message from an axios error.
 * Use in catch blocks instead of error.message.
 *
 * Example:
 *   catch (err) { setError(extractApiError(err)); }
 */
export function extractApiError(error) {
    // Annulation volontaire (AbortController) — ne pas exposer à l'utilisateur
    if (error.code === 'ERR_CANCELED' || error.name === 'CanceledError') {
        return null;
    }
    if (error.response) {
        const detail = error.response.data?.detail;
        if (detail) {
            return Array.isArray(detail)
                ? detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
                : String(detail);
        }
        return `Erreur ${error.response.status}: ${error.response.statusText}`;
    }
    if (error.request) {
        return 'Serveur injoignable. Vérifiez que le serveur est démarré.';
    }
    return error.message || 'Erreur inconnue';
}
