import React from 'react';
import {
    Autocomplete,
    Box,
    Button,
    Chip,
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
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import apiClient from '../../api/client';
import { compactCellSx, compactTableContainerSx, compactTableSx } from '../../utils/compactTable';
import StockReceptionCreateDialog from './StockReceptionCreateDialog';
import { componentLabel, fpOf } from './stockHelpers';

function fmtDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        });
    } catch (_) {
        return '';
    }
}

/**
 * Onglet « Réception » du panneau Stock : réception manuelle (mouvement IN) +
 * liste des mouvements récents **annulables** (bouton Annuler → mouvement
 * inverse réversible). La création d'un composant absent se fait via une option
 * dédiée du menu déroulant de recherche (plus de bouton séparé).
 */
function StockReceptionTab({ rows, onRefresh, onError, onFeedback }) {
    const [recComponent, setRecComponent] = React.useState(null);
    const [recQty, setRecQty] = React.useState('');
    const [recBusy, setRecBusy] = React.useState(false);
    const [createOpen, setCreateOpen] = React.useState(false);
    const [createInitial, setCreateInitial] = React.useState(null);
    const [recent, setRecent] = React.useState([]);
    const [cancelBusy, setCancelBusy] = React.useState(null);

    const typeOptions = React.useMemo(
        () => Array.from(new Set(rows.map((r) => r.component_type).filter(Boolean))).sort(),
        [rows],
    );

    const loadRecent = React.useCallback(async () => {
        try {
            const res = await apiClient.get('/marketplace/stock/movements/recent?limit=20');
            setRecent(res.data || []);
        } catch (_) { /* silencieux : la liste reste vide */ }
    }, []);

    React.useEffect(() => { loadRecent(); }, [loadRecent]);

    const openCreate = (text) => {
        setCreateInitial(text ? { mpn: text.trim() } : null);
        setCreateOpen(true);
    };

    // Réception d'un composant créé/réutilisé (dialog « Créer et réceptionner »).
    const handleCreatedReception = async (data) => {
        onFeedback(data?.component_created
            ? 'Composant créé dans le catalogue et réception ajoutée au stock.'
            : 'MPN déjà connu : réception ajoutée au composant existant.');
        await loadRecent();
        await onRefresh();
    };

    const submitReception = async () => {
        if (!recComponent || !(Number(recQty) > 0)) return;
        setRecBusy(true);
        onError(null);
        try {
            await apiClient.post('/marketplace/stock/movements', {
                component_id: recComponent.component_id,
                motif: 'reception',
                qty: Number(recQty),
            });
            setRecComponent(null);
            setRecQty('');
            onFeedback('Réception ajoutée au stock.');
            await loadRecent();
            await onRefresh();
        } catch (err) {
            onError(err?.response?.data?.detail || 'Échec de la réception.');
        } finally {
            setRecBusy(false);
        }
    };

    const cancelMovement = async (id) => {
        setCancelBusy(id);
        onError(null);
        try {
            await apiClient.post(`/marketplace/stock/movements/${id}/cancel`);
            onFeedback('Mouvement annulé (mouvement inverse enregistré).');
            await loadRecent();
            await onRefresh();
        } catch (err) {
            onError(err?.response?.data?.detail || "Échec de l'annulation.");
        } finally {
            setCancelBusy(null);
        }
    };

    return (
        <Stack spacing={2}>
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 0.5 }}>
                    Réceptionner un composant reçu
                </Typography>
                <Typography variant="body2" sx={{ color: '#a1a1aa', mb: 2 }}>
                    La quantité saisie s'ajoute au stock du composant. Si le composant n'existe
                    pas encore, choisissez « Créer et réceptionner » en bas de la liste.
                </Typography>

                <Stack direction="row" spacing={1.5} alignItems="flex-start" flexWrap="wrap" useFlexGap>
                    <Autocomplete
                        sx={{ flexGrow: 1, minWidth: 320 }}
                        options={rows}
                        value={recComponent}
                        onChange={(e, v) => {
                            if (v && v.__create) {
                                openCreate(v.inputValue);
                                return;
                            }
                            setRecComponent(v);
                        }}
                        getOptionLabel={(o) => {
                            if (o && o.__create) return `Créer et réceptionner « ${o.inputValue} »`;
                            return o ? componentLabel(o) : '';
                        }}
                        isOptionEqualToValue={(o, v) => !o.__create && !v.__create && o.component_id === v.component_id}
                        filterOptions={(opts, state) => {
                            const q = state.inputValue.trim().toLowerCase();
                            const filtered = !q
                                ? opts.slice(0, 30)
                                : opts.filter((o) => `${o.value || ''} ${o.mpn || ''} ${o.footprint_pnp || ''} ${o.footprint_eagle || ''}`.toLowerCase().includes(q)).slice(0, 30);
                            if (q) {
                                return [...filtered, { __create: true, inputValue: state.inputValue.trim() }];
                            }
                            return filtered;
                        }}
                        renderOption={(props, o) => {
                            if (o.__create) {
                                return (
                                    <li {...props} key="__create">
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'success.main', fontWeight: 500 }}>
                                            <AddCircleOutlineRoundedIcon fontSize="small" />
                                            <span>Créer et réceptionner «&nbsp;{o.inputValue}&nbsp;»</span>
                                        </Box>
                                    </li>
                                );
                            }
                            return (
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
                            );
                        }}
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

            <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>Mouvements récents</Typography>
            {recent.length === 0 ? (
                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                    Aucun mouvement de stock récent.
                </Typography>
            ) : (
                <TableContainer sx={compactTableContainerSx}>
                    <Table sx={compactTableSx} size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={compactCellSx}>Composant</TableCell>
                                <TableCell sx={compactCellSx}>Motif</TableCell>
                                <TableCell sx={compactCellSx} align="right">Mouvement</TableCell>
                                <TableCell sx={compactCellSx}>Poste</TableCell>
                                <TableCell sx={compactCellSx}>Date</TableCell>
                                <TableCell sx={compactCellSx} align="right">Action</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {recent.map((m) => (
                                <TableRow key={m.id}>
                                    <TableCell sx={compactCellSx}>
                                        {(m.value || '-')} · <span style={{ color: '#a1a1aa' }}>{m.mpn || '-'}</span>
                                    </TableCell>
                                    <TableCell sx={compactCellSx}>
                                        <Chip size="small" variant="outlined" label={m.motif} />
                                    </TableCell>
                                    <TableCell sx={{ ...compactCellSx, fontWeight: 600, color: m.signed_qty >= 0 ? 'success.main' : 'error.main' }} align="right">
                                        {m.signed_qty >= 0 ? `+${m.signed_qty}` : m.signed_qty}
                                    </TableCell>
                                    <TableCell sx={{ ...compactCellSx, color: '#a1a1aa' }}>{m.created_by || '-'}</TableCell>
                                    <TableCell sx={{ ...compactCellSx, color: '#a1a1aa' }}>{fmtDate(m.date)}</TableCell>
                                    <TableCell sx={compactCellSx} align="right">
                                        <Button
                                            size="small"
                                            color="inherit"
                                            startIcon={<UndoRoundedIcon />}
                                            disabled={cancelBusy === m.id}
                                            onClick={() => cancelMovement(m.id)}
                                        >
                                            Annuler
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
            <Typography variant="caption" sx={{ color: '#71717a' }}>
                « Annuler » enregistre un mouvement inverse (réversible, rien n'est supprimé).
                Pour corriger une quantité : annuler puis re-réceptionner.
            </Typography>

            <StockReceptionCreateDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onReceived={handleCreatedReception}
                typeOptions={typeOptions}
                initialForm={createInitial}
            />
        </Stack>
    );
}

export default StockReceptionTab;
