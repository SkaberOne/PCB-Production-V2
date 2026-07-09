import React from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    IconButton,
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
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import apiClient from '../../api/client';
import BomStockDialog from '../bom/BomStockDialog';
import LifecycleBadge from '../common/LifecycleBadge';
import useEventStream from '../../hooks/useEventStream';
import { buildStockSummary } from '../../utils/bomPlanning';
import { compactCellSx, compactTableContainerSx, compactTableSx } from '../../utils/compactTable';

/**
 * « Puis-je produire ? » (ADR 0011). Deux modes :
 *  - autonome (onglet Stock) : menu déroulant de productions + clôture de lot.
 *  - embarqué (Revue BOM) : `productionId` fixé → anticipation seule (pas de clôture).
 *
 * L'analyse s'appuie sur l'INVENTAIRE RÉEL (`ComponentStock`) moins le réservé — à ne
 * pas confondre avec l'estimation de revue (bobine/sachet/tube) de « Composants et stock ».
 */
function ProduceCheckPanel({ productionId = null, productionMachineId = null }) {
    const embedded = productionId != null;

    const [productions, setProductions] = React.useState([]);
    const [selectedId, setSelectedId] = React.useState(embedded ? String(productionId) : '');
    const [report, setReport] = React.useState(null);
    const [runs, setRuns] = React.useState([]);
    const [boards, setBoards] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [feedback, setFeedback] = React.useState(null);

    // Saisie du stock physique en cliquant une ligne (déclaration réelle, set-to).
    const [declareRow, setDeclareRow] = React.useState(null);
    const [draft, setDraft] = React.useState({});

    const machineIdFor = React.useCallback((id) => {
        if (embedded) return productionMachineId || 0;
        const p = productions.find((x) => String(x.id) === String(id));
        return (p && p.machine_id) || 0;
    }, [embedded, productionMachineId, productions]);

    const loadReport = React.useCallback(async (id, silent = false) => {
        if (!id) return;
        if (!silent) setLoading(true);
        setError(null);
        try {
            const machineId = machineIdFor(id);
            const [rep, runsRes] = await Promise.all([
                apiClient.get(`/marketplace/stock/can-produce/${id}`),
                apiClient.get(`/marketplace/machines/${machineId}/productions/${id}/runs`),
            ]);
            setReport(rep.data);
            setRuns(Array.isArray(runsRes.data) ? runsRes.data : []);
            if (!silent) setBoards(String(rep.data?.board_count ?? ''));
        } catch (err) {
            if (!silent) setError(err?.response?.data?.detail || 'Impossible de charger l’analyse.');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [machineIdFor]);

    // Temps réel (ADR 0013 phase 4) : recharge silencieusement le rapport de dispo
    // quand un autre poste modifie le stock (déclaration, vérif, correction…).
    const currentReportId = embedded ? productionId : selectedId;
    useEventStream('stock', React.useCallback(() => {
        if (currentReportId) loadReport(currentReportId, true);
    }, [currentReportId, loadReport]));

    React.useEffect(() => {
        if (embedded) {
            loadReport(productionId);
            return;
        }
        (async () => {
            try {
                const res = await apiClient.get('/marketplace/productions');
                setProductions(res.data?.items || []);
            } catch (err) {
                setError(err?.response?.data?.detail || 'Impossible de charger les productions.');
            }
        })();
    }, [embedded, productionId, loadReport]);

    const onSelect = (event) => {
        const id = event.target.value;
        setSelectedId(id);
        setReport(null);
        setRuns([]);
        loadReport(id);
    };

    const produce = async () => {
        if (!selectedId) return;
        try {
            await apiClient.post(
                `/marketplace/machines/${machineIdFor(selectedId)}/productions/${selectedId}/produce`,
                { boards_produced: Number(boards) || 0 },
            );
            setFeedback('Production clôturée : mouvements de sortie enregistrés.');
            await loadReport(selectedId);
        } catch (err) {
            setError(err?.response?.data?.detail || 'Échec de la clôture de production.');
        }
    };

    const cancelRun = async (runId) => {
        try {
            await apiClient.post(`/marketplace/machines/${machineIdFor(selectedId)}/productions/${selectedId}/runs/${runId}/cancel`);
            setFeedback('Lot annulé : sorties contre-passées.');
            await loadReport(selectedId);
        } catch (err) {
            setError(err?.response?.data?.detail || 'Échec de l’annulation du lot.');
        }
    };

    // ---- Saisie du stock physique (déclaration réelle) via BomStockDialog ----
    const openDeclare = (line) => {
        setDeclareRow(line);
        setDraft({
            reel_manual_override_qty: line.qty_reel > 0 ? String(line.qty_reel) : '',
            bag_qty: line.qty_bag > 0 ? String(line.qty_bag) : '',
            tube_qty: line.qty_tube > 0 ? String(line.qty_tube) : '',
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

    const declareLine = React.useMemo(() => {
        if (!declareRow) return null;
        const base = { requiredQuantity: 0, componentTapeWidthMm: null, componentPitchMm: null, manualPlacementBase: false };
        const summary = buildStockSummary(base, draft);
        return {
            key: String(declareRow.component_id),
            value: declareRow.value || '',
            footprint: declareRow.footprint || '',
            type: '',
            componentLibraryName: declareRow.mpn || declareRow.value || 'Composant',
            componentPitchMm: null,
            requiredQuantity: 0,
            draft,
            ...summary,
        };
    }, [declareRow, draft]);

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
            setFeedback('Stock déclaré : inventaire mis à jour.');
            if (selectedId) await loadReport(selectedId);
        } catch (err) {
            setError(err?.response?.data?.detail || 'Échec de la déclaration de stock.');
        }
    };

    // ---- Vérification de la quantité stock (ADR 0013 phase 1, version A) ----
    // Confirme en un clic la quantité déjà connue, sans re-saisir. N'affecte pas le solde.
    const toggleVerify = async (line) => {
        const makeVerified = !line.verified_at;
        try {
            const res = makeVerified
                ? await apiClient.post(`/marketplace/stock/${line.component_id}/verify`)
                : await apiClient.delete(`/marketplace/stock/${line.component_id}/verify`);
            const { verified_at = null, verified_qty = null } = res.data || {};
            setReport((prev) => (prev ? {
                ...prev,
                lines: prev.lines.map((l) => (
                    l.component_id === line.component_id ? { ...l, verified_at, verified_qty } : l
                )),
            } : prev));
        } catch (err) {
            setError(err?.response?.data?.detail || 'Échec de la vérification du stock.');
        }
    };

    const notVerifiedCount = report ? report.lines.filter((l) => !l.verified_at).length : 0;

    const verifyAll = async () => {
        if (!report) return;
        const ids = report.lines.filter((l) => !l.verified_at).map((l) => l.component_id);
        if (!ids.length) {
            setFeedback('Toutes les lignes sont déjà vérifiées.');
            return;
        }
        try {
            await apiClient.post('/marketplace/stock/verify-batch', { component_ids: ids });
            setFeedback(`${ids.length} ligne(s) marquée(s) comme vérifiée(s).`);
            await loadReport(embedded ? productionId : selectedId);
        } catch (err) {
            setError(err?.response?.data?.detail || 'Échec de la validation en lot.');
        }
    };

    return (
        <Stack spacing={2}>
            {error ? <Alert severity="error" onClose={() => setError(null)}>{error}</Alert> : null}
            {feedback ? <Alert severity="success" onClose={() => setFeedback(null)}>{feedback}</Alert> : null}

            {embedded ? (
                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                    Besoin comparé à l’<strong>inventaire réel</strong> des composants
                    (− réservé par les autres productions). Clique sur une ligne pour saisir le
                    stock physique du composant.
                </Typography>
            ) : (
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
            )}

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

                    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                            Confirme la quantité stock déjà connue sans la re-saisir (validation physique).
                        </Typography>
                        <Box sx={{ flexGrow: 1 }} />
                        <Button size="small" variant="outlined" color="success" onClick={verifyAll} disabled={!notVerifiedCount}>
                            Tout valider ({notVerifiedCount})
                        </Button>
                    </Stack>

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
                                    <TableCell sx={compactCellSx} align="right">Engagé</TableCell>
                                    <TableCell sx={compactCellSx} align="right">Dispo</TableCell>
                                    <TableCell sx={compactCellSx} align="right">Manque</TableCell>
                                    <TableCell sx={compactCellSx} align="right">À commander</TableCell>
                                    <TableCell sx={compactCellSx} align="center">Vérifié</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {report.lines.map((l) => (
                                    <TableRow key={l.component_id} hover onClick={() => openDeclare(l)} sx={{ cursor: 'pointer' }}>
                                        <TableCell sx={compactCellSx}>{l.value || '-'}<LifecycleBadge status={l.lifecycle_status} checkedAt={l.lifecycle_checked_at} /></TableCell>
                                        <TableCell sx={compactCellSx}>{l.mpn || '-'}</TableCell>
                                        <TableCell sx={compactCellSx}>{l.footprint || '-'}</TableCell>
                                        <TableCell sx={compactCellSx} align="right">{l.besoin}</TableCell>
                                        <TableCell sx={compactCellSx} align="right">{l.solde}</TableCell>
                                        <TableCell sx={compactCellSx} align="right">{l.reserve}</TableCell>
                                        <TableCell sx={compactCellSx} align="right">{l.engage ?? 0}</TableCell>
                                        <TableCell sx={compactCellSx} align="right">{l.disponible}</TableCell>
                                        <TableCell sx={compactCellSx} align="right">
                                            {l.manque > 0
                                                ? <Chip size="small" color="error" variant="outlined" label={l.manque} />
                                                : l.manque}
                                        </TableCell>
                                        <TableCell sx={compactCellSx} align="right">{l.a_commander || 0}</TableCell>
                                        <TableCell sx={compactCellSx} align="center" onClick={(e) => e.stopPropagation()}>
                                            <Tooltip title={l.verified_at
                                                ? `Vérifié le ${new Date(l.verified_at).toLocaleString()} (qté ${l.verified_qty ?? l.solde}) — cliquer pour annuler`
                                                : 'Marquer la quantité comme vérifiée'}>
                                                <IconButton
                                                    size="small"
                                                    sx={{ p: 0.25, color: l.verified_at ? '#10b981' : '#52525b' }}
                                                    onClick={(e) => { e.stopPropagation(); toggleVerify(l); }}
                                                >
                                                    {l.verified_at
                                                        ? <CheckCircleRoundedIcon fontSize="small" />
                                                        : <RadioButtonUncheckedRoundedIcon fontSize="small" />}
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    {!embedded ? (
                        <>
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
                </>
            ) : null}

            <BomStockDialog
                line={declareLine}
                open={Boolean(declareRow)}
                onClose={() => setDeclareRow(null)}
                onStockDraftChange={handleStockDraftChange}
                onPitchBlur={noop}
                onSave={saveDeclaration}
                saveLabel="Déclarer le stock"
            />
        </Stack>
    );
}

export default ProduceCheckPanel;
