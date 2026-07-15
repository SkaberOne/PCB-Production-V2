import React from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
} from '@mui/material';

function CreateProductionDialog({
    open,
    name,
    errorText,
    busy,
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
