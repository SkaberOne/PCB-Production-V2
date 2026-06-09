import React from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    MenuItem,
    Stack,
    Switch,
    TextField,
    Typography,
} from '@mui/material';
import PanToolRoundedIcon from '@mui/icons-material/PanToolRounded';
import PushPinRoundedIcon from '@mui/icons-material/PushPinRounded';
import apiClient from '../../api/client';

const EDITABLE_FIELDS = ['value', 'description', 'footprint_pnp', 'feeder_type'];

// Types de feeders standard (cf serveur/src/utils/feeder_types.py). Vide = taille manquante.
const FEEDER_TYPE_OPTIONS = ['CL8-4', 'CL12', 'CL16', 'CL24', 'CL32', 'CL44', 'CL56'];

/**
 * Édition rapide d'un composant depuis le plan d'implantation (sans passer par la
 * Base de données). Préremplit via GET /bom/components/{id}, n'envoie que les champs
 * modifiés via PATCH. Avertit quand on touche `value` (clé d'appariement BOM).
 *
 * Inclut l'épinglage manuel du slot (si machineId/productionId fournis) : épingler /
 * mettre à jour / retirer. Les conflits renvoyés par le backend (slot pris,
 * chevauchement gros feeder, nozzle incompatible) sont affichés en erreur.
 */
