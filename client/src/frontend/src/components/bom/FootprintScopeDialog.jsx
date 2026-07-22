import React from 'react';
import { Typography } from '@mui/material';
import ScopeDialog from './ScopeDialog';

/**
 * Dialog de portée au changement de footprint d'un composant partagé (prompt 005).
 * Parité avec le renommage de valeur (002) : la portée « tous » ne vise que les
 * lignes de même (valeur harmonisée + ancien footprint). Le MPN suit ensuite
 * automatiquement (matching backend sur (valeur, footprint)).
 */
function FootprintScopeDialog({ scope, onThis, onAll, onCancel }) {
    const value = scope?.value || '—';
    const oldFootprint = scope?.oldFootprint || '—';
    const newFootprint = scope?.newFootprint || '';
    const others = scope?.count || 0;
    const total = others + 1;

    return (
        <ScopeDialog
            open={Boolean(scope)}
            title="Portée du changement d'empreinte"
            allLabel={`Tous les ${value} en ${oldFootprint} (${total})`}
            onThis={onThis}
            onAll={onAll}
            onCancel={onCancel}
        >
            <Typography variant="body2" sx={{ color: '#e4e4e7' }}>
                Vous changez l'empreinte de «&nbsp;<strong>{oldFootprint}</strong>&nbsp;» en «&nbsp;<strong>{newFootprint}</strong>&nbsp;» pour «&nbsp;<strong>{value}</strong>&nbsp;».
            </Typography>
            <Typography variant="body2" sx={{ color: '#a1a1aa', mt: 1 }}>
                {others} autre(s) composant(s) partagent «&nbsp;{value}&nbsp;» en «&nbsp;{oldFootprint}&nbsp;». Appliquer le changement à&nbsp;:
            </Typography>
        </ScopeDialog>
    );
}

export default FootprintScopeDialog;
