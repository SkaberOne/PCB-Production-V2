import React from 'react';
import {
    Alert,
    Autocomplete,
    Button,
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
import apiClient from '../../api/client';
import { compactCellSx, compactTableContainerSx, compactTableSx } from '../../utils/compactTable';

const CARD_SX = { backgroundColor: '#18181b', border: '1px solid #27272a' };

/**
 * « Stock chargé sur la machine » (ADR 0012, Phase 3). Charger / décharger
 * manuellement les composants physiquement clipsés sur les feeders d'une machine.
 * Annotation (n'affecte pas le solde) ; sert à distinguer stock libre vs engagé.
 */
function MachineLoadPanel() {
    const [machines, setMachines] = React.useState([]);
    const [machineId, setMachineId] = React.useState('');
    const [loads, setLoads] = React.useState([]);
    const [components, setComponents] = React.useState([]);
    const [pick, setPick] = React.useState(null);
    const [qty, setQty] = React.useState('');
    const [error, setError] = React.useState(null);
    const [feedback, setFeedback] = React.useState(null);

    React.useEffect(() => {
        (async () => {
            try {
                const [m, s] = await Promise.all([
                    apiClient.get('/marketplace/machines'),
                    apiClient.get('/marketplace/stock'),
                ]);
                setMachines(m.data?.data || []);
                setComponents(Array.isArray(s.data) ? s.data : []);
            } catch (err) {
                setError(err?.response?.data?.detail || 'Chargement impossible.');
            }
        })();
    }, []);

    const loadLoads = React.useCallback(async (id) => {
        if (!id) { setLoads([]); return; }
        try {
            const res = await apiClient.get(`/marketplace/machines/${id}/loads`);
            setLoads(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            setError(err?.response?.data?.detail || 'Chargement des composants impossible.');
        }
    }, []);

    const onSelectMachine = (e) => {
        setMachineId(e.target.value);
        loadLoads(e.target.value);
    };

    const setLoad = async (componentId, quantity) => {
        try {
            const res = await apiClient.put(
                `/marketplace/machines/${machineId}/loads/${componentId}`,
                { qty_loaded: Math.max(Number(quantity) || 0, 0) },
            );
            setLoads(Array.isArray(res.data) ? res.data : []);
            return true;
        } catch (err) {
            setError(err?.response?.data?.detail || 'Échec de l’opération.');
            return false;
        }
    };

    const charger = async () => {
        if (!machineId || !pick) return;
        const ok = await setLoad(pick.component_id, qty);
        if (ok) {
            setFeedback('Composant chargé sur la machine.');
            setPick(null);
            setQty('');
        }
    };

    const componentLabel = (c) =>
        `${c.value || '?'} · ${c.footprint_pnp || c.footprint_eagle || '-'}${c.mpn ? ` · ${c.mpn}` : ''}`;

    return (
        <Card sx={CARD_SX}>
            <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Stock chargé sur la machine
                </Typography>
                <Typography variant="body2" sx={{ color: '#a1a1aa', mb: 2 }}>
                    Composants physiquement clipsés sur les feeders. N'affecte pas le solde ;
                    sert à distinguer le stock libre du stock engagé.
                </Typography>

                {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert> : null}
                {feedback ? <Alert severity="success" sx={{ mb: 2 }} onClose={() => setFeedback(null)}>{feedback}</Alert> : null}

                <Stack spacing={2}>
                    <TextField
                        select
                        size="small"
                        label="Machine"
                        value={machineId}
                        onChange={onSelectMachine}
                        SelectProps={{ native: true }}
                        sx={{ maxWidth: 320 }}
                    >
                        <option value="">Choisir une machine…</option>
                        {machines.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </TextField>

                    {machineId ? (
                        <>
                            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Autocomplete
                                    size="small"
                                    sx={{ minWidth: 320 }}
                                    options={components}
                                    value={pick}
                                    onChange={(_, v) => setPick(v)}
                                    getOptionLabel={componentLabel}
                                    isOptionEqualToValue={(o, v) => o.component_id === v.component_id}
                                    renderInput={(params) => <TextField {...params} label="Composant à charger" />}
                                />
                                <TextField
                                    size="small"
                                    type="number"
                                    label="Quantité chargée"
                                    value={qty}
                                    onChange={(e) => setQty(e.target.value)}
                                    sx={{ maxWidth: 180 }}
                                />
                                <Button variant="contained" onClick={charger} disabled={!pick}>Charger</Button>
                            </Stack>

                            <TableContainer sx={compactTableContainerSx}>
                                <Table sx={compactTableSx} size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={compactCellSx}>Composant</TableCell>
                                            <TableCell sx={compactCellSx}>Empreinte</TableCell>
                                            <TableCell sx={compactCellSx} align="right">Qté chargée</TableCell>
                                            <TableCell sx={compactCellSx} align="right">Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {loads.length === 0 ? (
                                            <TableRow>
                                                <TableCell sx={compactCellSx} colSpan={4}>
                                                    <Typography variant="body2" sx={{ color: '#a1a1aa', py: 1 }}>
                                                        Aucun composant chargé sur cette machine.
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            loads.map((l) => (
                                                <TableRow key={l.component_id} hover>
                                                    <TableCell sx={compactCellSx}>{l.value || '-'}{l.mpn ? ` · ${l.mpn}` : ''}</TableCell>
                                                    <TableCell sx={compactCellSx}>{l.footprint || '-'}</TableCell>
                                                    <TableCell sx={compactCellSx} align="right">{l.qty_loaded}</TableCell>
                                                    <TableCell sx={compactCellSx} align="right">
                                                        <Button size="small" color="inherit" onClick={() => setLoad(l.component_id, 0)}>
                                                            Décharger
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </>
                    ) : null}
                </Stack>
            </CardContent>
        </Card>
    );
}

export default MachineLoadPanel;
