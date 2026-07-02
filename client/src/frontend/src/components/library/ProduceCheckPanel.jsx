import React from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    MenuItem,
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

/**
 * « Puis-je produire ? » (ADR 0011) : sélectionne une production, compare le besoin
 * au stock disponible (− réservé par les autres), liste les manques + quantités à
 * commander, et permet de clôturer un lot (nb réel de cartes → OUT auto).
 */
function ProduceCheckPanel() {
    const [productions, setProductions] = React.useState([]);
    const [selectedId, setSelectedId] = React.useState('');
    const [report, setReport] = React.useState(null);
    const [runs, setRuns] = React.useState([]);
    const [boards, setBoards] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [feedback, setFeedback] = React.useState(null);

    const selected = productions.find((p) => String(p.id) === String(selectedId)) || null;

    React.useEffect(() => {
        (async () => {
            try {
                const res = await apiClient.get('/marketplace/productions');
                setProductions(res.data?.items || []);
            } catch (err) {
                setError(err?.response?.data?.detail || 'Impossible de charger les productions.');
            }
        })();
    }, []);

    const loadReport = React.useCallback(async (productionId) => {
        if (!productionId) return;
        setLoading(true);
        setError(null);
        try {
            const machineId = (productions.find((p) => String(p.id) === String(productionId)) || {}).machine_id || 0;
            const [rep, runsRes] = await Promise.all([
                apiClient.get(`/marketplace/stock/can-produce/${productionId}`),
                apiClient.get(`/marketplace/machines/${machineId}/productions/${productionId}/runs`),
            ]);
            setReport(rep.data);
            setRuns(Array.isArray(runsRes.data) ? runsRes.data : []);
            setBoards(String(rep.data?.board_count ?? ''));
        } catch (err) {
            setError(err?.response?.data?.detail || 'Impossible de charger l’analyse.');
        } finally {
            setLoading(false);
        }
    }, [productions]);

    const onSelect = (event) => {
        const id = event.target.value;
        setSelectedId(id);
        setReport(null);
        setRuns([]);
        loadReport(id);
    };

    const produce = async () => {
        if (!selected) return;
        try {
            const machineId = selected.machine_id || 0;
            await apiClient.post(
                `/marketplace/machines/${machineId}/productions/${selected.id}/produce`,
                { boards_produced: Number(boards) || 0 },
            );
            setFeedback('Production clôturée : mouvements de sortie enregistrés.');
            await loadReport(selected.id);
        } catch (err) {
            setError(err?.response?.data?.detail || 'Échec de la clôture de production.');
        }
    };

    const cancelRun = async (runId) => {
        if (!selected) return;
        try {
            const machineId = selected.machine_id || 0;
            await apiClient.post(`/marketplace/machines/${machineId}/productions/${selected.id}/runs/${runId}/cancel`);
            setFeedback('Lot annulé : sorties contre-passées.');
            await loadReport(selected.id);
        } catch (err) {
            setError(err?.response?.data?.detail || 'Échec de l’annulation du lot.');
        }
    };

    return (
        <Stack spacing={2}>
            {error ? <Alert severity="error" onClose={() => setError(null)}>{error}</Alert> : null}
            {feedback ? <Alert severity="success" onClose={() => setFeedback(null)}>{feedback}</Alert> : null}

            <TextField
                select
                size="small"
                label="Production"
                value={selectedId}
                onChange={onSelect}
                sx={{ maxWidth: 420 }}
            >
                <MenuItem value=""><em>Choisir une production…</em></MenuItem>
                {productions.map((p) => (
                    <MenuItem key={p.id} value={p.id}>{p.name} ({p.status})</MenuItem>
                ))}
            </TextField>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
            ) : null}

            {report && !loading ? (
                <>
                    <Alert severity={report.can_produce ? 'success' : 'warning'}>
                        {report.can_produce
                            ? `Stock suffisant pour ${report.board_count} carte(s).`
                            : `${report.shortage_count} composant(s) en manque pour ${report.board_count} carte(s).`}
                    </Alert>

                    <TableContainer sx={compactTableContainerSx}>
                        <Table sx={compactTableSx} size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={compactCellSx}>Value</TableCell>
                                    <TableCell sx={compactCellSx}>MPN</TableCell>
                                    <TableCell sx={compactCellSx}>Empreinte</TableCell>
                                    <TableCell sx={compactCellSx} align="right">Besoin</TableCell>
                                    <TableCell sx={compactCellSx} align="right">Solde</TableCell>
                                    <TableCell sx={compactCellSx} align="right">Réservé</TableCell>
                                    <TableCell sx={compactCellSx} align="right">Dispo</TableCell>
                                    <TableCell sx={compactCellSx} align="right">Manque</TableCell>
                                    <TableCell sx={compactCellSx} align="right">À commander</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {report.lines.map((l) => (
                                    <TableRow key={l.component_id} hover>
                                        <TableCell sx={compactCellSx}>{l.value || '-'}</TableCell>
                                        <TableCell sx={compactCellSx}>{l.mpn || '-'}</TableCell>
                                        <TableCell sx={compactCellSx}>{l.footprint || '-'}</TableCell>
                                        <TableCell sx={compactCellSx} align="right">{l.besoin}</TableCell>
                                        <TableCell sx={compactCellSx} align="right">{l.solde}</TableCell>
                                        <TableCell sx={compactCellSx} align="right">{l.reserve}</TableCell>
                                        <TableCell sx={compactCellSx} align="right">{l.disponible}</TableCell>
                                        <TableCell sx={compactCellSx} align="right">
                                            {l.manque > 0
                                                ? <Chip size="small" color="error" variant="outlined" label={l.manque} />
                                                : l.manque}
                                        </TableCell>
                                        <TableCell sx={compactCellSx} align="right">{l.a_commander || 0}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <Divider />

                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Clôturer un lot de production</Typography>
                    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                        <TextField
                            size="small"
                            type="number"
                            label="Nb réel de cartes produites"
                            value={boards}
                            onChange={(e) => setBoards(e.target.value)}
                            sx={{ maxWidth: 240 }}
                        />
                        <Button variant="contained" onClick={produce}>Clôturer / Produire</Button>
                        <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                            Poste les sorties de stock (OUT) avec le coefficient de perte.
                        </Typography>
                    </Stack>

                    {runs.length > 0 ? (
                        <Stack spacing={0.5}>
                            <Typography variant="caption" sx={{ color: '#a1a1aa' }}>Lots produits :</Typography>
                            {runs.map((r) => (
                                <Stack key={r.id} direction="row" spacing={1} alignItems="center">
                                    <Chip
                                        size="small"
                                        variant="outlined"
                                        color={r.is_cancelled ? 'default' : 'success'}
                                        label={`#${r.id} — ${r.boards_produced} carte(s)${r.is_cancelled ? ' (annulé)' : ''}`}
                                    />
                                    {!r.is_cancelled ? (
                                        <Button size="small" color="inherit" onClick={() => cancelRun(r.id)}>Annuler</Button>
                                    ) : null}
                                </Stack>
                            ))}
                        </Stack>
                    ) : null}
                </>
            ) : null}
        </Stack>
    );
}

export default ProduceCheckPanel;
