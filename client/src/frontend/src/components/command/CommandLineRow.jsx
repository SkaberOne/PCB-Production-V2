import React from 'react';
import { TableCell, TableRow, TextField } from '@mui/material';
import { compactCellSx } from '../../utils/compactTable';

/**
 * Ligne de la table commande composants.
 *
 * `override` (optionnel) écrase la quantité par défaut `line.quantityToOrder`.
 * Le champ TextField inline permet d'ajuster manuellement la quantité à commander.
 * Quand la valeur diffère de la valeur calculée, la cellule est surlignée en vert.
 */
const CommandLineRow = React.memo(function CommandLineRow({ line, override, onOverrideChange }) {
    const effectiveQty = override !== undefined ? override : line.quantityToOrder;

    return (
        <TableRow>
            <TableCell sx={compactCellSx}>{line.componentName || line.value}</TableCell>
            <TableCell sx={compactCellSx}>{line.value}</TableCell>
            <TableCell sx={compactCellSx}>{line.footprint}</TableCell>
            <TableCell sx={compactCellSx}>{line.requiredQuantity}</TableCell>
            <TableCell sx={compactCellSx}>{line.stockAvailableQty}</TableCell>
            <TableCell sx={{ ...compactCellSx, width: 100 }}>
                <TextField
                    size="small"
                    type="number"
                    value={effectiveQty}
                    onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!Number.isNaN(val) && val >= 0) {
                            onOverrideChange(line.key, val);
                        }
                    }}
                    inputProps={{ min: 0, style: { padding: '2px 6px', fontSize: '0.79rem', MozAppearance: 'textfield' } }}
                    sx={{
                        width: 72,
                        '& input[type=number]::-webkit-inner-spin-button, & input[type=number]::-webkit-outer-spin-button': {
                            WebkitAppearance: 'none',
                            margin: 0,
                        },
                        '& .MuiOutlinedInput-root': {
                            backgroundColor:
                                override !== undefined && override !== line.quantityToOrder
                                    ? 'rgba(5,150,105,0.12)'
                                    : 'transparent',
                        },
                    }}
                    variant="outlined"
                />
            </TableCell>
            <TableCell sx={compactCellSx}>
                {line.manualPlacement ? `Oui${line.feederSlot ? ` (${line.feederSlot})` : ''}` : 'Auto'}
            </TableCell>
            <TableCell sx={compactCellSx} title={line.sources?.join(' | ')}>
                {line.sources?.length ? line.sources.join(' | ') : '-'}
            </TableCell>
        </TableRow>
    );
});

export default CommandLineRow;
