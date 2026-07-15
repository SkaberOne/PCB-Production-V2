import React from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Typography,
} from '@mui/material';

function ReactivateProductionDialog({
    open,
    production,
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
            <DialogTitle>Réactiver la production</DialogTitle>
            <DialogContent>
                <Typography variant="body2">
                    La production
                    {' '}
                    <strong>{production?.name}</strong>
                    {' '}
                    est
                    {' '}
                    {String(production?.status || '').toUpperCase() === 'COMPLETED'
                        ? 'terminée'
                        : 'archivée'}
                    . Voulez-vous la réactiver et la charger ?
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Annuler</Button>
                <Button variant="contained" onClick={onConfirm}>
                    Réactiver et ouvrir
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default ReactivateProductionDialog;
