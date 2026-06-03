import React from 'react';
import {
    Box,
    Card,
    CardContent,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import {
    compactCellSx,
    compactInputSx,
    compactTableContainerSx,
    compactTableSx,
} from '../../utils/compactTable';

const PANEL_CARD_SX = {
    backgroundColor: '#18181b',
    border: '1px solid #27272a',
};

/**
 * Panel affichant les quantités à produire par référence/révision.
 */
function BomQuantityPanel({ quantityRows = [], activeProduction = null, onQuantityChange, onQuantityBlur }) {
    return (
        <Card sx={PANEL_CARD_SX}>
            <CardContent>
                <Stack spacing={2}>
                    <Box>
                        <Typography variant="h6" sx={{ color: '#f4f4f5', fontWeight: 600 }}>
                            Quantité à produire
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#a1a1aa', mt: 0.5 }}>
                            TOP et BOT partagent la même quantité pour une même référence / révision.
                        </Typography>
                    </Box>

                    {!quantityRows.length ? (
                        <Typography variant="body2" sx={{ color: '#71717a' }}>
                            Aucune BOM sélectionnée pour le moment.
                        </Typography>
                    ) : (
                        <TableContainer sx={compactTableContainerSx}>
                            <Table sx={compactTableSx}>
                                <TableHead sx={{ backgroundColor: '#09090b' }}>
                                    <TableRow>
                                        <TableCell sx={{ width: '30%' }}>Référence</TableCell>
                                        <TableCell sx={{ width: '22%' }}>Révision</TableCell>
                                        <TableCell sx={{ width: '20%' }}>Faces</TableCell>
                                        <TableCell sx={{ width: '28%' }}>Quantité</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {quantityRows.map((row) => (
                                        <TableRow key={row.key}>
                                            <TableCell sx={compactCellSx}>{row.reference || '-'}</TableCell>
                                            <TableCell sx={compactCellSx}>{row.revision || '-'}</TableCell>
                                            <TableCell sx={compactCellSx}>{row.sides.join(' / ') || '-'}</TableCell>
                                            <TableCell>
                                                <TextField
                                                    fullWidth
                                                    type="number"
                                                    size="small"
                                                    aria-label={`Quantité à produire ${row.reference || ''} ${row.revision || ''}`.trim()}
                                                    value={row.quantityToProduce}
                                                    inputProps={{ min: 1, step: 1 }}
                                                    onChange={onQuantityChange(row)}
                                                    onBlur={onQuantityBlur(row)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter') event.currentTarget.blur();
                                                    }}
                                                    sx={compactInputSx}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {activeProduction?.id ? (
                        <Typography variant="caption" sx={{ color: '#86efac' }}>
                            Ces quantités sont enregistrées sur la production active et réutilisées dans Machine PnP.
                        </Typography>
                    ) : null}
                </Stack>
            </CardContent>
        </Card>
    );
}

export default React.memo(BomQuantityPanel);
