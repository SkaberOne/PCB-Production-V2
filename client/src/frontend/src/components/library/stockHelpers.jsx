import React from 'react';
import { Chip } from '@mui/material';

// Statut renvoyé par le backend (ADR 0010) -> chip.
export const STATUS_META = {
    ok: { label: 'OK', color: 'success' },
    bas: { label: 'Bas', color: 'warning' },
    manque: { label: 'Manque', color: 'error' },
    'non-matché': { label: 'Non-matché', color: 'default' },
};

export function statusChip(status) {
    const meta = STATUS_META[status] || { label: status || '-', color: 'default' };
    return <Chip size="small" variant="outlined" color={meta.color} label={meta.label} />;
}

export function fpOf(row) {
    return row.footprint_pnp || row.footprint_eagle || '';
}

export function componentLabel(row) {
    return [row.value || '-', fpOf(row) || '-', row.mpn || '-'].join('  ·  ');
}
