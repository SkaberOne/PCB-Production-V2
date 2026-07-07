import React from 'react';
import apiClient, { extractApiError } from '../../api/client';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    Chip,
    CircularProgress,
    FormControlLabel,
    IconButton,
    InputAdornment,
    MenuItem,
    Stack,
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

// ── Recherche fournisseurs (liens ouverts dans le navigateur, sans quota API) ──
// Le terme recherché est le MPN saisi si présent, sinon value + package.
const SUPPLIER_LINKS = [
    { key: 'mouser', label: 'Mouser', url: (q) => `https://www.mouser.fr/c/?q=${q}` },
    { key: 'digikey', label: 'Digi-Key', url: (q) => `https://www.digikey.fr/en/products/result?keywords=${q}` },
    { key: 'farnell', label: 'Farnell', url: (q) => `https://fr.farnell.com/search?st=${q}` },
    { key: 'octopart', label: 'Octopart', url: (q) => `https://octopart.com/search?q=${q}` },
];

// Détection d'un passif générique (résistance/condensateur/inductance à valeur
// standard) : sert au filtre « masquer passifs génériques ». Heuristique volontairement
// simple, alignée sur la fenêtre de complétion utilisée dans le chat.
function isGenericPassiveValue(value) {
    const t = (value || '').trim();
    if (!t) return false;
    if (/^\d+(\.\d+)?\s*[rkm]\d*$/i.test(t)) return true; // 10K, 4K7, 0R, 100R, 3M32
    if (/^\d+(\.\d+)?\s*(nf|uf|pf|µf|nh|uh|mh)(\s*\/.*)?$/i.test(t)) return true; // 100nF, 10uF/50V
    if (/^\d+(\.\d+)?\s*ohm\b/i.test(t)) return true;
    return false;
}

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

function openSupplierSearch(urlBuilder, term) {
    const q = encodeURIComponent((term || '').trim());
    if (!q) return;
    const url = urlBuilder(q);
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}

