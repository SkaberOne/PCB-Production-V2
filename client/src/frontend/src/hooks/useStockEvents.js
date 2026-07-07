import React from 'react';
import apiClient, { getStoredApiKey } from '../api/client';

// Temps réel du canal « stock » (ADR 0013 phase 4) via Server-Sent Events.
// On utilise fetch + ReadableStream (et non EventSource) afin de pouvoir envoyer
// l'en-tête X-API-Key. À chaque événement `stock`, le callback est appelé — les
// écrans concernés se rafraîchissent alors silencieusement. Reconnexion auto.

function resolveApiKey() {
    try {
        if (typeof window !== 'undefined' && window.electronAPI
            && typeof window.electronAPI.getApiKey === 'function') {
            const k = window.electronAPI.getApiKey();
            if (k) return k;
        }
    } catch (e) { /* ignore */ }
    return getStoredApiKey() || null;
}

export default function useStockEvents(onStockEvent) {
    const cbRef = React.useRef(onStockEvent);
    cbRef.current = onStockEvent;

    React.useEffect(() => {
        // Environnements sans streaming (tests jsdom, SSR) : ne rien faire.
        if (typeof fetch !== 'function' || typeof AbortController !== 'function') {
            return undefined;
        }
        let cancelled = false;
        let controller = null;

        const connect = async () => {
            controller = new AbortController();
            try {
                const base = apiClient.defaults.baseURL || '';
                const key = resolveApiKey();
                const res = await fetch(`${base}/marketplace/events?topics=stock`, {
                    headers: key ? { 'X-API-Key': key } : {},
                    signal: controller.signal,
                });
                if (!res.ok || !res.body) throw new Error('SSE indisponible');

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                while (!cancelled) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    let sep;
                    while ((sep = buffer.indexOf('\n\n')) >= 0) {
                        const frame = buffer.slice(0, sep);
                        buffer = buffer.slice(sep + 2);
                        if (!frame || frame.startsWith(':')) continue; // heartbeat/commentaire
                        let event = 'message';
                        let data = '';
                        frame.split('\n').forEach((line) => {
                            if (line.startsWith('event:')) event = line.slice(6).trim();
                            else if (line.startsWith('data:')) data += line.slice(5).trim();
                        });
                        if (event === 'stock' && cbRef.current) {
                            let parsed = {};
                            try { parsed = data ? JSON.parse(data) : {}; } catch (e) { /* ignore */ }
                            cbRef.current(parsed);
                        }
                    }
                }
            } catch (e) {
                /* connexion perdue / abandonnée */
            }
            // Reconnexion après un court délai, sauf si le composant est démonté.
            if (!cancelled) {
                await new Promise((r) => setTimeout(r, 3000));
                if (!cancelled) connect();
            }
        };

        connect();
        return () => {
            cancelled = true;
            if (controller) controller.abort();
        };
    }, []);
}
