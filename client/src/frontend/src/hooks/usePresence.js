import React from 'react';
import apiClient from '../api/client';

// Présence par production (ADR 0013 phase 3). Chaque onglet a un identifiant de
// session éphémère (sessionStorage : stable au rechargement, propre à l'onglet,
// effacé à la fermeture). On envoie un heartbeat périodique et on lit le nombre
// de postes présents. Aucune identité persistée.

const SESSION_KEY = 'pcb-presence-session-id';
const HEARTBEAT_MS = 10000;

function getSessionId() {
    try {
        let id = sessionStorage.getItem(SESSION_KEY);
        if (!id) {
            id = `poste-${Math.random().toString(36).slice(2, 10)}`;
            sessionStorage.setItem(SESSION_KEY, id);
        }
        return id;
    } catch (e) {
        return `poste-${Math.random().toString(36).slice(2, 10)}`;
    }
}

export default function usePresence(productionId) {
    const [count, setCount] = React.useState(0);

    React.useEffect(() => {
        if (!productionId) {
            setCount(0);
            return undefined;
        }
        const sessionId = getSessionId();
        let stopped = false;

        const beat = async () => {
            try {
                const res = await apiClient.post('/marketplace/presence/heartbeat', {
                    production_id: productionId,
                    session_id: sessionId,
                });
                if (!stopped) setCount(res.data?.count || 0);
            } catch (e) {
                /* présence best-effort : on ignore les erreurs réseau */
            }
        };

        beat();
        const interval = setInterval(beat, HEARTBEAT_MS);

        return () => {
            stopped = true;
            clearInterval(interval);
            // Départ (best-effort) pour libérer la place sans attendre le TTL.
            apiClient
                .post('/marketplace/presence/leave', { production_id: productionId, session_id: sessionId })
                .catch(() => {});
        };
    }, [productionId]);

    return count;
}
