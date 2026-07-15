import React from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import apiClient from '../../api/client';

function fmtDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        });
    } catch (_) {
        return '';
    }
}

/**
 * « Corriger les lots » d'une production : liste les lots déclarés (runs), permet
 * de **corriger** le nombre de cartes d'un lot (remplace, ne s'additionne pas) ou
 * de l'annuler. Le total de cartes produites reflète la correction.
 */
function ProductionRunsDialog({ open, production, onClose, onChanged }) {
    const pid = production?.id;
    const [runs, setRuns] = React.useState(null);
    const [drafts, setDrafts] = React.useState({});
    const [busy, setBusy] = React.useState(null);
    const [error, setError] = React.useState(null);

    const load = React.useCallback(async () => {
        if (!pid) return;
        try {
            const res = await apiClient.get(`/marketplace/productions/${pid}/runs`);
            const list = Array.isArray(res.data) ? res.data.filter((r) => !r.is_cancelled) : [];
            setRuns(list);
            setDrafts(Object.fromEntries(list.map((r) => [r.id, String(r.boards_produced)])));
        } catch (err) {
            setError(err?.response?.data?.detail || 'Lots indisponibles.');
            setRuns([]);
        }
    }, [pid]);

    React.useEffect(() => {
        if (open) { setError(null); setRuns(null); load(); }
    }, [open, load]);

    const save = async (run) => {
        const v = Number(drafts[run.id]);
        if (!(v >= 0) || v === run.boards_produced) return;
        setBusy(run.id);
        setError(null);
        try {
            await apiClient.patch(`/marketplace/productions/${pid}/runs/${run.id}`, { boards_produced: v });
            await load();
            if (onChanged) onChanged();
        } catch (err) {
            setError(err?.response?.data?.detail || 'Correction impossible.');
        } finally {
            setBusy(null);
        }
    };

    const cancelRun = async (run) => {
        setBusy(run.id);
        setError(null);
        try {
            await apiClient.post(`/marketplace/productions/${pid}/runs/${run.id}/cancel`);
            await load();
            if (onChanged) onChanged();
        } catch (err) {
            setError(err?.response?.data?.detail || "Annulation impossible.");
        } finally {
            setBusy(null);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>Corriger les lots — {production?.name || ''}</DialogTitle>
            <DialogContent>
                <Typography variant="body2" sx={{ color: '#a1a1aa', mb: 1.5 }}>
                    Corrigez le nombre de cartes d'un lot déjà déclaré (ça <b>remplace</b> la
                    valeur, sans l'additionner) ou annulez-le. Le stock est réajusté.
                </Typography>
                {error ? <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>{error}</Alert> : null}
                {runs === null ? (
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>Chargement…</Typography>
                ) : runs.length === 0 ? (
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>Aucun lot déclaré.</Typography>
                ) : (
                    <Stack spacing={1}>
                        {runs.map((run) => {
                            const changed = String(drafts[run.id]) !== String(run.boards_produced);
                            return (
                                <Box
                                    key={run.id}
                                    sx={{ border: '1px solid #27272a', borderRadius: 2, p: 1, display: 'flex', alignItems: 'center', gap: 1 }}
                                >
                                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                        <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                                            Lot #{run.id} · {fmtDate(run.created_at)}
                                            {run.created_by ? ` · ${run.created_by}` : ''}
                                            {run.machine_id ? ' · machine' : ' · à la main'}
                                        </Typography>
                                    </Box>
                                    <TextField
                                        size="small"
                                        type="number"
                                        label="Cartes"
                                        value={drafts[run.id] ?? ''}
                                        onChange={(e) => setDrafts((prev) => ({ ...prev, [run.id]: e.target.value }))}
                                        sx={{ width: 110 }}
                                        inputProps={{ min: 0 }}
                                        disabled={busy === run.id}
                                    />
                                    <IconButton
                                        size="small"
                                        color="success"
                                        title="Enregistrer la correction"
                                        disabled={!changed || busy === run.id || !(Number(drafts[run.id]) >= 0)}
                                        onClick={() => save(run)}
                                    >
                                        <CheckRoundedIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        color="inherit"
                                        title="Annuler ce lot"
                                        disabled={busy === run.id}
                                        onClick={() => cancelRun(run)}
                                    >
                                        <UndoRoundedIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            );
                        })}
                    </Stack>
                )}
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose}>Fermer</Button>
            </DialogActions>
        </Dialog>
    );
}

export default ProductionRunsDialog;
