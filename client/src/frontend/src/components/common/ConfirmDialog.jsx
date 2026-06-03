import React from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
} from '@mui/material';

const DIALOG_PAPER_SX = {
    backgroundColor: '#18181b',
    color: '#f4f4f5',
    border: '1px solid #27272a',
    borderRadius: 3,
};

/**
 * Generic confirmation dialog with dark theme.
 * Props:
 *   open       – boolean
 *   title      – string
 *   message    – string
 *   confirmLabel – string (default 'Confirmer')
 *   cancelLabel  – string (default 'Annuler')
 *   severity   – MUI color ('error' | 'warning' | 'primary', default 'error')
 *   onConfirm  – () => void
 *   onClose    – () => void
 */
function ConfirmDialog({
    open = false,
    title = '',
    message = '',
    confirmLabel = 'Confirmer',
    cancelLabel = 'Annuler',
    severity = 'error',
    onConfirm,
    onClose,
}) {
    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="xs"
            fullWidth
            aria-labelledby="confirm-dialog-title"
            PaperProps={{ sx: DIALOG_PAPER_SX }}
        >
            <DialogTitle id="confirm-dialog-title" sx={{ borderBottom: '1px solid #27272a', fontWeight: 700 }}>
                {title}
            </DialogTitle>
            <DialogContent sx={{ pt: 2.5 }}>
                <DialogContentText sx={{ color: '#a1a1aa' }}>
                    {message}
                </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, borderTop: '1px solid #27272a', gap: 1 }}>
                <Button onClick={onClose} variant="outlined" sx={{ color: '#a1a1aa', borderColor: '#52525b' }}>
                    {cancelLabel}
                </Button>
                <Button onClick={onConfirm} variant="contained" color={severity}>
                    {confirmLabel}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default ConfirmDialog;
