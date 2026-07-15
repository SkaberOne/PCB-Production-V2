import React from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
} from '@mui/material';

function RenameProductionDialog({
    open,
    name,
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
            <DialogTitle>Renommer la production</DialogTitle>
            <DialogContent>
                <TextField
                    autoFocus
                    fullWidth
                    margin="dense"
                    label="Nouveau nom"
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            onConfirm();
                        }
                    }}
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
                    Renommer
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default RenameProductionDialog;
