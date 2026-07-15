import React from 'react';
import {
    Autocomplete,
    Box,
    Button,
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
import PlaylistAddRoundedIcon from '@mui/icons-material/PlaylistAddRounded';
import { Chip } from '@mui/material';
import apiClient from '../../api/client';
import { compactCellSx, compactTableContainerSx, compactTableSx } from '../../utils/compactTable';
import StockReceptionCreateDialog from './StockReceptionCreateDialog';
import { componentLabel, fpOf } from './stockHelpers';

/**
 * Onglet « Réception » du panneau Stock : réception manuelle (mouvement IN,
 * motif reception) + historique de session des réceptions.
 */
function StockReceptionTab({ rows, onRefresh, onError, onFeedback }) {
    const [recComponent, setRecComponent] = React.useState(null);
    const [recQty, setRecQty] = React.useState('');
    const [recBusy, setRecBusy] = React.useState(false);
    const [receipts, setReceipts] = React.useState([]); // historique de session
    const [createOpen, setCreateOpen] = React.useState(false);

    // Réception via le dialog « Créer et réceptionner » (composant créé ou réutilisé par MPN).
    const handleCreatedReception = async (data, qty) => {
        const comp = data?.component || {};
        setReceipts((prev) => [
            {
                id: Date.now(),
                label: [comp.value || '-', comp.footprint_pnp || comp.footprint_eagle || '-', comp.mpn || '-'].join('  ·  '),
                qty,
                old: (data?.stock?.qty_pieces ?? qty) - qty,
                next: data?.stock?.qty_pieces ?? qty,
                date: new Date(),
                created: Boolean(data?.component_created),
            },
            ...prev,
        ]);
        onFeedback(data?.component_created
            ? 'Composant créé dans le catalogue et réception ajoutée au stock.'
            : 'MPN déjà connu : réception ajoutée au composant existant.');
        await onRefresh();
    };

    const submitReception = async () => {
        if (!recComponent || !(Number(recQty) > 0)) return;
        setRecBusy(true);
        onError(null);
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
            onFeedback('Réception ajoutée au stock.');
            await onRefresh();
        } catch (err) {
            onError(err?.response?.data?.detail || 'Échec de la réception.');
        } finally {
            setRecBusy(false);
        }
    };

    return (
        <Stack spacing={2}>
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
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                        Composant absent de la base ?
                    </Typography>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<PlaylistAddRoundedIcon />}
                        onClick={() => setCreateOpen(true)}
                    >
                        Créer et réceptionner
                    </Button>
                </Stack>
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
                                    <TableCell sx={compactCellSx}>
                                        {r.label}
                                        {r.created ? (
                                            <Chip size="small" variant="outlined" color="info" label="créé" sx={{ ml: 1 }} />
                                        ) : null}
                                    </TableCell>
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

            <StockReceptionCreateDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onReceived={handleCreatedReception}
            />
        </Stack>
    );
}

export default StockReceptionTab;
