import React from 'react';
import {
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import apiClient from '../../api/client';
import { compactCellSx, compactTableContainerSx, compactTableSx } from '../../utils/compactTable';

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
 * « Historique » : liste des productions **terminées**, datées de leur clôture
 * (la plus récente d'abord), avec le nombre de cartes produites.
 */
function ProductionHistoryDialog({ open, onClose }) {
    const [rows, setRows] = React.useState(null);
    const [error, setError] = React.useState(null);

    React.useEffect(() => {
        if (!open) return;
        setRows(null);
        setError(null);
        apiClient.get('/reports/productions-history?limit=200')
            .then((res) => setRows(Array.isArray(res.data) ? res.data : []))
            .catch((err) => {
                setError(err?.response?.data?.detail || 'Historique indisponible.');
                setRows([]);
            });
    }, [open]);

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>Historique des productions terminées</DialogTitle>
            <DialogContent>
                {error ? (
                    <Typography variant="body2" sx={{ color: '#f87171' }}>{error}</Typography>
                ) : rows === null ? (
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>Chargement…</Typography>
                ) : rows.length === 0 ? (
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>Aucune production terminée pour l'instant.</Typography>
                ) : (
                    <TableContainer sx={compactTableContainerSx}>
                        <Table sx={compactTableSx} size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={compactCellSx}>Production</TableCell>
                                    <TableCell sx={compactCellSx} align="right">Cartes produites</TableCell>
                                    <TableCell sx={compactCellSx}>Date de fin</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.map((p) => (
                                    <TableRow key={p.id}>
                                        <TableCell sx={compactCellSx}>{p.name}</TableCell>
                                        <TableCell sx={compactCellSx} align="right">
                                            {p.boards_produced}{p.boards_target ? ` / ${p.boards_target}` : ''}
                                        </TableCell>
                                        <TableCell sx={{ ...compactCellSx, color: '#a1a1aa' }}>{fmtDate(p.date_fin)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose}>Fermer</Button>
            </DialogActions>
        </Dialog>
    );
}

export default ProductionHistoryDialog;
