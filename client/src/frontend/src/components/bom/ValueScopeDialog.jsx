import React from 'react';
import { Typography } from '@mui/material';
import ScopeDialog from './ScopeDialog';

/**
 * Dialog de portée au renommage d'une valeur harmonisée partagée (prompt 002).
 * Généralisé sur `ScopeDialog` (partagé avec le changement de footprint, 005).
 * S'ouvre uniquement quand d'autres lignes partagent l'ancienne valeur.
 */
function ValueScopeDialog({ scope, onThis, onAll, onCancel }) {
    const oldValue = scope?.oldValue || '—';
    const newValue = scope?.newValue || '';
    const others = scope?.count || 0;
    const total = others + 1;

    return (
        <ScopeDialog
            open={Boolean(scope)}
            title="Portée du changement de valeur"
            allLabel={`Tous (${total})`}
            onThis={onThis}
            onAll={onAll}
            onCancel={onCancel}
        >
            <Typography variant="body2" sx={{ color: '#e4e4e7' }}>
                Vous renommez la valeur «&nbsp;<strong>{oldValue}</strong>&nbsp;» en «&nbsp;<strong>{newValue}</strong>&nbsp;».
            </Typography>
            <Typography variant="body2" sx={{ color: '#a1a1aa', mt: 1 }}>
                {others} autre(s) composant(s) partagent la valeur «&nbsp;{oldValue}&nbsp;». Appliquer le changement à&nbsp;:
            </Typography>
        </ScopeDialog>
    );
}

export default ValueScopeDialog;
