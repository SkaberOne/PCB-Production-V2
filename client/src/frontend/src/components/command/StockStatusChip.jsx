import React from 'react';
import { Chip, CircularProgress } from '@mui/material';
import { colors } from '../../theme';

/**
 * Pastille d'état de validation du stock.
 * - `isLoading=true` → état de rechargement (priorité)
 * - `isValidated=true` → vert "Stock validé"
 * - sinon → orange "En attente de validation"
 */
function StockStatusChip({ isValidated, isLoading }) {
    if (isLoading) {
        return (
            <Chip
                icon={<CircularProgress size={12} color="inherit" />}
                label="Rechargement..."
                size="small"
                sx={{ backgroundColor: colors.border, color: colors.textSecondary }}
            />
        );
    }

    if (isValidated) {
        return (
            <Chip
                label="✓ Stock validé"
                size="small"
                sx={{ backgroundColor: 'rgba(5,150,105,0.18)', color: '#34d399', fontWeight: 600 }}
            />
        );
    }

    return (
        <Chip
            label="⚠ En attente de validation"
            size="small"
            sx={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#fbbf24', fontWeight: 600 }}
        />
    );
}

export default StockStatusChip;
