import React from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Typography,
} from '@mui/material';

const DIALOG_PAPER_SX = {
    backgroundColor: '#18181b',
    color: '#f4f4f5',
    border: '1px solid #27272a',
    borderRadius: 3,
};

/**
 * Dialog de portée au renommage d'une valeur harmonisée partagée (prompt 002).
 * S'ouvre uniquement quand d'autres lignes partagent l'ancienne valeur.
 *   - « Ce composant uniquement » : garde le changement sur la seule ligne éditée.
 *   - « Tous » : applique la nouvelle valeur à toutes les lignes de l'ancienne valeur.
 *   - « Annuler » : rétablit l'ancienne valeur sur la ligne éditée.
 * L'édition est manuelle et temps réel ; pas de règle harmony persistante.
 */
function ValueScopeDialog({ scope, onThis, onAll, onCancel }) {
    const open = Boolean(scope);
    const oldValue = scope?.oldValue || '—';
    const newValue = scope?.newValue || '';
    const others = scope?.count || 0;
    const total = others + 1;

    return (
        <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth PaperProps={{ sx: DIALOG_PAPER_SX }}>
            <DialogTitle sx={{ borderBottom: '1px solid #27272a', fontWeight: 700 }}>
                Portée du changement de valeur
            </DialogTitle>
            <DialogContent sx={{ pt: 2.5 }}>
                <Typography variant="body2" sx={{ color: '#e4e4e7' }}>
                    Vous renommez la valeur «&nbsp;<strong>{oldValue}</strong>&nbsp;» en «&nbsp;<strong>{newValue}</strong>&nbsp;».
                </Typography>
                <Typography variant="body2" sx={{ color: '#a1a1aa', mt: 1 }}>
                    {others} autre(s) composant(s) partagent la valeur «&nbsp;{oldValue}&nbsp;». Appliquer le changement à&nbsp;:
                </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, borderTop: '1px solid #27272a', gap: 1, flexWrap: 'wrap' }}>
                <Button onClick={onCancel} variant="outlined" sx={{ color: '#a1a1aa', borderColor: '#52525b' }}>
                    Annuler
                </Button>
                <Button onClick={onThis} variant="outlined">
                    Ce composant uniquement
                </Button>
                <Button onClick={onAll} variant="contained">
                    Tous ({total})
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default ValueScopeDialog;
