import React from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
} from '@mui/material';

const DIALOG_PAPER_SX = {
    backgroundColor: '#18181b',
    color: '#f4f4f5',
    border: '1px solid #27272a',
    borderRadius: 3,
};

/**
 * Dialog de portée générique (valeur — prompt 002 — ou empreinte — prompt 005).
 * S'ouvre quand d'autres lignes partagent l'ancien attribut édité.
 *   - « Ce composant uniquement » (onThis) : garde le changement sur la seule ligne éditée.
 *   - « <allLabel> » (onAll) : applique au sous-ensemble concerné.
 *   - « Annuler » (onCancel) : rétablit l'ancienne valeur sur la ligne éditée.
 * Le contenu explicatif est fourni en `children` par le wrapper spécialisé.
 */
function ScopeDialog({ open, title, allLabel, onThis, onAll, onCancel, children }) {
    return (
        <Dialog open={Boolean(open)} onClose={onCancel} maxWidth="xs" fullWidth PaperProps={{ sx: DIALOG_PAPER_SX }}>
            <DialogTitle sx={{ borderBottom: '1px solid #27272a', fontWeight: 700 }}>
                {title}
            </DialogTitle>
            <DialogContent sx={{ pt: 2.5 }}>
                {children}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, borderTop: '1px solid #27272a', gap: 1, flexWrap: 'wrap' }}>
                <Button onClick={onCancel} variant="outlined" sx={{ color: '#a1a1aa', borderColor: '#52525b' }}>
                    Annuler
                </Button>
                <Button onClick={onThis} variant="outlined">
                    Ce composant uniquement
                </Button>
                <Button onClick={onAll} variant="contained">
                    {allLabel}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default ScopeDialog;
