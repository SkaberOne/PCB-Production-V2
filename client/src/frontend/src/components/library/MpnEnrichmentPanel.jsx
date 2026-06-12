import React from 'react';
import apiClient, { extractApiError } from '../../api/client';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
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

// Endpoints live under apiClient's base (which already includes /api).
const PROPOSALS_URL = '/marketplace/supplier-offers/mpn-proposals';
const APPLY_URL = '/marketplace/supplier-offers/mpn-apply';
const APPLY_BATCH_URL = '/marketplace/supplier-offers/mpn-apply-batch';

const CONFIDENCE_META = {
    high: { label: 'Exact', color: '#10b981', help: 'La value correspond exactement à une référence fournisseur.' },
    medium: { label: 'Probable', color: '#f59e0b', help: 'Candidats issus de la recherche value + package — à valider.' },
    manual: { label: 'Manuel', color: '#71717a', help: 'Aucune correspondance fiable : saisie manuelle.' },
};

const DEFAULT_LIMIT = 25;
// Live search is processed in small sub-batches so each HTTP call stays well under
// the axios timeout and supplier quotas are spread out (see the 30s timeout in
// api/client.js). The whole lot is split into chunks of LIVE_CHUNK component ids.
const LIVE_CHUNK = 25;
const LIVE_PAUSE_MS = 1200; // brief pause between chunks to ease Mouser's ~30/min quota
const LIVE_TIMEOUT_MS = 120000; // per-chunk timeout override (a chunk can still be slow)