function ComponentQuickEditPanel({
    componentId,
    open,
    onClose,
    onSaved,
    machineId,
    productionId,
    pinnedSlot = null,
    forcedManual = false,
    onPlanUpdated,
}) {
    const [loading, setLoading] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    const [form, setForm] = React.useState(null);
    const [initial, setInitial] = React.useState(null);

    const [slotInput, setSlotInput] = React.useState('');
    const [pinning, setPinning] = React.useState(false);
    const [pinError, setPinError] = React.useState('');
    const [manualToggling, setManualToggling] = React.useState(false);

    const canPin = machineId != null && productionId != null;

    React.useEffect(() => {
        if (!open || !componentId) return undefined;
        let active = true;
        setLoading(true);
        setError('');
        setForm(null);
        setPinError('');
        setSlotInput(pinnedSlot != null ? String(pinnedSlot) : '');
        apiClient.get(`/bom/components/${componentId}`)
            .then((res) => {
                if (!active) return;
                const c = res.data || {};
                const next = {
                    value: c.value || '',
                    description: c.description || '',
                    footprint_pnp: c.footprint_pnp || '',
                    feeder_type: c.feeder_type || '',
                };
                setForm(next);
                setInitial({ ...next });
            })
            .catch(() => { if (active) setError('Impossible de charger le composant.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [open, componentId, pinnedSlot]);

    const updateField = (key) => (event) => {
        const { value } = event.target;
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const valueChanged = !!form && !!initial
        && (form.value || '').trim() !== (initial.value || '').trim();

    // Options du menu déroulant feeder ; inclut la valeur courante si non standard (legacy).
    const feederOptions = React.useMemo(() => {
        const opts = [...FEEDER_TYPE_OPTIONS];
        const current = (form?.feeder_type || '').trim();
        if (current && !opts.includes(current)) opts.unshift(current);
        return opts;
    }, [form]);

    const handleSave = async () => {
        if (!form || !initial) return;
        const patch = {};
        EDITABLE_FIELDS.forEach((key) => {
            const next = (form[key] || '').trim();
            const prev = (initial[key] || '').trim();
            if (next !== prev) patch[key] = next === '' ? null : next;
        });
        if (Object.keys(patch).length === 0) { onClose(); return; }
        setSaving(true);
        setError('');
        try {
            await apiClient.patch(`/bom/components/${componentId}`, patch);
            if (onSaved) await onSaved();
            onClose();
        } catch (err) {
            setError("Échec de l'enregistrement du composant.");
        } finally {
            setSaving(false);
        }
    };

    const extractError = (err, fallback) => (
        err?.response?.data?.detail || fallback
    );

    const handlePin = async () => {
        const slot = parseInt(slotInput, 10);
        if (!Number.isInteger(slot) || slot < 1) {
            setPinError('Indiquez un numéro de slot valide.');
            return;
        }
        setPinning(true);
        setPinError('');
        try {
            const res = await apiClient.post(
                `/marketplace/machines/${machineId}/productions/${productionId}/slot-pins`,
                { component_id: componentId, slot_position: slot },
            );
            if (onPlanUpdated) onPlanUpdated(res.data || null);
            onClose();
        } catch (err) {
            // Conflit (400) : slot pris / chevauchement / nozzle incompatible / hors plage.
            setPinError(extractError(err, "Épinglage impossible (conflit détecté)."));
        } finally {
            setPinning(false);
        }
    };

    const handleUnpin = async () => {
        setPinning(true);
        setPinError('');
        try {
            const res = await apiClient.delete(
                `/marketplace/machines/${machineId}/productions/${productionId}/slot-pins/${componentId}`,
            );
            if (onPlanUpdated) onPlanUpdated(res.data || null);
            onClose();
        } catch (err) {
            setPinError(extractError(err, "Impossible de retirer l'épinglage."));
        } finally {
            setPinning(false);
        }
    };

    const handleToggleManual = async (checked) => {
        setManualToggling(true);
        setPinError('');
        try {
            const res = await apiClient.post(
                `/marketplace/machines/${machineId}/productions/${productionId}/manual-placements`,
                { component_id: componentId, manual: checked },
            );
            if (onPlanUpdated) onPlanUpdated(res.data || null);
            onClose();
        } catch (err) {
            setPinError(extractError(err, 'Impossible de changer la pose à la main.'));
        } finally {
            setManualToggling(false);
        }
    };

    const busy = saving || pinning || manualToggling;

    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Modifier le composant</DialogTitle>
            <DialogContent dividers>
                {loading ? (
                    <Stack alignItems="center" sx={{ py: 3 }}>
                        <CircularProgress size={24} sx={{ color: '#059669' }} />
                    </Stack>
                ) : form ? (
                    <Stack spacing={2} sx={{ mt: 0.5 }}>
                        {error ? <Alert severity="error">{error}</Alert> : null}
                        <TextField
                            label="Nom (description)"
                            size="small"
                            value={form.description}
                            onChange={updateField('description')}
                            fullWidth
                        />
                        <TextField
                            label="Valeur (clé de matching BOM)"
                            size="small"
                            value={form.value}
                            onChange={updateField('value')}
                            fullWidth
                        />
                        {valueChanged ? (
                            <Alert severity="warning" sx={{ py: 0.25 }}>
                                Modifier la valeur change la clé d'appariement BOM ↔ composant :
                                le composant peut se désapparier de ses lignes BOM et disparaître du plan.
                            </Alert>
                        ) : null}
                        <TextField
                            label="Footprint (PnP)"
                            size="small"
                            value={form.footprint_pnp}
                            onChange={updateField('footprint_pnp')}
                            fullWidth
                        />
                        <TextField
                            select
                            label="Feeder"
                            size="small"
                            value={form.feeder_type}
                            onChange={updateField('feeder_type')}
                            fullWidth
                            helperText="Vide = taille manquante (pose manuelle)"
                        >
                            <MenuItem value=""><em>— Aucun (taille manquante) —</em></MenuItem>
                            {feederOptions.map((opt) => (
                                <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                            ))}
                        </TextField>

                        {canPin ? (
                            <>
                                <Divider sx={{ borderColor: '#27272a' }} />
                                <Box>
                                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
                                        <PanToolRoundedIcon sx={{ fontSize: 16, color: '#f59e0b' }} />
                                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#fde68a' }}>
                                            Pose à la main
                                        </Typography>
                                    </Stack>
                                    <FormControlLabel
                                        control={(
                                            <Switch
                                                size="small"
                                                checked={!!forcedManual}
                                                disabled={busy}
                                                onChange={(e) => handleToggleManual(e.target.checked)}
                                            />
                                        )}
                                        label={(
                                            <Typography sx={{ fontSize: '0.74rem', color: '#d4d4d8' }}>
                                                Forcer ce composant en pose à la main (exclu de la PnP)
                                            </Typography>
                                        )}
                                    />
                                </Box>
                                <Divider sx={{ borderColor: '#27272a' }} />
                                <Box>
                                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1 }}>
                                        <PushPinRoundedIcon sx={{ fontSize: 16, color: '#a78bfa' }} />
                                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#ddd6fe' }}>
                                            Épinglage manuel du slot
                                        </Typography>
                                    </Stack>
                                    <Typography sx={{ fontSize: '0.7rem', color: '#a1a1aa', mb: 1 }}>
                                        Force ce composant à un slot précis. Le plan respecte l'épinglage ;
                                        un conflit (slot pris, gros feeder à 2 positions, nozzle incompatible) est refusé.
                                    </Typography>
                                    {pinError ? <Alert severity="error" sx={{ mb: 1, py: 0.25 }}>{pinError}</Alert> : null}
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <TextField
                                            label="Slot"
                                            size="small"
                                            type="number"
                                            value={slotInput}
                                            onChange={(e) => setSlotInput(e.target.value)}
                                            sx={{ width: 110 }}
                                        />
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            onClick={handlePin}
                                            disabled={busy}
                                            startIcon={pinning ? <CircularProgress size={14} /> : <PushPinRoundedIcon sx={{ fontSize: 16 }} />}
                                            sx={{ textTransform: 'none' }}
                                        >
                                            {pinnedSlot != null ? "Mettre à jour" : 'Épingler'}
                                        </Button>
                                        {pinnedSlot != null ? (
                                            <Button
                                                variant="text"
                                                size="small"
                                                color="error"
                                                onClick={handleUnpin}
                                                disabled={busy}
                                                sx={{ textTransform: 'none' }}
                                            >
                                                Retirer
                                            </Button>
                                        ) : null}
                                    </Stack>
                                    {pinnedSlot != null ? (
                                        <Typography sx={{ fontSize: '0.68rem', color: '#c4b5fd', mt: 0.75 }}>
                                            Actuellement épinglé au slot {pinnedSlot}.
                                        </Typography>
                                    ) : null}
                                </Box>
                            </>
                        ) : null}
                    </Stack>
                ) : (
                    <Typography sx={{ color: '#a1a1aa' }}>
                        {error || 'Aucun composant sélectionné.'}
                    </Typography>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={busy}>Fermer</Button>
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={busy || loading || !form}
                    startIcon={saving ? <CircularProgress size={14} /> : null}
                >
                    Enregistrer
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default ComponentQuickEditPanel;
