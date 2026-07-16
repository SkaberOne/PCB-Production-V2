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
    Typography,
} from '@mui/material';
import apiClient from '../../api/client';
import useEventStream from '../../hooks/useEventStream';
import { compactCellSx, compactTableContainerSx, compactTableSx } from '../../utils/compactTable';
import ProductionSuiviBar from './ProductionSuiviBar';
import ProductionFollowupDialog from './ProductionFollowupDialog';

function fmtDate(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
    } catch (_) {
        return '—';
    }
}

/**
 * « Suivi des productions terminées » : liste toutes les productions terminées
 * avec une barre de progression (validées / à débugger / testées). **Cliquer
 * sur une ligne** ouvre la fenêtre de saisie des compteurs + note.
 */
function ProductionFollowupPanel() {
    const [rows, setRows] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [editing, setEditing] = React.useState(null); // production en cours d'édition

    const load = React.useCallback(async (silent = false) => {
        if (!silent) setError(null);
        try {
            const res = await apiClient.get('/reports/productions-history?limit=500');
            setRows(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            if (!silent) setError(err?.response?.data?.detail || 'Suivi indisponible.');
            setRows([]);
        }
    }, []);

    React.useEffect(() => { load(); }, [load]);
    useEventStream('stock', React.useCallback(() => { load(true); }, [load]));

    return (
        <Card sx={{ backgroundColor: '#18181b', border: '1px solid #1f2937' }}>
            <CardContent>
                <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5, gap: 1.5 }}>
                    <Typography variant="h6" sx={{ flexGrow: 1, color: '#f4f4f5', fontWeight: 600 }}>
                        Suivi des productions terminées
                    </Typography>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        {[
                            ['#22c55e', 'Validées'],
                            ['#f59e0b', 'À débugger'],
                            ['#3b82f6', 'Testées'],
                            ['#3f3f46', 'Non testées'],
                        ].map(([c, label]) => (
                            <Stack key={label} direction="row" spacing={0.5} alignItems="center">
                                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c }} />
                                <Typography variant="caption" sx={{ color: '#a1a1aa' }}>{label}</Typography>
                            </Stack>
                        ))}
                    </Stack>
                </Stack>

                {error ? <Typography variant="body2" sx={{ color: '#f87171', mb: 1 }}>{error}</Typography> : null}

                {rows === null ? (
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>Chargement…</Typography>
                ) : rows.length === 0 ? (
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>Aucune production terminée pour l'instant.</Typography>
                ) : (
                    <>
                        <Typography variant="caption" sx={{ color: '#71717a', display: 'block', mb: 1 }}>
                            Cliquez sur une production pour renseigner testées / validées / à débugger.
                        </Typography>
                        <TableContainer sx={{ ...compactTableContainerSx, maxHeight: 420 }}>
                            <Table sx={compactTableSx} size="small" stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={compactCellSx}>Production</TableCell>
                                        <TableCell sx={compactCellSx}>Date de fin</TableCell>
                                        <TableCell sx={compactCellSx} align="right">Produites</TableCell>
                                        <TableCell sx={compactCellSx}>Progression</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {rows.map((p) => (
                                        <TableRow
                                            key={p.id}
                                            hover
                                            onClick={() => setEditing(p)}
                                            sx={{ cursor: 'pointer' }}
                                        >
                                            <TableCell sx={compactCellSx}>{p.name}</TableCell>
                                            <TableCell sx={{ ...compactCellSx, color: '#a1a1aa' }}>{fmtDate(p.date_fin)}</TableCell>
                                            <TableCell sx={{ ...compactCellSx, color: '#a1a1aa' }} align="right">{p.boards_produced}</TableCell>
                                            <TableCell sx={compactCellSx}>
                                                <ProductionSuiviBar
                                                    produced={p.boards_produced}
                                                    tested={p.cards_tested}
                                                    validated={p.cards_validated}
                                                    toDebug={p.cards_to_debug}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </>
                )}
            </CardContent>

            <ProductionFollowupDialog
                open={Boolean(editing)}
                production={editing}
                onClose={() => setEditing(null)}
                onSaved={() => load(true)}
            />
        </Card>
    );
}

export default ProductionFollowupPanel;