// `commandId` (optionnel) restreint l'enrichissement aux composants d'une commande
// (section MPN de l'onglet Commande). Sans prop → toute la bibliothèque (onglet
// Base de données). L'écriture reste globale (Component.mpn) dans les deux cas.
// `onApplied` (optionnel) est appelé après chaque écriture réussie de MPN
// (unitaire ou en lot) : l'onglet Commande s'en sert pour recharger le résumé et
// ré-actualiser les prix des composants concernés.
// `autoLoad` (optionnel) : charge automatiquement la liste (cache) à l'affichage
// du panneau, sans clic sur « Charger (cache) ». Utilisé dans l'onglet Commande.
function MpnEnrichmentPanel({ commandId = null, onApplied = null, autoLoad = false }) {
    const [proposals, setProposals] = React.useState([]);
    const [counts, setCounts] = React.useState({ high: 0, medium: 0, manual: 0 });
    const [rows, setRows] = React.useState({}); // component_id -> { mpn, status, busy }
    const [loading, setLoading] = React.useState(false);
    const [searchingLive, setSearchingLive] = React.useState(false);
    const [batchBusy, setBatchBusy] = React.useState(false);
    const [feedback, setFeedback] = React.useState(null); // { severity, message }
    const [limit, setLimit] = React.useState(DEFAULT_LIMIT);

    // ── Filtres client (comme la fenêtre du chat) ────────────────────────────────
    const [query, setQuery] = React.useState('');
    const [typeFilter, setTypeFilter] = React.useState('');
    const [hideGeneric, setHideGeneric] = React.useState(false);
    const [onlyTodo, setOnlyTodo] = React.useState(false);

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
                params: { live, limit, ...(commandId ? { command_id: commandId } : {}) },
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
    }, [initRows, limit, commandId]);

    // Chargement auto (cache) à l'affichage du panneau et si la commande change.
    React.useEffect(() => {
        if (autoLoad) load(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoLoad, commandId]);

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
                const resp = await apiClient.get(PROPOSALS_URL, { params: { live: false, limit, ...(commandId ? { command_id: commandId } : {}) } });
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
    }, [proposals, limit, initRows, commandId]);

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
            if (onApplied) onApplied([componentId]);
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
            if (onApplied && applied.length) onApplied(applied.map((a) => a.component_id));
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

    // Types présents (pour le filtre) — dérivés des propositions chargées.
    const typeOptions = React.useMemo(() => {
        const set = new Set();
        proposals.forEach((p) => { if (p.component_type) set.add(p.component_type); });
        return Array.from(set).sort();
    }, [proposals]);

    // Application des filtres client (recherche, type, passifs, à valider).
    const visibleProposals = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        return proposals.filter((p) => {
            const row = rows[p.component_id] || {};
            if (q) {
                const hay = `${p.value || ''} ${p.reference || ''} ${p.package || ''} ${p.component_type || ''} ${p.proposed_mpn || ''} ${p.manufacturer || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (typeFilter && p.component_type !== typeFilter) return false;
            if (hideGeneric && p.confidence !== 'high' && isGenericPassiveValue(p.value)) return false;
            if (onlyTodo && (row.status === 'applied' || row.status === 'rejected')) return false;
            return true;
        });
    }, [proposals, rows, query, typeFilter, hideGeneric, onlyTodo]);

    const appliedCount = React.useMemo(
        () => Object.values(rows).filter((r) => r?.status === 'applied').length,
        [rows],
    );

    return (
        <Card sx={{ backgroundColor: '#18181b', border: '1px solid #1f2937' }}>
            <CardContent>
                <Stack spacing={2.5}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <FactCheckRoundedIcon sx={{ color: '#10b981' }} />
                        <Box>
                            <Typography variant="h6">Enrichissement des MPN</Typography>
                            <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                                Complète les MPN manquants de la bibliothèque pour fiabiliser la recherche prix/dispo. Rien n'est écrit sans validation ; un MPN existant n'est jamais écrasé.
                            </Typography>
                        </Box>
                    </Stack>

                    {/* Actions : chargement + recherche en ligne + validation en lot */}
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

                    {/* Filtres client (visibles seulement quand il y a des propositions) */}
                    {proposals.length ? (
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }} flexWrap="wrap" useFlexGap>
                            <TextField
                                size="small"
                                placeholder="Filtrer par value, MPN, boîtier…"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                sx={{ flexGrow: 1, minWidth: 200 }}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchRoundedIcon fontSize="small" sx={{ color: '#71717a' }} />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                            <TextField
                                select
                                size="small"
                                label="Type"
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                                sx={{ minWidth: 150 }}
                            >
                                <MenuItem value="">Tous types</MenuItem>
                                {typeOptions.map((t) => (
                                    <MenuItem key={t} value={t}>{t}</MenuItem>
                                ))}
                            </TextField>
                            <FormControlLabel
                                control={<Checkbox size="small" checked={hideGeneric} onChange={(e) => setHideGeneric(e.target.checked)} />}
                                label={<Typography variant="body2" sx={{ color: '#a1a1aa' }}>masquer passifs génériques</Typography>}
                            />
                            <FormControlLabel
                                control={<Checkbox size="small" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />}
                                label={<Typography variant="body2" sx={{ color: '#a1a1aa' }}>seulement à valider</Typography>}
                            />
                        </Stack>
                    ) : null}

                    {/* Compteurs : affichés / validés + répartition par confiance */}
                    {proposals.length ? (
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip size="small" variant="outlined" label={`Affichés : ${visibleProposals.length}`} sx={{ borderColor: '#3f3f46', color: '#e4e4e7' }} />
                            <Chip size="small" variant="outlined" label={`Validés : ${appliedCount}`} sx={{ borderColor: '#10b981', color: '#10b981' }} />
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
                        <Stack spacing={1.25}>
                            {visibleProposals.map((p) => {
                                const meta = CONFIDENCE_META[p.confidence] || CONFIDENCE_META.manual;
                                const row = rows[p.component_id] || { mpn: '', status: 'pending', busy: false };
                                const applied = row.status === 'applied';
                                const rejected = row.status === 'rejected';
                                const hasCandidates = (p.candidates || []).length > 1;
                                const searchTerm = (row.mpn || '').trim()
                                    || `${p.value || ''}${p.package ? ` ${p.package}` : ''}`;
                                const prefilled = Boolean(p.proposed_mpn);
                                return (
                                    <Box
                                        key={p.component_id}
                                        sx={{
                                            border: '1px solid',
                                            borderColor: applied ? '#10b981' : '#1f2937',
                                            backgroundColor: applied ? '#0e1b16' : '#141417',
                                            borderRadius: 2,
                                            p: 1.5,
                                            opacity: rejected ? 0.5 : 1,
                                        }}
                                    >
                                        {/* En-tête : value + type + package + confiance */}
                                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                                            <Typography sx={{ fontWeight: 600, fontSize: 15 }}>{p.value || '—'}</Typography>
                                            {p.component_type ? (
                                                <Chip size="small" label={p.component_type} sx={{ backgroundColor: '#1c1c1f', color: '#a1a1aa' }} />
                                            ) : null}
                                            {p.package ? (
                                                <Chip size="small" label={p.package} sx={{ backgroundColor: '#1c1c1f', color: '#a1a1aa' }} />
                                            ) : null}
                                            <Tooltip title={meta.help}>
                                                <Chip
                                                    size="small"
                                                    label={prefilled ? `pré-rempli · ${meta.label}` : `à chercher · ${meta.label}`}
                                                    sx={{ backgroundColor: meta.color, color: '#0a0a0a', fontWeight: 600 }}
                                                />
                                            </Tooltip>
                                            <Box sx={{ flexGrow: 1 }} />
                                            <Typography variant="caption" sx={{ color: '#52525b' }}>
                                                {p.reference} · #{p.component_id}
                                            </Typography>
                                        </Stack>

                                        {applied ? (
                                            <Chip size="small" color="success" variant="outlined" label={`Appliqué : ${row.mpn}`} />
                                        ) : (
                                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                                {/* Boutons de recherche fournisseurs (ouvrent le navigateur) */}
                                                {SUPPLIER_LINKS.map((s) => (
                                                    <Button
                                                        key={s.key}
                                                        size="small"
                                                        variant="outlined"
                                                        color="inherit"
                                                        sx={{ minWidth: 0, px: 1, borderColor: '#2b3444', color: '#d4d4d8' }}
                                                        onClick={() => openSupplierSearch(s.url, searchTerm)}
                                                    >
                                                        {s.label}
                                                    </Button>
                                                ))}
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
                                                    placeholder="Saisir / coller un MPN"
                                                    value={row.mpn}
                                                    onChange={(e) => updateRow(p.component_id, { mpn: e.target.value })}
                                                    sx={{ flexGrow: 1, minWidth: 140 }}
                                                />
                                                {p.product_url ? (
                                                    <Tooltip title={`Voir sur ${p.supplier || 'fournisseur'}`}>
                                                        <IconButton size="small" component="a" href={p.product_url} target="_blank" rel="noopener noreferrer">
                                                            <OpenInNewRoundedIcon fontSize="inherit" />
                                                        </IconButton>
                                                    </Tooltip>
                                                ) : null}
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    onClick={() => applyOne(p.component_id)}
                                                    disabled={row.busy || !row.mpn?.trim()}
                                                >
                                                    {row.busy ? '...' : 'Valider'}
                                                </Button>
                                                <Button
                                                    size="small"
                                                    variant="text"
                                                    color="inherit"
                                                    onClick={() => updateRow(p.component_id, { status: rejected ? 'pending' : 'rejected' })}
                                                >
                                                    {rejected ? 'Rétablir' : 'Ignorer'}
                                                </Button>
                                            </Stack>
                                        )}
                                    </Box>
                                );
                            })}
                            {visibleProposals.length === 0 ? (
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                    Aucun composant ne correspond aux filtres.
                                </Typography>
                            ) : null}
                        </Stack>
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
