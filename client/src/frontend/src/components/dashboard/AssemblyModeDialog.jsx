import React from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';

const MODES = [
    { value: 'PNP', label: 'Machine PnP' },
    { value: 'MANUEL', label: 'À la main' },
    { value: 'MIXTE', label: 'Mixte' },
];

/**
 * Changer le mode d'assemblage d'une production existante (PNP/MANUEL/MIXTE).
 * L'état (mode sélectionné) est porté par le hook d'actions du dashboard.
 */
function AssemblyModeDialog({ open, production, mode, busy, onModeChange, onClose, onConfirm }) {
    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
            <DialogTitle>Mode d'assemblage</DialogTitle>
            <DialogContent>
                <Typography variant="body2" sx={{ color: '#a1a1aa', mb: 2 }}>
                    {production?.name} — comment les cartes sont assemblées.
                </Typography>
                <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={mode}
                    onChange={(e, v) => { if (v) onModeChange(v); }}
                >
                    {MODES.map((m) => (
                        <ToggleButton key={m.value} value={m.value}>{m.label}</ToggleButton>
                    ))}
                </ToggleButtonGroup>
                {mode === 'MANUEL' ? (
                    <Typography variant="caption" sx={{ color: '#a1a1aa', display: 'block', mt: 1.5 }}>
                        À la main : l'étape « Machine PnP » sera masquée pour cette production.
                    </Typography>
                ) : null}
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose} disabled={busy}>Annuler</Button>
                <Button variant="contained" onClick={onConfirm} disabled={busy}>
                    {busy ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default AssemblyModeDialog;
