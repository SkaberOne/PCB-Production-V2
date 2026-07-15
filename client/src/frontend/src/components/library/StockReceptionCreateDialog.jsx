import React from 'react';
import {
    Alert,
    Autocomplete,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import apiClient, { extractApiError } from '../../api/client';

const EMPTY = { mpn: '', value: '', footprint: '', componentType: '', qty: '' };

/**
 * Dialog « Créer et réceptionner » : composant absent de la base, créé à la
 * volée au moment de la réception (POST /marketplace/stock/receptions).
 * Le backend dédoublonne par MPN : si le MPN existe déjà, le composant
 * existant est réutilisé (aucun doublon créé).
 */
function StockReceptionCreateDialog({ open, onClose, onReceived, typeOptions = [] }) {
    const [form, setForm] = React.useState(EMPTY);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);

    React.useEffect(() => {
        if (open) {
            setForm(EMPTY);
            setError(null);
        }
    }, [open]);

    const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
    const canSubmit = form.mpn.trim().length > 0 && Number(form.qty) > 0 && !busy;

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true);
        setError(null);
        try {
            const res = await apiClient.post('/marketplace/stock/receptions', {
                new_component: {
                    mpn: form.mpn.trim(),
                    value: form.value.trim() || null,
                    footprint: form.footprint.trim() || null,
                    component_type: form.componentType.trim() || null,
                },
                qty: Number(form.qty),
            });
            onReceived(res.data, Number(form.qty));
            onClose();
        } catch (err) {
            setError(extractApiError(err) || 'Échec de la réception.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
            <DialogTitle>Créer et réceptionner un composant</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                        Pour un composant absent de la base : il est créé dans le catalogue puis
                        la quantité est ajoutée au stock. Seul le <b>MPN</b> est obligatoire —
                        le reste est complétable plus tard dans le catalogue. Si le MPN existe
                        déjà, le composant existant est réutilisé.
                    </Typography>
                    {error ? <Alert severity="error" onClose={() => setError(null)}>{error}</Alert> : null}
                    <TextField
                        size="small"
                        label="MPN (référence fabricant) *"
                        value={form.mpn}
                        onChange={set('mpn')}
                        autoFocus
                        inputProps={{ maxLength: 200 }}
                    />
                    <Stack direction="row" spacing={1.5}>
                        <TextField
                            size="small"
                            label="Valeur"
                            placeholder="ex. 100nF, 10K…"
                            value={form.value}
                            onChange={set('value')}
                            sx={{ flexGrow: 1 }}
                            inputProps={{ maxLength: 100 }}
                        />
                        <TextField
                            size="small"
                            label="Empreinte"
                            placeholder="ex. C0402"
                            value={form.footprint}
                            onChange={set('footprint')}
                            sx={{ flexGrow: 1 }}
                            inputProps={{ maxLength: 100 }}
                        />
                    </Stack>
                    <Stack direction="row" spacing={1.5}>
                        <Autocomplete
                            freeSolo
                            options={typeOptions}
                            inputValue={form.componentType}
                            onInputChange={(e, v) => setForm((prev) => ({ ...prev, componentType: v || '' }))}
                            sx={{ flexGrow: 1 }}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    size="small"
                                    label="Type"
                                    placeholder="ex. CONDO, RESISTOR…"
                                    inputProps={{ ...params.inputProps, maxLength: 50 }}
                                />
                            )}
                        />
                        <TextField
                            size="small"
                            type="number"
                            label="Quantité reçue *"
                            value={form.qty}
                            onChange={set('qty')}
                            sx={{ width: 180 }}
                            inputProps={{ min: 1 }}
                        />
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose} disabled={busy}>Annuler</Button>
                <Button variant="contained" color="success" onClick={submit} disabled={!canSubmit}>
                    Créer et ajouter au stock
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default StockReceptionCreateDialog;
