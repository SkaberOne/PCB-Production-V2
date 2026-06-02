import React from 'react';
import {
    Chip,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    Typography,
} from '@mui/material';
import EmptyState from '../common/EmptyState';
import {
    compactCellSx,
    compactPaginationSx,
    compactTableContainerSx,
    compactTableSx,
    compactWrapCellSx,
} from '../../utils/compactTable';
import { getStockStatusChipColor, normalizeStockStatus } from '../../utils/bomStockUi';

const BomStockTableRow = React.memo(function BomStockTableRow({ line, onOpenStockDialog }) {
    const handleOpen = React.useCallback(() => {
        onOpenStockDialog(line.key);
    }, [line.key, onOpenStockDialog]);

    return (
        <TableRow
            hover
            onClick={handleOpen}
            tabIndex={0}
            aria-label={`Détail stock ${line.componentLibraryName || line.value || ''}`.trim()}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpen();
                }
            }}
            sx={{
                cursor: 'pointer',
                '&:hover': {
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                },
            }}
        >
            <TableCell sx={compactWrapCellSx}>
                <Stack spacing={0.5}>
                    <Typography variant="body2" sx={{ color: '#f4f4f5', fontWeight: 600 }}>
                        {line.componentLibraryName || line.value}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                        {line.value} - {line.footprint} - {line.type}
                    </Typography>
                    {line.draft.feeder_slot ? (
                        <Typography variant="caption" sx={{ color: '#60a5fa' }}>
                            Feeder : {line.draft.feeder_slot}
                        </Typography>
                    ) : null}
                </Stack>
            </TableCell>
            <TableCell sx={compactCellSx}>{line.requiredQuantity}</TableCell>
            <TableCell sx={compactWrapCellSx}>
                <Stack spacing={0.75}>
                    <Typography variant="body2" sx={{ color: '#f4f4f5', fontWeight: 600 }}>
                        {line.totalAvailableQty}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                        Bobine {line.reelEstimatedQty ?? 0} / Sachet {line.draft.bag_qty || 0} / Tube {line.draft.tube_qty || 0}
                    </Typography>
                </Stack>
            </TableCell>
            <TableCell sx={compactCellSx}>{line.quantityToOrder}</TableCell>
            <TableCell sx={compactWrapCellSx}>
                <Stack spacing={0.5}>
                    <Chip
                        label={normalizeStockStatus(line.status)}
                        size="small"
                        color={getStockStatusChipColor(line.status)}
                        variant="outlined"
                    />
                    {line.manualPlacement ? (
                        <Typography variant="caption" sx={{ color: '#f59e0b' }}>
                            Pose manuelle
                        </Typography>
                    ) : null}
                </Stack>
            </TableCell>
        </TableRow>
    );
});

function BomStockTable({ lines = [], onOpenStockDialog }) {
    const [page, setPage] = React.useState(0);
    const [rowsPerPage, setRowsPerPage] = React.useState(25);

    React.useEffect(() => {
        const maxPage = Math.max(0, Math.ceil(lines.length / rowsPerPage) - 1);
        if (page > maxPage) {
            setPage(maxPage);
        }
    }, [lines.length, page, rowsPerPage]);

    const visibleLines = React.useMemo(() => {
        const start = page * rowsPerPage;
        return lines.slice(start, start + rowsPerPage);
    }, [lines, page, rowsPerPage]);
    const handlePageChange = React.useCallback((_event, nextPage) => {
        setPage(nextPage);
    }, []);
    const handleRowsPerPageChange = React.useCallback((event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    }, []);

    return (
        <>
            <TableContainer sx={compactTableContainerSx}>
                <Table sx={compactTableSx}>
                    <TableHead sx={{ backgroundColor: '#09090b' }}>
                        <TableRow>
                            <TableCell sx={{ width: '42%' }}>Composant</TableCell>
                            <TableCell sx={{ width: '10%' }}>Besoin</TableCell>
                            <TableCell sx={{ width: '16%' }}>Dispo</TableCell>
                            <TableCell sx={{ width: '12%' }}>Commande</TableCell>
                            <TableCell sx={{ width: '20%' }}>Statut</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {!lines.length ? (
                            <TableRow>
                                <TableCell colSpan={5} sx={{ py: 3 }}>
                                    <EmptyState
                                        eyebrow="Aucune agrégation"
                                        title="Charge au moins une BOM pour préparer les composants"
                                        description="Les quantités agrégées apparaissent ici dès que les révisions sélectionnées sont chargées dans le workspace."
                                        actionLabel="Charger une BOM"
                                    />
                                </TableCell>
                            </TableRow>
                        ) : (
                            visibleLines.map((line) => (
                                <BomStockTableRow
                                    key={line.key}
                                    line={line}
                                    onOpenStockDialog={onOpenStockDialog}
                                />
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
            {lines.length ? (
                <TablePagination
                    component="div"
                    count={lines.length}
                    page={page}
                    onPageChange={handlePageChange}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={handleRowsPerPageChange}
                    rowsPerPageOptions={[25, 50, 100]}
                    sx={compactPaginationSx}
                    labelRowsPerPage="Lignes"
                />
            ) : null}
        </>
    );
}

export default React.memo(BomStockTable);
