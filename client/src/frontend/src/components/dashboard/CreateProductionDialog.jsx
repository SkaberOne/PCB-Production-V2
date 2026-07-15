import React from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';

const ASSEMBLY_MODES = [
    { value: 'PNP', label: 'Machine PnP' },
    { value: 'MANUEL', label: 'À la main' },
    { value: 'MIXTE', label: 'Mixte' },
];

function CreateProductionDialog({
    open,
    name,
    errorText,
    busy,
    assemblyMode = 'PNP',
    onAssemblyModeChange,
    onClose,
    onNameChange,
    onConfirm,
}) {
    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="sm"
        >
            <DialogTitle>Nouvelle production</DialogTitle>
            <DialogContent>
                <TextField
                    autoFocus
                    fullWidth
                    margin="dense"
                    label="Nom de la production"
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            onConfirm();
                        }
                    }}
                    error={Boolean(errorText)}
                    helperText={errorText || ' '}
                />
                <Typography variant="body2" sx={{ color: '#a1a1aa', mt: 1, mb: 1 }}>
                    Mode d'assemblage des cartes :
                </Typography>
                <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={assemblyMode}
                    onChange={(e, v) => { if (v && onAssemblyModeChange) onAssemblyModeChange(v); }}
                >
                    {ASSEMBLY_MODES.map((m) => (
                        <ToggleButton key={m.value} value={m.value}>{m.label}</ToggleButton>
                    ))}
                </ToggleButtonGroup>
                {assemblyMode === 'MANUEL' ? (
                    <Typography variant="caption" sx={{ color: '#a1a1aa', display: 'block', mt: 1 }}>
                        Assemblage à la main : l'étape « Machine PnP » sera masquée pour cette production.
                    </Typography>
                ) : null}
            </DialogContent>
            <DialogActions>
                <Button
                    onClick={onClose}
                    disabled={busy}
                >
                    Annuler
                </Button>
                <Button
                    variant="contained"
                    onClick={onConfirm}
                    disabled={busy || !name.trim()}
                >
                    {busy ? 'Création...' : 'Créer'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default CreateProductionDialog;
