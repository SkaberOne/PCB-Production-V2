import React from 'react';
import {
    Alert,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    MenuItem,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import apiClient, { extractApiError } from '../../api/client';

/**
 * « Déclarer un lot produit » depuis le dashboard : nombre de cartes + fait par
 * (à la main ou machine PnP). Crée un ProductionRun + sortie stock auto
 * (ADR 0011), annulable, tracé par poste (ADR 0015). Machine optionnelle —
 * pré-rempli selon le mode d'assemblage de la production.
 */
function ProduceRunDialog({ open, production, onClose, onSaved }) {
    const [boards, setBoards] = React.useState('');
    const [byHand, setByHand] = React.useState(true);
    const [machines, setMachines] = React.useState([]);
    const [machineId, setMachineId] = React.useState('');
    const [note, setNote] = React.useState('');
    const [complete, setComplete] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);

    // Pré-coche « terminée » quand ce lot atteint (ou dépasse) la cible de cartes.
    const target = Number(production?.boards_target) || 0;
    const alreadyProduced = Number(production?.boards_produced) || 0;
    const reachesTarget = target > 0 && alreadyProduced + (Number(boards) || 0) >= target;

    React.useEffect(() => {
        setComplete(reachesTarget);
    }, [reachesTarget]);

    React.useEffect(() => {
        if (!open || !production) return;
        setBoards('');
        setNote('');
        setComplete(false);
        setError(null);
        const manualDefault = production.assembly_mode === 'MANUEL';
        setByHand(manualDefault);
        setMachineId(production.machine?.id || '');
        apiClient.get('/marketplace/machines')
            .then((res) => {
                const items = Array.isArray(res.data) ? res.data : (res.data?.items || []);
                setMachines(items);
                if (!manualDefault && !production.machine?.id && items.length > 0) {
                    setMachineId(items[0].id);
                }
            })
            .catch(() => setMachines([]));
    }, [open, production]);

    const canSubmit = Number(boards) > 0 && !busy && (byHand || machineId);

    const submit = async () => {
        if (!canSubmit) return;
        setBusy(true);
        setError(null);
        try {
            await apiClient.post(`/marketplace/productions/${production.id}/produce`, {
                boards_produced: Number(boards),
                machine_id: byHand ? null : machineId,
                note: note.trim() || null,
                complete_production: complete,
            });
            onSaved(Number(boards), byHand, complete);
            onClose();
        } catch (err) {
            setError(extractApiError(err) || 'Échec de la déclaration du lot.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
            <DialogTitle>Déclarer un lot produit</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                        {production?.name} — le stock consommé sort automatiquement
                        (coefficient de perte inclus). Annulable depuis la page Machine PnP.
                    </Typography>
                    {error ? <Alert severity="error" onClose={() => setError(null)}>{error}</Alert> : null}
                    <TextField
                        autoFocus
                        size="small"
                        type="number"
                        label="Cartes produites"
                        value={boards}
                        onChange={(e) => setBoards(e.target.value)}
                        inputProps={{ min: 1 }}
                        sx={{ width: 180 }}
                    />
                    <div>
                        <Typography variant="caption" sx={{ color: '#a1a1aa', display: 'block', mb: 0.5 }}>
                            Fait par
                        </Typography>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <ToggleButtonGroup
                                exclusive
                                size="small"
                                value={byHand ? 'MAIN' : 'MACHINE'}
                                onChange={(e, v) => { if (v) setByHand(v === 'MAIN'); }}
                            >
                                <ToggleButton value="MAIN">À la main</ToggleButton>
                                <ToggleButton value="MACHINE" disabled={machines.length === 0}>
                                    Machine PnP
                                </ToggleButton>
                            </ToggleButtonGroup>
                            {!byHand ? (
                                <TextField
                                    select
                                    size="small"
                                    label="Machine"
                                    value={machineId}
                                    onChange={(e) => setMachineId(e.target.value)}
                                    sx={{ minWidth: 140 }}
                                >
                                    {machines.map((m) => (
                                        <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
                                    ))}
                                </TextField>
                            ) : null}
                        </Stack>
                    </div>
                    <TextField
                        size="small"
                        label="Note (optionnel)"
                        placeholder="ex. série soudée par Marc"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        inputProps={{ maxLength: 500 }}
                    />
                    <div>
                        <FormControlLabel
                            control={(
                                <Checkbox
                                    size="small"
                                    checked={complete}
                                    onChange={(e) => setComplete(e.target.checked)}
                                />
                            )}
                            label="Marquer la production comme terminée"
                        />
                        <Typography variant="caption" sx={{ color: '#a1a1aa', display: 'block' }}>
                            {reachesTarget
                                ? 'Cible de cartes atteinte avec ce lot — la production passera dans « Terminées » et libérera ses réservations de stock.'
                                : 'La production quitte « en cours » et libère ses réservations de stock. Décoche si d\'autres lots suivent.'}
                        </Typography>
                    </div>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose} disabled={busy}>Annuler</Button>
                <Button variant="contained" color="success" onClick={submit} disabled={!canSubmit}>
                    Enregistrer le lot
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default ProduceRunDialog;
