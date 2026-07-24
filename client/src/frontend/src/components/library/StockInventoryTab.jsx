import React from 'react';
import {
    Box,
    Button,
    Checkbox,
    FormControlLabel,
    IconButton,
    InputAdornment,
    MenuItem,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import apiClient, { extractApiError } from '../../api/client';
import BomStockDialog from '../bom/BomStockDialog';
import DeleteComponentDialog from './DeleteComponentDialog';
import StockCorrectionDialog from './StockCorrectionDialog';
import { buildStockSummary } from '../../utils/bomPlanning';
import { compactCellSx, compactTableContainerSx, compactTableSx } from '../../utils/compactTable';
import { statusChip, fpOf } from './stockHelpers';

/**
 * Onglet « Inventaire » du panneau Stock (ADR 0010).
 * Recherche/filtres, table des soldes, déclaration (set-to), correction/seuils,
 * suppression de doublon. L'état de la liste (rows) est porté par StockPanel.
 */
function StockInventoryTab({
    rows,
    globalLoss,
    onGlobalLossChange,
    onSaveGlobalLoss,
    onRefresh,
    onError,
    onFeedback,
    onComponentDeleted,
}) {
    // Recherche + filtres.
    const [search, setSearch] = React.useState('');
    const [filterType, setFilterType] = React.useState('');
    const [filterFp, setFilterFp] = React.useState('');
    const [lowOnly, setLowOnly] = React.useState(false);

    // Déclaration (BomStockDialog réutilisé, motif declaration set-to).
    const [declareRow, setDeclareRow] = React.useState(null);
    const [draft, setDraft] = React.useState({});

    // Suppression d'un composant en doublon (dialogue partagé).
    const [deleteRow, setDeleteRow] = React.useState(null);

    // Correction d'inventaire + seuils (motif correction + params).
    const [paramsRow, setParamsRow] = React.useState(null);
    const [newTotal, setNewTotal] = React.useState('');
    const [safetyStock, setSafetyStock] = React.useState('');
    const [lossOverride, setLossOverride] = React.useState('');

    const typeOptions = React.useMemo(
        () => Array.from(new Set(rows.map((r) => r.component_type).filter(Boolean))).sort(),
        [rows],
    );
    const fpOptions = React.useMemo(
        () => Array.from(new Set(rows.map(fpOf).filter(Boolean))).sort(),
        [rows],
    );
    const filteredRows = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((r) => {
            if (q) {
                const hay = `${r.value || ''} ${r.mpn || ''} ${r.footprint_pnp || ''} ${r.footprint_eagle || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (filterType && r.component_type !== filterType) return false;
            if (filterFp && fpOf(r) !== filterFp) return false;
            if (lowOnly && r.status === 'ok') return false;
            return true;
        });
    }, [rows, search, filterType, filterFp, lowOnly]);

    // ---- Déclaration ----
    const openDeclare = (row) => {
        setDeclareRow(row);
        setDraft({
            reel_manual_override_qty: row.qty_reel > 0 ? String(row.qty_reel) : '',
            bag_qty: row.qty_bag > 0 ? String(row.qty_bag) : '',
            tube_qty: row.qty_tube > 0 ? String(row.qty_tube) : '',
        });
    };

    const handleStockDraftChange = React.useCallback(
        (key, field) => (event) => {
            const value = event?.target?.value;
            setDraft((prev) => ({ ...prev, [field]: value }));
        },
        [],
    );

    const noop = React.useCallback(() => () => {}, []);

    const saveDeclaration = async () => {
        if (!declareRow) return;
        try {
            await apiClient.post('/marketplace/stock/movements', {
                component_id: declareRow.component_id,
                motif: 'declaration',
                qty_reel: Number(draft.reel_manual_override_qty) || 0,
                qty_bag: Number(draft.bag_qty) || 0,
                qty_tube: Number(draft.tube_qty) || 0,
            });
            setDeclareRow(null);
            onFeedback('Stock déclaré (recomptage enregistré).');
            await onRefresh();
        } catch (err) {
            onError(extractApiError(err) || 'Échec de la déclaration de stock.');
        }
    };

    const declareLine = React.useMemo(() => {
        if (!declareRow) return null;
        const base = {
            requiredQuantity: 0,
            componentTapeWidthMm: null,
            componentPitchMm: null,
            manualPlacementBase: false,
        };
        const summary = buildStockSummary(base, draft);
        return {
            key: String(declareRow.component_id),
            value: declareRow.value || '',
            footprint: declareRow.footprint_pnp || declareRow.footprint_eagle || '',
            type: declareRow.component_type || '',
            componentLibraryName: declareRow.mpn || declareRow.value || 'Composant',
            componentPitchMm: null,
            requiredQuantity: 0,
            draft,
            ...summary,
        };
    }, [declareRow, draft]);

    // ---- Correction + seuils ----
    const openParams = (row) => {
        setParamsRow(row);
        setNewTotal(String(row.qty_pieces ?? 0));
        setSafetyStock(String(row.safety_stock ?? 0));
        setLossOverride(row.loss_pct == null ? '' : String(row.loss_pct));
    };

    const saveParams = async () => {
        if (!paramsRow) return;
        try {
            // Seuils + surcharge de perte.
            await apiClient.put(`/marketplace/stock/${paramsRow.component_id}/params`, {
                safety_stock: Number(safetyStock) || 0,
                loss_pct: lossOverride === '' ? null : Number(lossOverride),
            });
            // Correction d'inventaire si le total a changé.
            if (Number(newTotal) !== Number(paramsRow.qty_pieces)) {
                await apiClient.post('/marketplace/stock/movements', {
                    component_id: paramsRow.component_id,
                    motif: 'correction',
                    new_total: Number(newTotal) || 0,
                });
            }
            setParamsRow(null);
            onFeedback('Correction / seuils enregistrés.');
            await onRefresh();
        } catch (err) {
            onError(extractApiError(err) || 'Échec de la correction.');
        }
    };

    return (
        <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                <TextField
                    size="small"
                    type="number"
                    label="Coefficient de perte global (%)"
                    value={globalLoss}
                    onChange={(e) => onGlobalLossChange(e.target.value)}
                    sx={{ maxWidth: 260 }}
                    helperText="Feeders + repicks (hors SAV). Surchargeable par composant."
                />
                <Button variant="outlined" onClick={onSaveGlobalLoss}>Enregistrer</Button>
                <Box sx={{ flexGrow: 1 }} />
                <Button variant="text" onClick={onRefresh}>Rafraîchir</Button>
            </Stack>

            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                <TextField
                    size="small"
                    placeholder="Rechercher : valeur, MPN, empreinte…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    sx={{ flexGrow: 1, minWidth: 240 }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchRoundedIcon fontSize="small" />
                            </InputAdornment>
                        ),
                    }}
                />
                <TextField
                    select
                    size="small"
                    label="Type"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    sx={{ minWidth: 150 }}
                >
                    <MenuItem value="">Tous</MenuItem>
                    {typeOptions.map((t) => (
                        <MenuItem key={t} value={t}>{t}</MenuItem>
                    ))}
                </TextField>
                <TextField
                    select
                    size="small"
                    label="Empreinte"
                    value={filterFp}
                    onChange={(e) => setFilterFp(e.target.value)}
                    sx={{ minWidth: 150 }}
                >
                    <MenuItem value="">Toutes</MenuItem>
                    {fpOptions.map((f) => (
                        <MenuItem key={f} value={f}>{f}</MenuItem>
                    ))}
                </TextField>
                <FormControlLabel
                    control={<Checkbox size="small" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />}
                    label="Stock faible"
                />
            </Stack>

            <TableContainer sx={compactTableContainerSx}>
                <Table sx={compactTableSx} size="small">
                    {/* Largeurs fixes : la colonne Actions garde assez de place (Saisir + Corriger + supprimer)
                        quelle que soit la taille de la fenêtre, sans rogner « Saisir ». */}
                    <colgroup>
                        <col style={{ width: '13%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '186px' }} />
                    </colgroup>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={compactCellSx}>Value</TableCell>
                            <TableCell sx={compactCellSx}>MPN</TableCell>
                            <TableCell sx={compactCellSx}>Empreinte</TableCell>
                            <TableCell sx={compactCellSx} align="right">Solde</TableCell>
                            <TableCell sx={compactCellSx} align="right">Engagé</TableCell>
                            <TableCell sx={compactCellSx} align="right">Libre</TableCell>
                            <TableCell sx={compactCellSx} align="right">Bobine</TableCell>
                            <TableCell sx={compactCellSx} align="right">Sachet</TableCell>
                            <TableCell sx={compactCellSx} align="right">Tube</TableCell>
                            <TableCell sx={compactCellSx} align="right">Seuil</TableCell>
                            <TableCell sx={compactCellSx}>Statut</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }} align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredRows.length === 0 ? (
                            <TableRow>
                                <TableCell sx={compactCellSx} colSpan={12}>
                                    <Typography variant="body2" sx={{ color: '#a1a1aa', py: 2 }}>
                                        {rows.length === 0
                                            ? 'Aucun composant. Le stock se remplit au fil des déclarations et des réceptions de commande.'
                                            : 'Aucun composant ne correspond à la recherche / aux filtres.'}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredRows.map((row) => (
                                <TableRow key={row.component_id} hover>
                                    <TableCell sx={compactCellSx}>{row.value || '-'}</TableCell>
                                    <TableCell sx={compactCellSx}>{row.mpn || '-'}</TableCell>
                                    <TableCell sx={compactCellSx}>{row.footprint_pnp || row.footprint_eagle || '-'}</TableCell>
                                    <TableCell sx={compactCellSx} align="right">{row.qty_pieces}</TableCell>
                                    <TableCell sx={compactCellSx} align="right">{row.engaged ?? 0}</TableCell>
                                    <TableCell sx={compactCellSx} align="right">{row.libre ?? row.qty_pieces}</TableCell>
                                    <TableCell sx={compactCellSx} align="right">{row.qty_reel}</TableCell>
                                    <TableCell sx={compactCellSx} align="right">{row.qty_bag}</TableCell>
                                    <TableCell sx={compactCellSx} align="right">{row.qty_tube}</TableCell>
                                    <TableCell sx={compactCellSx} align="right">{row.safety_stock}</TableCell>
                                    <TableCell sx={compactCellSx}>{statusChip(row.status)}</TableCell>
                                    <TableCell sx={{ whiteSpace: 'nowrap', overflow: 'visible' }} align="right">
                                        <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center" flexWrap="nowrap">
                                            <Button size="small" onClick={() => openDeclare(row)} sx={{ minWidth: 0, px: 1 }}>Saisir</Button>
                                            <Button size="small" color="inherit" onClick={() => openParams(row)} sx={{ minWidth: 0, px: 1 }}>Corriger</Button>
                                            <Tooltip title="Supprimer le composant (doublon)">
                                                <IconButton size="small" color="error" onClick={() => setDeleteRow(row)} sx={{ p: 0.5 }}>
                                                    <DeleteOutlineRoundedIcon fontSize="inherit" />
                                                </IconButton>
                                            </Tooltip>
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
            <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                {filteredRows.length} composant(s) affiché(s){filteredRows.length !== rows.length ? ` sur ${rows.length}` : ''}
            </Typography>

            <DeleteComponentDialog
                open={Boolean(deleteRow)}
                component={deleteRow ? {
                    id: deleteRow.component_id,
                    label: deleteRow.value || deleteRow.mpn || `#${deleteRow.component_id}`,
                } : null}
                onClose={() => setDeleteRow(null)}
                onDeleted={onComponentDeleted}
            />

            <BomStockDialog
                line={declareLine}
                open={Boolean(declareRow)}
                onClose={() => setDeclareRow(null)}
                onStockDraftChange={handleStockDraftChange}
                onPitchBlur={noop}
                onSave={saveDeclaration}
                saveLabel="Déclarer le stock"
            />

            <StockCorrectionDialog
                row={paramsRow}
                newTotal={newTotal}
                onNewTotalChange={(e) => setNewTotal(e.target.value)}
                safetyStock={safetyStock}
                onSafetyStockChange={(e) => setSafetyStock(e.target.value)}
                lossOverride={lossOverride}
                onLossOverrideChange={(e) => setLossOverride(e.target.value)}
                onClose={() => setParamsRow(null)}
                onSave={saveParams}
            />
        </Stack>
    );
}

export default StockInventoryTab;
