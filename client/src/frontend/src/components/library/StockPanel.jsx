import React from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    IconButton,
    InputAdornment,
    MenuItem,
    Stack,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tabs,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import apiClient from '../../api/client';
import BomStockDialog from '../bom/BomStockDialog';
import DeleteComponentDialog from './DeleteComponentDialog';
import useEventStream from '../../hooks/useEventStream';
import { buildStockSummary } from '../../utils/bomPlanning';
import { compactCellSx, compactTableContainerSx, compactTableSx } from '../../utils/compactTable';

// Statut renvoyé par le backend (ADR 0010) -> chip.
const STATUS_META = {
    ok: { label: 'OK', color: 'success' },
    bas: { label: 'Bas', color: 'warning' },
    manque: { label: 'Manque', color: 'error' },
    'non-matché': { label: 'Non-matché', color: 'default' },
};

function statusChip(status) {
    const meta = STATUS_META[status] || { label: status || '-', color: 'default' };
    return <Chip size="small" variant="outlined" color={meta.color} label={meta.label} />;
}

function fpOf(row) {
    return row.footprint_pnp || row.footprint_eagle || '';
}

function componentLabel(row) {
    return [row.value || '-', fpOf(row) || '-', row.mpn || '-'].join('  ·  ');
}

function StockPanel() {
    const [rows, setRows] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(null);
    const [feedback, setFeedback] = React.useState(null);
    const [globalLoss, setGlobalLoss] = React.useState('');

    // Sous-onglets Inventaire / Réception.
    const [tab, setTab] = React.useState('inventaire');

    // Inventaire : recherche + filtres.
    const [search, setSearch] = React.useState('');
    const [filterType, setFilterType] = React.useState('');
    const [filterFp, setFilterFp] = React.useState('');
    const [lowOnly, setLowOnly] = React.useState(false);

    // Réception manuelle (ajoute au stock).
    const [recComponent, setRecComponent] = React.useState(null);
    const [recQty, setRecQty] = React.useState('');
    const [recBusy, setRecBusy] = React.useState(false);
    const [receipts, setReceipts] = React.useState([]); // historique de session

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

    const refresh = React.useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            const [stockRes, settingsRes] = await Promise.all([
                apiClient.get('/marketplace/stock'),
                apiClient.get('/marketplace/stock/settings'),
            ]);
            setRows(Array.isArray(stockRes.data) ? stockRes.data : []);
            setGlobalLoss(String(settingsRes.data?.global_loss_pct ?? 0));
        } catch (err) {
            if (!silent) setError(err?.response?.data?.detail || 'Impossible de charger le stock.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        refresh();
    }, [refresh]);

    // Temps réel : rafraîchit silencieusement quand un autre poste modifie le stock.
    useEventStream('stock', React.useCallback(() => { refresh(true); }, [refresh]));

    // ---- Filtres inventaire ----
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

    const saveGlobalLoss = async () => {
        try {
            await apiClient.put('/marketplace/stock/settings', {
                global_loss_pct: Number(globalLoss) || 0,
            });
            setFeedback('Coefficient de perte global enregistré.');
        } catch (err) {
            setError(err?.response?.data?.detail || 'Échec de la sauvegarde du coefficient.');
        }
    };

    // ---- Réception manuelle ----
    const submitReception = async () => {
        if (!recComponent || !(Number(recQty) > 0)) return;
        setRecBusy(true);
        setError(null);
        try {
            const oldQty = Number(recComponent.qty_pieces) || 0;
            const res = await apiClient.post('/marketplace/stock/movements', {
                component_id: recComponent.component_id,
                motif: 'reception',
                qty: Number(recQty),
            });
            const newQty = res.data?.qty_pieces ?? oldQty + Number(recQty);
            setReceipts((prev) => [
                {
                    id: Date.now(),
                    label: componentLabel(recComponent),
                    qty: Number(recQty),
                    old: oldQty,
                    next: newQty,
                    date: new Date(),
                },
                ...prev,
            ]);
            setRecComponent(null);
            setRecQty('');
            setFeedback('Réception ajoutée au stock.');
            await refresh();
        } catch (err) {
            setError(err?.response?.data?.detail || 'Échec de la réception.');
        } finally {
            setRecBusy(false);
        }
    };

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
            setFeedback('Stock déclaré (recomptage enregistré).');
            await refresh();
        } catch (err) {
            setError(err?.response?.data?.detail || 'Échec de la déclaration de stock.');
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
            setFeedback('Correction / seuils enregistrés.');
            await refresh();
        } catch (err) {
            setError(err?.response?.data?.detail || 'Échec de la correction.');
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Stack spacing={2}>
            {error ? <Alert severity="error" onClose={() => setError(null)}>{error}</Alert> : null}
            {feedback ? <Alert severity="success" onClose={() => setFeedback(null)}>{feedback}</Alert> : null}

            <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 40 }}>
                <Tab value="inventaire" label="Inventaire" sx={{ minHeight: 40 }} />
                <Tab value="reception" label="Réception" sx={{ minHeight: 40 }} />
            </Tabs>

            {tab === 'inventaire' ? (
                <>
                    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                        <TextField
                            size="small"
                            type="number"
                            label="Coefficient de perte global (%)"
                            value={globalLoss}
                            onChange={(e) => setGlobalLoss(e.target.value)}
                            sx={{ maxWidth: 260 }}
                            helperText="Feeders + repicks (hors SAV). Surchargeable par composant."
                        />
                        <Button variant="outlined" onClick={saveGlobalLoss}>Enregistrer</Button>
                        <Box sx={{ flexGrow: 1 }} />
                        <Button variant="text" onClick={refresh}>Rafraîchir</Button>
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
                </>
            ) : (
                <>
                    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 0.5 }}>
                            Réceptionner un composant reçu
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#a1a1aa', mb: 2 }}>
                            La quantité saisie s'ajoute au stock du composant. La Revue BOM se met à jour automatiquement.
                        </Typography>

                        <Stack direction="row" spacing={1.5} alignItems="flex-start" flexWrap="wrap" useFlexGap>
                            <Autocomplete
                                sx={{ flexGrow: 1, minWidth: 320 }}
                                options={rows}
                                value={recComponent}
                                onChange={(e, v) => setRecComponent(v)}
                                getOptionLabel={(o) => (o ? componentLabel(o) : '')}
                                isOptionEqualToValue={(o, v) => o.component_id === v.component_id}
                                filterOptions={(opts, state) => {
                                    const q = state.inputValue.trim().toLowerCase();
                                    if (!q) return opts.slice(0, 30);
                                    return opts
                                        .filter((o) => `${o.value || ''} ${o.mpn || ''} ${o.footprint_pnp || ''} ${o.footprint_eagle || ''}`.toLowerCase().includes(q))
                                        .slice(0, 30);
                                }}
                                renderOption={(props, o) => (
                                    <li {...props} key={o.component_id}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 1 }}>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="body2" component="span" sx={{ fontWeight: 500 }}>
                                                    {o.value || '-'}
                                                </Typography>
                                                <Typography variant="body2" component="span" sx={{ color: '#a1a1aa' }}>
                                                    {' · '}{fpOf(o) || '-'}
                                                </Typography>
                                                <Typography variant="caption" component="div" sx={{ color: '#a1a1aa' }} noWrap>
                                                    {o.mpn || '-'}
                                                </Typography>
                                            </Box>
                                            <Typography variant="caption" sx={{ whiteSpace: 'nowrap', color: '#a1a1aa' }}>
                                                stock {o.qty_pieces}
                                            </Typography>
                                        </Box>
                                    </li>
                                )}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        size="small"
                                        label="Composant"
                                        placeholder="Tape une valeur ou un MPN…"
                                    />
                                )}
                            />
                            <TextField
                                size="small"
                                type="number"
                                label="Quantité reçue"
                                value={recQty}
                                onChange={(e) => setRecQty(e.target.value)}
                                sx={{ width: 160 }}
                                inputProps={{ min: 1 }}
                            />
                            <Button
                                variant="contained"
                                color="success"
                                startIcon={<AddRoundedIcon />}
                                disabled={recBusy || !recComponent || !(Number(recQty) > 0)}
                                onClick={submitReception}
                                sx={{ height: 40 }}
                            >
                                Ajouter au stock
                            </Button>
                        </Stack>
                        {recComponent ? (
                            <Typography variant="caption" sx={{ color: '#a1a1aa', display: 'block', mt: 1 }}>
                                {recComponent.value || '-'} {fpOf(recComponent)} — stock actuel : <b>{recComponent.qty_pieces}</b> pcs
                            </Typography>
                        ) : null}
                    </Box>

                    <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>Réceptions récentes</Typography>
                    {receipts.length === 0 ? (
                        <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                            Aucune réception depuis l'ouverture de la page.
                        </Typography>
                    ) : (
                        <TableContainer sx={compactTableContainerSx}>
                            <Table sx={compactTableSx} size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={compactCellSx}>Composant</TableCell>
                                        <TableCell sx={compactCellSx} align="right">Reçu</TableCell>
                                        <TableCell sx={compactCellSx} align="right">Ancien</TableCell>
                                        <TableCell sx={compactCellSx} align="right">Nouveau</TableCell>
                                        <TableCell sx={compactCellSx}>Heure</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {receipts.map((r) => (
                                        <TableRow key={r.id}>
                                            <TableCell sx={compactCellSx}>{r.label}</TableCell>
                                            <TableCell sx={compactCellSx} align="right">+{r.qty}</TableCell>
                                            <TableCell sx={{ ...compactCellSx, color: '#a1a1aa' }} align="right">{r.old}</TableCell>
                                            <TableCell sx={{ ...compactCellSx, fontWeight: 600 }} align="right">{r.next}</TableCell>
                                            <TableCell sx={{ ...compactCellSx, color: '#a1a1aa' }}>
                                                {r.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </>
            )}

            <DeleteComponentDialog
                open={Boolean(deleteRow)}
                component={deleteRow ? {
                    id: deleteRow.component_id,
                    label: deleteRow.value || deleteRow.mpn || `#${deleteRow.component_id}`,
                } : null}
                onClose={() => setDeleteRow(null)}
                onDeleted={(deletedId) => {
                    setRows((prev) => prev.filter((r) => r.component_id !== deletedId));
                    setFeedback('Composant supprimé de la base de données.');
                }}
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

            <Dialog open={Boolean(paramsRow)} onClose={() => setParamsRow(null)} fullWidth maxWidth="xs">
                <DialogTitle>Correction d'inventaire & seuils</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                            {paramsRow ? (paramsRow.mpn || paramsRow.value || 'Composant') : ''}
                        </Typography>
                        <TextField
                            size="small"
                            type="number"
                            label="Solde recompté (correction)"
                            value={newTotal}
                            onChange={(e) => setNewTotal(e.target.value)}
                            helperText="Recomptage physique : ajuste le solde (absorbe le drain SAV)."
                        />
                        <TextField
                            size="small"
                            type="number"
                            label="Seuil bas (safety stock)"
                            value={safetyStock}
                            onChange={(e) => setSafetyStock(e.target.value)}
                        />
                        <TextField
                            size="small"
                            type="number"
                            label="Perte % (surcharge composant)"
                            value={lossOverride}
                            onChange={(e) => setLossOverride(e.target.value)}
                            helperText="Vide = coefficient global."
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button color="inherit" onClick={() => setParamsRow(null)}>Annuler</Button>
                    <Button variant="contained" onClick={saveParams}>Enregistrer</Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}

export default StockPanel;
