import React from 'react';
import apiClient from '../../api/client';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    Typography,
} from '@mui/material';

// Libellés FR des tables référençant un composant (clés renvoyées par le backend).
const REFERENCE_LABELS = {
    stock: 'stock',
    movements: 'mouvements de stock',
    machine_loads: 'chargements machine',
    offers: 'offres fournisseurs',
    plan_assignments: 'plans de production',
    slot_pins: 'affectations feeder',
    manual_placements: 'placements manuels',
};

/**
 * Boîte de dialogue de suppression d'un composant (nettoyage de doublons).
 * Réutilisable depuis le catalogue Composants et l'onglet Stock.
 *
 * Props :
 *   - open : bool
 *   - component : { id, label } | null
 *   - onClose : () => void
 *   - onDeleted : (componentId) => void  (appelé après suppression réussie)
 */
function DeleteComponentDialog({ open, component, onClose, onDeleted }) {
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [references, setReferences] = React.useState(null); // dict renvoyé par un 409
    const [blockedMessage, setBlockedMessage] = React.useState(null);

    // Réinitialise l'état à chaque ouverture/changement de composant.
    React.useEffect(() => {
        if (open) {
            setBusy(false);
            setError(null);
            setReferences(null);
            setBlockedMessage(null);
        }
    }, [open, component?.id]);

    const handleDelete = async (force) => {
        if (!component?.id) return;
        setBusy(true);
        setError(null);
        try {
            await apiClient.delete(`/bom/components/${component.id}`, { params: { force } });
            onDeleted?.(component.id);
            onClose?.();
        } catch (err) {
            const status = err?.response?.status;
            const detail = err?.response?.data?.detail;
            if (status === 409 && detail && typeof detail === 'object') {
                setReferences(detail.references || {});
                setBlockedMessage(detail.message || 'Composant référencé — suppression bloquée.');
            } else {
                setError(
                    (typeof detail === 'string' && detail)
                    || err?.message
                    || 'Échec de la suppression du composant.',
                );
            }
        } finally {
            setBusy(false);
        }
    };

    const hasReferences = references && Object.keys(references).length > 0;
    const label = component?.label || (component?.id ? `#${component.id}` : '');

    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Supprimer le composant</DialogTitle>
            <DialogContent>
                <Stack spacing={1.5}>
                    <Typography variant="body2">
                        Supprimer définitivement <strong>{label}</strong>
                        {component?.id ? ` (#${component.id})` : ''} de la base de données ?
                    </Typography>

                    {hasReferences ? (
                        <Alert severity="warning" icon={<WarningAmberRoundedIcon />}>
                            <Stack spacing={1}>
                                <span>{blockedMessage} Il est utilisé par :</span>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                                    {Object.entries(references).map(([key, count]) => (
                                        <Chip
                                            key={key}
                                            size="small"
                                            color="warning"
                                            variant="outlined"
                                            label={`${REFERENCE_LABELS[key] || key} : ${count}`}
                                        />
                                    ))}
                                </Box>
                                <span>« Supprimer quand même » effacera aussi ces données liées. Action irréversible.</span>
                            </Stack>
                        </Alert>
                    ) : null}

                    {error ? <Alert severity="error">{error}</Alert> : null}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={busy} color="inherit">Annuler</Button>
                {hasReferences ? (
                    <Button
                        onClick={() => handleDelete(true)}
                        disabled={busy}
                        color="error"
                        variant="contained"
                        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
                    >
                        Supprimer quand même
                    </Button>
                ) : (
                    <Button
                        onClick={() => handleDelete(false)}
                        disabled={busy}
                        color="error"
                        variant="contained"
                        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : null}
                    >
                        Supprimer
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

export default DeleteComponentDialog;