function computeCounts(items) {
    return (items || []).reduce(
        (acc, p) => {
            acc[p.confidence] = (acc[p.confidence] || 0) + 1;
            return acc;
        },
        { high: 0, medium: 0, manual: 0 },
    );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function MpnEnrichmentPanel() {
    const [proposals, setProposals] = React.useState([]);
    const [counts, setCounts] = React.useState({ high: 0, medium: 0, manual: 0 });
    const [rows, setRows] = React.useState({}); // component_id -> { mpn, status, busy }
    const [loading, setLoading] = React.useState(false);
    const [searchingLive, setSearchingLive] = React.useState(false);
    const [batchBusy, setBatchBusy] = React.useState(false);
    const [feedback, setFeedback] = React.useState(null); // { severity, message }
    const [limit, setLimit] = React.useState(DEFAULT_LIMIT);

    const initRows = React.useCallback((items) => {
        const next = {};
        items.forEach((item) => {
            next[item.component_id] = {
                mpn: item.proposed_mpn || '',
                status: 'pending',
                busy: false,
            };
        });
        setRows(next);
    }, []);

    const load = React.useCallback(async (live) => {
        const setBusy = live ? setSearchingLive : setLoading;
        setBusy(true);
        setFeedback(null);
        try {
            const response = await apiClient.get(PROPOSALS_URL, {
                params: { live, limit },
            });
            const data = response.data || {};
            const items = data.proposals || [];
            setProposals(items);
            setCounts(data.counts || { high: 0, medium: 0, manual: 0 });
            initRows(items);
            if (live) {
                setFeedback({
                    severity: 'success',
                    message: `Recherche en ligne terminée : ${data.counts?.high || 0} exact(s), ${data.counts?.medium || 0} probable(s) sur ${items.length} composant(s).`,
                });
            }
        } catch (error) {
            setFeedback({
                severity: 'error',
                message: error?.response?.data?.detail || 'Échec du chargement des propositions MPN.',
            });
        } finally {
            setBusy(false);
        }
    }, [initRows, limit]);

    // Live search: process the loaded components in sub-batches so each request
    // stays under the HTTP timeout and supplier quotas are spread out. Results are
    // merged into the table incrementally with visible progress.
    const runLiveSearch = React.useCallback(async () => {
        setSearchingLive(true);
        setFeedback(null);
        try {
            // Base list of components to enrich (ids). Reuse what's already loaded
            // from "Charger (cache)"; otherwise fetch the cache list first.
            let baseItems = proposals;
            if (!baseItems.length) {
                const resp = await apiClient.get(PROPOSALS_URL, { params: { live: false, limit } });
                baseItems = resp.data?.proposals || [];
                setProposals(baseItems);
                setCounts(resp.data?.counts || { high: 0, medium: 0, manual: 0 });
                initRows(baseItems);
            }
            const ids = baseItems.map((p) => p.component_id);
            if (!ids.length) {
                setFeedback({ severity: 'info', message: 'Aucun composant à enrichir (MPN déjà renseignés).' });
                return;
            }

            const byId = new Map(baseItems.map((p) => [p.component_id, p]));
            const chunks = [];
            for (let i = 0; i < ids.length; i += LIVE_CHUNK) chunks.push(ids.slice(i, i + LIVE_CHUNK));

            let processed = 0;
            for (let ci = 0; ci < chunks.length; ci += 1) {
                const chunk = chunks[ci];
                setFeedback({
                    severity: 'info',
                    message: `Recherche en ligne… lot ${ci + 1}/${chunks.length} (${processed}/${ids.length} composants)`,
                });
                const resp = await apiClient.get(PROPOSALS_URL, {
                    params: { live: true, component_ids: chunk.join(','), limit: chunk.length },
                    timeout: LIVE_TIMEOUT_MS,
                });
                (resp.data?.proposals || []).forEach((p) => byId.set(p.component_id, p));
                processed += chunk.length;

                const merged = baseItems.map((p) => byId.get(p.component_id) || p);
                setProposals(merged);
                setCounts(computeCounts(merged));
                // Prefill the MPN input for freshly proposed rows the user hasn't touched.
                setRows((prev) => {
                    const next = { ...prev };
                    (resp.data?.proposals || []).forEach((p) => {
                        const existing = next[p.component_id] || { status: 'pending', busy: false, mpn: '' };
                        if (existing.status === 'pending' && !existing.mpn && p.proposed_mpn) {
                            next[p.component_id] = { ...existing, mpn: p.proposed_mpn };
                        }
                    });
                    return next;
                });

                if (ci < chunks.length - 1) await sleep(LIVE_PAUSE_MS);
            }

            const finalCounts = computeCounts(baseItems.map((p) => byId.get(p.component_id) || p));
            setFeedback({
                severity: 'success',
                message: `Recherche en ligne terminée : ${finalCounts.high} exact(s), ${finalCounts.medium} probable(s) sur ${ids.length} composant(s).`,
            });
        } catch (error) {
            setFeedback({
                severity: 'error',
                message: extractApiError(error) || error?.response?.data?.detail || 'Échec de la recherche en ligne.',
            });
        } finally {
            setSearchingLive(false);
        }
    }, [proposals, limit, initRows]);

    const updateRow = (componentId, patch) => {
        setRows((prev) => ({ ...prev, [componentId]: { ...prev[componentId], ...patch } }));
    };

    const applyOne = async (componentId) => {
        const row = rows[componentId];
        const mpn = (row?.mpn || '').trim();
        if (!mpn) {
            updateRow(componentId, { status: 'pending' });
            setFeedback({ severity: 'warning', message: 'Saisir un MPN avant de valider.' });
            return;
        }
        updateRow(componentId, { busy: true });
        try {
            await apiClient.post(APPLY_URL, { component_id: componentId, mpn });
            updateRow(componentId, { busy: false, status: 'applied' });
        } catch (error) {
            updateRow(componentId, { busy: false });
            setFeedback({
                severity: 'error',
                message: error?.response?.data?.detail || `Échec de l'écriture du MPN (composant ${componentId}).`,
            });
        }
    };

    const applyAllHigh = async () => {
        const items = proposals
            .filter((p) => p.confidence === 'high')
            .map((p) => ({ component_id: p.component_id, mpn: (rows[p.component_id]?.mpn || p.proposed_mpn || '').trim() }))
            .filter((item) => item.mpn && rows[item.component_id]?.status === 'pending');
        if (!items.length) {
            setFeedback({ severity: 'info', message: 'Aucune proposition « Exact » en attente.' });
            return;
        }
        setBatchBusy(true);
        try {
            const response = await apiClient.post(APPLY_BATCH_URL, { items });
            const applied = response.data?.applied || [];
            setRows((prev) => {
                const next = { ...prev };
                applied.forEach((a) => {
                    if (next[a.component_id]) next[a.component_id] = { ...next[a.component_id], status: 'applied' };
                });
                return next;
            });
            setFeedback({
                severity: 'success',
                message: `${applied.length} MPN exact(s) appliqué(s)${response.data?.skipped?.length ? `, ${response.data.skipped.length} ignoré(s).` : '.'}`,
            });
        } catch (error) {
            setFeedback({
                severity: 'error',
                message: error?.response?.data?.detail || "Échec de l'application en lot.",
            });
        } finally {
            setBatchBusy(false);
        }
    };

    const pendingHigh = proposals.filter(
        (p) => p.confidence === 'high' && rows[p.component_id]?.status === 'pending',
    ).length;

    return (
        <Card sx={{ backgroundColor: '#18181b', border: '1px solid #1f2937' }}>
            <CardContent>
                <Stack spacing={2.5}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
                        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexGrow: 1 }}>
                            <FactCheckRoundedIcon sx={{ color: '#10b981' }} />
                            <Box>
                                <Typography variant="h6">Enrichissement des MPN</Typography>
                                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                                    Complète les MPN manquants de la bibliothèque pour fiabiliser la recherche prix/dispo. Rien n'est écrit sans validation ; un MPN existant n'est jamais écrasé.
                                </Typography>
                            </Box>
                        </Stack>
                    </Stack>

                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
                        <Button variant="outlined" onClick={() => load(false)} disabled={loading || searchingLive}>
                            {loading ? 'Chargement...' : 'Charger (cache)'}
                        </Button>
                        <TextField
                            label="Lot"
                            type="number"
                            size="small"
                            value={limit}
                            onChange={(e) => setLimit(Math.max(1, Math.min(200, Number(e.target.value) || DEFAULT_LIMIT)))}
                            sx={{ width: 96 }}
                            inputProps={{ min: 1, max: 200 }}
                        />
                        <Tooltip title="Interroge les API fournisseurs (quota limité — par lots).">
                            <span>
                                <Button
                                    variant="contained"
                                    color="success"
                                    startIcon={searchingLive ? <CircularProgress size={16} color="inherit" /> : <TravelExploreRoundedIcon />}
                                    onClick={runLiveSearch}
                                    disabled={loading || searchingLive}
                                >
                                    {searchingLive ? 'Recherche...' : 'Rechercher en ligne'}
                                </Button>
                            </span>
                        </Tooltip>
                        <Box sx={{ flexGrow: 1 }} />
                        <Button variant="contained" onClick={applyAllHigh} disabled={batchBusy || !pendingHigh}>
                            {batchBusy ? 'Application...' : `Tout valider « Exact » (${pendingHigh})`}
                        </Button>
                    </Stack>

                    {proposals.length ? (
                        <Stack direction="row" spacing={1}>
                            {['high', 'medium', 'manual'].map((tier) => (
                                <Chip
                                    key={tier}
                                    size="small"
                                    variant="outlined"
                                    label={`${CONFIDENCE_META[tier].label} : ${counts[tier] || 0}`}
                                    sx={{ borderColor: CONFIDENCE_META[tier].color, color: CONFIDENCE_META[tier].color }}
                                />
                            ))}
                        </Stack>
                    ) : null}

                    {feedback ? (
                        <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>
                            {feedback.message}
                        </Alert>
                    ) : null}

                    {proposals.length ? (
                        <TableContainer sx={{ maxHeight: 460, overflowY: 'auto' }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ width: '6%' }}>Conf.</TableCell>
                                        <TableCell sx={{ width: '14%' }}>Référence</TableCell>
                                        <TableCell sx={{ width: '12%' }}>Value</TableCell>
                                        <TableCell sx={{ width: '10%' }}>Package</TableCell>
                                        <TableCell sx={{ width: '30%' }}>MPN proposé</TableCell>
                                        <TableCell sx={{ width: '14%' }}>Fournisseur</TableCell>
                                        <TableCell sx={{ width: '14%' }}>Action</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {proposals.map((p) => {
                                        const meta = CONFIDENCE_META[p.confidence] || CONFIDENCE_META.manual;
                                        const row = rows[p.component_id] || { mpn: '', status: 'pending', busy: false };
                                        const applied = row.status === 'applied';
                                        const rejected = row.status === 'rejected';
                                        const hasCandidates = (p.candidates || []).length > 1;
                                        return (
                                            <TableRow key={p.component_id} sx={{ opacity: applied || rejected ? 0.5 : 1 }}>
                                                <TableCell>
                                                    <Tooltip title={meta.help}>
                                                        <Chip size="small" label={meta.label} sx={{ backgroundColor: meta.color, color: '#0a0a0a', fontWeight: 600 }} />
                                                    </Tooltip>
                                                </TableCell>
                                                <TableCell>{p.reference}</TableCell>
                                                <TableCell>{p.value}</TableCell>
                                                <TableCell>{p.package || '—'}</TableCell>
                                                <TableCell>
                                                    {applied ? (
                                                        <Chip size="small" color="success" variant="outlined" label={`Appliqué : ${row.mpn}`} />
                                                    ) : (
                                                        <Stack direction="row" spacing={1} alignItems="center">
                                                            {hasCandidates ? (
                                                                <TextField
                                                                    select
                                                                    size="small"
                                                                    value=""
                                                                    onChange={(e) => updateRow(p.component_id, { mpn: e.target.value })}
                                                                    sx={{ width: 56 }}
                                                                    SelectProps={{ displayEmpty: true, renderValue: () => '⋮' }}
                                                                >
                                                                    {(p.candidates || []).map((c) => (
                                                                        <MenuItem key={c.mpn} value={c.mpn}>
                                                                            {c.mpn} — {c.manufacturer || '?'}{(c.stock_qty || 0) > 0 ? ' ✓' : ''}
                                                                        </MenuItem>
                                                                    ))}
                                                                </TextField>
                                                            ) : null}
                                                            <TextField
                                                                size="small"
                                                                fullWidth
                                                                placeholder="Saisir / coller un MPN"
                                                                value={row.mpn}
                                                                onChange={(e) => updateRow(p.component_id, { mpn: e.target.value })}
                                                            />
                                                        </Stack>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Stack direction="row" spacing={0.5} alignItems="center">
                                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                            {p.supplier || '—'}
                                                        </Typography>
                                                        {p.product_url ? (
                                                            <IconButton size="small" component="a" href={p.product_url} target="_blank" rel="noopener noreferrer">
                                                                <OpenInNewRoundedIcon fontSize="inherit" />
                                                            </IconButton>
                                                        ) : null}
                                                    </Stack>
                                                </TableCell>
                                                <TableCell>
                                                    {applied || rejected ? (
                                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                            {applied ? 'Validé' : 'Ignoré'}
                                                        </Typography>
                                                    ) : (
                                                        <Stack direction="row" spacing={0.5}>
                                                            <Button size="small" variant="contained" onClick={() => applyOne(p.component_id)} disabled={row.busy || !row.mpn?.trim()}>
                                                                {row.busy ? '...' : 'Valider'}
                                                            </Button>
                                                            <Button size="small" variant="text" color="inherit" onClick={() => updateRow(p.component_id, { status: 'rejected' })}>
                                                                Ignorer
                                                            </Button>
                                                        </Stack>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    ) : (
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            Clique sur « Charger (cache) » pour lister les composants au MPN vide, puis « Rechercher en ligne » pour interroger les fournisseurs par lot.
                        </Typography>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
}

export default MpnEnrichmentPanel;
