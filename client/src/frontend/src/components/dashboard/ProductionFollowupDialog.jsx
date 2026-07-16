import React from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import apiClient from '../../api/client';
import ProductionSuiviBar from './ProductionSuiviBar';

const EMPTY = { tested: '0', validated: '0', to_debug: '0', note: '' };

/**
 * Édition du suivi d'une production terminée : cartes testées / validées / à
 * débugger + note. Aperçu de la barre en direct. PATCH /productions/{id}/followup.
 */
function ProductionFollowupDialog({ open, production, onClose, onSaved }) {
    const [form, setForm] = React.useState(EMPTY);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);

    React.useEffect(() => {
        if (open && production) {
            setForm({
                tested: String(production.cards_tested ?? 0),
                validated: String(production.cards_validated ?? 0),
                to_debug: String(production.cards_to_debug ?? 0),
                note: production.followup_note || '',
            });
            setError(null);
        }
    }, [open, production]);

    const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

    const save = async () => {
        if (!production) return;
        setBusy(true);
        setError(null);
        try {
            await apiClient.patch(`/marketplace/productions/${production.id}/followup`, {
                cards_tested: Number(form.tested) || 0,
                cards_validated: Number(form.validated) || 0,
                cards_to_debug: Number(form.to_debug) || 0,
                note: form.note.trim() || null,
            });
            if (onSaved) onSaved();
            onClose();
        } catch (err) {
            setError(err?.response?.data?.detail || 'Enregistrement impossible.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
            <DialogTitle>Suivi — {production?.name || ''}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                        {production?.boards_produced ?? 0} carte(s) produite(s). Renseignez l'état des cartes.
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                        <ProductionSuiviBar
                            produced={production?.boards_produced}
                            tested={form.tested}
                            validated={form.validated}
                            toDebug={form.to_debug}
                            width={220}
                        />
                    </Box>
                    {error ? <Alert severity="error" onClose={() => setError(null)}>{error}</Alert> : null}
                    <Stack direction="row" spacing={1.5}>
                        <TextField
                            size="small"
                            type="number"
                            label="Testées"
                            value={form.tested}
                            onChange={set('tested')}
                            inputProps={{ min: 0 }}
                            fullWidth
                        />
                        <TextField
                            size="small"
                            type="number"
                            label="Validées"
                            value={form.validated}
                            onChange={set('validated')}
                            inputProps={{ min: 0 }}
                            fullWidth
                        />
                        <TextField
                            size="small"
                            type="number"
                            label="À débugger"
                            value={form.to_debug}
                            onChange={set('to_debug')}
                            inputProps={{ min: 0 }}
                            fullWidth
                        />
                    </Stack>
                    <TextField
                        size="small"
                        label="Note"
                        placeholder="ex. 2 cartes HS condensateur C3…"
                        value={form.note}
                        onChange={set('note')}
                        multiline
                        minRows={2}
                        inputProps={{ maxLength: 1000 }}
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose} disabled={busy}>Annuler</Button>
                <Button variant="contained" color="success" onClick={save} disabled={busy}>Enregistrer</Button>
            </DialogActions>
        </Dialog>
    );
}

export default ProductionFollowupDialog;
