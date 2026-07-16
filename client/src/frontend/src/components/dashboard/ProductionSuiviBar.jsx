import React from 'react';
import { Box, Tooltip } from '@mui/material';

/**
 * Barre de progression du suivi d'une production terminée : sur le total produit,
 * part **validée** (vert), **à débugger** (orange), **testée en attente** (bleu =
 * testées − validées − à débugger), le reste **non testée** (fond gris).
 */
function ProductionSuiviBar({ produced, tested, validated, toDebug, width = 130 }) {
    const p = Math.max(Number(produced) || 0, 0);
    const t = Math.max(Number(tested) || 0, 0);
    const v = Math.max(Number(validated) || 0, 0);
    const d = Math.max(Number(toDebug) || 0, 0);
    const base = Math.max(p, v + d, t);
    const pending = Math.max(t - v - d, 0);
    const pct = (n) => (base > 0 ? `${(n / base) * 100}%` : '0%');
    return (
        <Tooltip arrow title={`Validées ${v} · À débugger ${d} · Testées ${t} / produites ${p}`}>
            <Box sx={{ display: 'flex', width, height: 9, borderRadius: 5, overflow: 'hidden', bgcolor: '#3f3f46' }}>
                <Box sx={{ width: pct(v), bgcolor: '#22c55e' }} />
                <Box sx={{ width: pct(d), bgcolor: '#f59e0b' }} />
                <Box sx={{ width: pct(pending), bgcolor: '#3b82f6' }} />
            </Box>
        </Tooltip>
    );
}

export default ProductionSuiviBar;
