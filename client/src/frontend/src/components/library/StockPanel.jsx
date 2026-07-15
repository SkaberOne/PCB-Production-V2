import React from 'react';
import {
    Alert,
    Box,
    CircularProgress,
    Stack,
    Tab,
    Tabs,
} from '@mui/material';
import apiClient from '../../api/client';
import useEventStream from '../../hooks/useEventStream';
import StockInventoryTab from './StockInventoryTab';
import StockReceptionTab from './StockReceptionTab';

/**
 * Panneau « Stock » (ADR 0010) — orchestrateur des onglets Inventaire / Réception.
 * Porte l'état partagé : liste des soldes (rows), settings globaux, erreurs/feedback,
 * et le rafraîchissement (manuel + temps réel via SSE).
 */
function StockPanel() {
    const [rows, setRows] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(null);
    const [feedback, setFeedback] = React.useState(null);
    const [globalLoss, setGlobalLoss] = React.useState('');

    // Sous-onglets Inventaire / Réception.
    const [tab, setTab] = React.useState('inventaire');

    const refresh = React.useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            const [stockRes, settingsRes] = await Promise.all([
                apiClient.get('/marketplace/stock'),
                apiClient.get('/marketplace/stock/settings'),
            ]);
            setRows(Array.isArray(stockRes.data) ? stockRes.data : []);
            setGlobalLoss(String(settingsRes.data?.global_loss_pct ?? 0));
        } catch (err) {
            if (!silent) setError(err?.response?.data?.detail || 'Impossible de charger le stock.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        refresh();
    }, [refresh]);

    // Temps réel : rafraîchit silencieusement quand un autre poste modifie le stock.
    useEventStream('stock', React.useCallback(() => { refresh(true); }, [refresh]));

    const saveGlobalLoss = async () => {
        try {
            await apiClient.put('/marketplace/stock/settings', {
                global_loss_pct: Number(globalLoss) || 0,
            });
            setFeedback('Coefficient de perte global enregistré.');
        } catch (err) {
            setError(err?.response?.data?.detail || 'Échec de la sauvegarde du coefficient.');
        }
    };

    const handleComponentDeleted = (deletedId) => {
        setRows((prev) => prev.filter((r) => r.component_id !== deletedId));
        setFeedback('Composant supprimé de la base de données.');
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Stack spacing={2}>
            {error ? <Alert severity="error" onClose={() => setError(null)}>{error}</Alert> : null}
            {feedback ? <Alert severity="success" onClose={() => setFeedback(null)}>{feedback}</Alert> : null}

            <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 40 }}>
                <Tab value="inventaire" label="Inventaire" sx={{ minHeight: 40 }} />
                <Tab value="reception" label="Réception" sx={{ minHeight: 40 }} />
            </Tabs>

            {/* Les deux onglets restent montés (display:none) pour préserver leur état
                local (filtres, historique de réceptions) au changement d'onglet. */}
            <Box sx={{ display: tab === 'inventaire' ? 'block' : 'none' }}>
                <StockInventoryTab
                    rows={rows}
                    globalLoss={globalLoss}
                    onGlobalLossChange={setGlobalLoss}
                    onSaveGlobalLoss={saveGlobalLoss}
                    onRefresh={refresh}
                    onError={setError}
                    onFeedback={setFeedback}
                    onComponentDeleted={handleComponentDeleted}
                />
            </Box>
            <Box sx={{ display: tab === 'reception' ? 'block' : 'none' }}>
                <StockReceptionTab
                    rows={rows}
                    onRefresh={refresh}
                    onError={setError}
                    onFeedback={setFeedback}
                />
            </Box>
        </Stack>
    );
}

export default StockPanel;
