import React from 'react';
import {
    Box,
    Card,
    CardContent,
    Chip,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import apiClient from '../../api/client';
import useEventStream from '../../hooks/useEventStream';
import { compactCellSx, compactTableContainerSx, compactTableSx } from '../../utils/compactTable';

/**
 * « Cartes à produire » (ADR 0017) : manques de cartes = demande des commandes
 * client/machine actives − stock de cartes disponible. Demandes de fabrication.
 */
function CardsToProducePanel() {
    const [rows, setRows] = React.useState(null);

    const load = React.useCallback(async (silent = false) => {
        try {
            const res = await apiClient.get('/marketplace/board-stock/to-produce');
            setRows(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            if (!silent) setRows([]);
        }
    }, []);

    React.useEffect(() => { load(); }, [load]);
    useEventStream('stock', React.useCallback(() => { load(true); }, [load]));

    const total = (rows || []).reduce((acc, r) => acc + (r.to_produce || 0), 0);

    return (
        <Card sx={{ backgroundColor: '#18181b', border: '1px solid #1f2937' }}>
            <CardContent>
                <Stack direction="row" alignItems="center" sx={{ mb: 1.5, gap: 1.5 }} flexWrap="wrap" useFlexGap>
                    <Typography variant="h6" sx={{ flexGrow: 1, color: '#f4f4f5', fontWeight: 600 }}>
                        Cartes à produire (demandes de fabrication)
                    </Typography>
                    {total > 0 ? <Chip size="small" label={`${total} carte(s) à produire`} color="warning" /> : null}
                </Stack>

                {rows === null ? (
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>Chargement…</Typography>
                ) : rows.length === 0 ? (
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>Aucun manque : le stock de cartes couvre les commandes en cours.</Typography>
                ) : (
                    <TableContainer sx={{ ...compactTableContainerSx, maxHeight: 320 }}>
                        <Table sx={compactTableSx} size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={compactCellSx}>Référence carte</TableCell>
                                    <TableCell sx={compactCellSx} align="right">Demandé (restant)</TableCell>
                                    <TableCell sx={compactCellSx} align="right">En stock</TableCell>
                                    <TableCell sx={compactCellSx} align="right">À produire</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.map((r) => (
                                    <TableRow key={`${r.bom_reference_id}::${r.revision || ''}`} hover>
                                        <TableCell sx={compactCellSx}>
                                            {r.reference}
                                            {r.revision ? <Chip size="small" label={r.revision} variant="outlined" sx={{ ml: 0.75 }} /> : null}
                                        </TableCell>
                                        <TableCell sx={{ ...compactCellSx, color: '#a1a1aa' }} align="right">{r.demand_remaining}</TableCell>
                                        <TableCell sx={{ ...compactCellSx, color: '#a1a1aa' }} align="right">{r.in_stock}</TableCell>
                                        <TableCell sx={{ ...compactCellSx, fontWeight: 700, color: '#f59e0b' }} align="right">{r.to_produce}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </CardContent>
        </Card>
    );
}

export default CardsToProducePanel;
