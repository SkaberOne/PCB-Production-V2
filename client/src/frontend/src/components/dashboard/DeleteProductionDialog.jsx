import React from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Typography,
} from '@mui/material';

function DeleteProductionDialog({
    open,
    production,
    busy,
    onClose,
    onConfirm,
}) {
    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="sm"
        >
            <DialogTitle>Supprimer la production</DialogTitle>
            <DialogContent>
                <Typography variant="body2">
                    Êtes-vous sûr de vouloir supprimer définitivement la production
                    {' '}
                    <strong>{production?.name}</strong>
                    {' '}
                    ? Cette action est irréversible.
                </Typography>
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
                    color="error"
                    onClick={onConfirm}
                    disabled={busy}
                >
                    {busy ? 'Suppression...' : 'Supprimer'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default DeleteProductionDialog;
