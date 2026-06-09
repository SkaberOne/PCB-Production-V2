import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Grid,
    MenuItem,
    Snackbar,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import CalculateRoundedIcon from '@mui/icons-material/CalculateRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import apiClient, { extractApiError } from '../api/client';
import PageHeader from '../components/common/PageHeader';
import CostParametersForm from '../components/costing/CostParametersForm';
import ProductionInputsForm from '../components/costing/ProductionInputsForm';
import CardCostBreakdown from '../components/costing/CardCostBreakdown';
import CardPriceHistory from '../components/costing/CardPriceHistory';
import { colors } from '../theme';
import { eur, eur0, pct, shortDate } from '../utils/costingFormat';

const CARD_SX = { backgroundColor: colors.surfaceCard, border: `1px solid ${colors.border}` };
const PARAM_KEYS = [
    'labor_rate', 'vat_pct', 'solder_paste_per_board', 'defect_rate_pct',
    'repair_time_h', 'test_time_h', 'prep_time_bom_h', 'prep_time_top_h', 'prep_time_bot_h',
];
const INPUT_NUM_KEYS = [
    'quantity_produced', 'pcb_total_price', 'stencil_cost',
    'assembly_time_top_h', 'assembly_time_bot_h', 'tht_time_h',
];

const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

function MetricCard({ label, value, sub, accent }) {
    return (
        <Card sx={{ ...CARD_SX, ...(accent ? { borderColor: colors.green } : {}) }}>
            <CardContent>
                <Typography variant="caption" sx={{ color: colors.textSecondary }}>{label}</Typography>
                <Typography variant="h5" sx={{ mt: 0.5, color: accent ? colors.green : colors.textPrimary }}>
                    {value}
                </Typography>
                {sub && <Typography variant="caption" sx={{ color: colors.textSecondary }}>{sub}</Typography>}
            </CardContent>
        </Card>
    );
}

/**
 * « Prix carte à la production » — costing tab. Production selector + two sub-tabs:
 * coût de la production (lot) and coût unitaire / carte (référence + historique).
 * Backed by /api/costing/*. See ADR 0005 / audit 2026-06-09.
 */
function CostingPage() {
    const [productions, setProductions] = useState([]);
    const [productionId, setProductionId] = useState('');
    const [params, setParams] = useState(null);
    const [inputs, setInputs] = useState(null);
    const [result, setResult] = useState(null);
    const [tab, setTab] = useState(0);
    const [cardRefId, setCardRefId] = useState('');
    const [history, setHistory] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState('');

    useEffect(() => {
        apiClient.get('/marketplace/productions')
            .then((res) => {
                const items = res.data?.items || [];
                setProductions(items);
                if (items.length) setProductionId(items[0].id);
            })
            .catch(() => setError('Impossible de charger les productions.'));
        apiClient.get('/costing/parameters')
            .then((res) => setParams(res.data))
            .catch(() => setError('Impossible de charger les paramètres.'));
    }, []);

    const loadProduction = useCallback(async (pid) => {
        if (!pid) return;
        setBusy(true);
        setError(null);
        try {
            const [inp, comp] = await Promise.all([
                apiClient.get(`/costing/productions/${pid}/inputs`),
                apiClient.get(`/costing/productions/${pid}`),
            ]);
            setInputs(inp.data);
            setResult(comp.data);
            const cards = comp.data?.cards || [];
            setCardRefId((prev) => (cards.some((c) => c.bom_reference_id === prev) ? prev : (cards[0]?.bom_reference_id ?? '')));
        } catch (e) {
            const detail = extractApiError(e);
            setError(
                detail
                    ? `Impossible de calculer le coût de cette production — ${detail}`
                    : 'Impossible de calculer le coût de cette production.',
            );
            setResult(null);
        } finally {
            setBusy(false);
        }
    }, []);

    useEffect(() => { loadProduction(productionId); }, [productionId, loadProduction]);

    useEffect(() => {
        if (tab !== 1 || !cardRefId) return;
        apiClient.get(`/costing/cards/${cardRefId}/history`)
            .then((res) => setHistory(res.data))
            .catch(() => setHistory(null));
    }, [tab, cardRefId, result]);

    const apply = async () => {
        if (!productionId) return;
        setBusy(true);
        setError(null);
        try {
            const paramPayload = {};
            PARAM_KEYS.forEach((k) => { paramPayload[k] = toNum(params[k]); });
            const inputPayload = { amortize_stencil: Boolean(inputs.amortize_stencil) };
            INPUT_NUM_KEYS.forEach((k) => { inputPayload[k] = toNum(inputs[k]); });
            await apiClient.put('/costing/parameters', paramPayload);
            await apiClient.put(`/costing/productions/${productionId}/inputs`, inputPayload);
            await loadProduction(productionId);
            setToast('Chiffrage recalculé.');
        } catch (e) {
            setError("Échec de l'application des modifications.");
        } finally {
            setBusy(false);
        }
    };

    const snapshot = async () => {
        if (!productionId) return;
        setBusy(true);
        try {
            await apiClient.post(`/costing/productions/${productionId}/snapshot`);
            setToast('Chiffrage enregistré comme nouveau prix de référence.');
            if (cardRefId) {
                const res = await apiClient.get(`/costing/cards/${cardRefId}/history`);
                setHistory(res.data);
            }
        } catch (e) {
            setError("Échec de l'enregistrement de la référence.");
        } finally {
            setBusy(false);
        }
    };

    const cards = result?.cards || [];
    const selectedCard = useMemo(
        () => cards.find((c) => c.bom_reference_id === cardRefId) || null,
        [cards, cardRefId],
    );
    const refPrice = history?.reference_price || null;
    const ecart = (selectedCard && refPrice)
        ? selectedCard.unit_cost_ht - refPrice.unit_cost_ht
        : null;

    return (
        <Box>
            <PageHeader
                title="Prix carte à la production"
                description="Coût de revient (HT/TTC) d'une carte produite et prix de référence par carte."
            />

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
                <TextField
                    select size="small" label="Production" value={productionId}
                    onChange={(e) => setProductionId(e.target.value)} sx={{ minWidth: 260 }}
                    disabled={!productions.length}
                >
                    {productions.map((p) => (
                        <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                    ))}
                </TextField>
                <Box sx={{ flex: 1 }} />
                <Button startIcon={<RefreshRoundedIcon />} onClick={apply} disabled={busy || !inputs}>
                    Appliquer / recalculer
                </Button>
                <Button
                    variant="contained" startIcon={<SaveRoundedIcon />} onClick={snapshot}
                    disabled={busy || !result}
                >
                    Enregistrer la référence
                </Button>
            </Box>

            {!productions.length && !error && (
                <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                    Aucune production. Créez-en une depuis l'onglet Productions.
                </Typography>
            )}

            {params && inputs && (
                <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={12} md={6}>
                        <CostParametersForm
                            values={params} disabled={busy}
                            onChange={(k, v) => setParams((prev) => ({ ...prev, [k]: v }))}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <ProductionInputsForm
                            values={inputs} disabled={busy}
                            onChange={(k, v) => setInputs((prev) => ({ ...prev, [k]: v }))}
                        />
                    </Grid>
                </Grid>
            )}

            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: `1px solid ${colors.border}` }}>
                <Tab icon={<CalculateRoundedIcon fontSize="small" />} iconPosition="start" label="Coût de la production" />
                <Tab label="Coût unitaire / carte" />
            </Tabs>

            {tab === 0 && result && (
                <Box>
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        <Grid item xs={6} sm={3}>
                            <MetricCard label="Coût total production HT" value={eur0(result.total_ht)} accent />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <MetricCard label="Coût total TTC" value={eur0(result.total_ttc)} />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <MetricCard label="Cartes du lot" value={cards.length} />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <MetricCard
                                label="Coût unitaire HT"
                                value={cards.length === 1 ? eur(cards[0].unit_cost_ht) : '—'}
                                sub={cards.length > 1 ? 'plusieurs cartes' : ''}
                            />
                        </Grid>
                    </Grid>
                    {cards.map((card) => {
                        const mat = card.material?.subtotal || 0;
                        const lab = card.labor?.subtotal || 0;
                        const unit = card.unit_cost_ht || (mat + lab) || 1;
                        return (
                            <Card key={card.bom_reference_id} sx={{ ...CARD_SX, mb: 1.5 }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                                        <Typography variant="subtitle1">{card.reference}</Typography>
                                        <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                                            {card.quantity} cartes · {eur(card.unit_cost_ht)} /carte · {eur0(card.total_ht)} HT
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', height: 8, borderRadius: 1, overflow: 'hidden', mt: 1 }}>
                                        <Box sx={{ width: `${(mat / unit) * 100}%`, backgroundColor: colors.green }} />
                                        <Box sx={{ width: `${(lab / unit) * 100}%`, backgroundColor: colors.purple }} />
                                    </Box>
                                    <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                                        <Box component="span" sx={{ color: colors.green }}>Matière {pct(mat / unit)}</Box>
                                        {' · '}
                                        <Box component="span" sx={{ color: colors.purple }}>Main d'œuvre {pct(lab / unit)}</Box>
                                    </Typography>
                                </CardContent>
                            </Card>
                        );
                    })}
                </Box>
            )}

            {tab === 1 && result && (
                <Box>
                    <TextField
                        select size="small" label="Carte" value={cardRefId}
                        onChange={(e) => setCardRefId(e.target.value)} sx={{ minWidth: 260, mb: 2 }}
                    >
                        {cards.map((c) => (
                            <MenuItem key={c.bom_reference_id} value={c.bom_reference_id}>{c.reference}</MenuItem>
                        ))}
                    </TextField>

                    {selectedCard && (
                        <>
                            <Grid container spacing={2} sx={{ mb: 2 }}>
                                <Grid item xs={12} sm={4}>
                                    <MetricCard
                                        label="Prix de référence (dernière prod.)"
                                        value={refPrice ? eur(refPrice.unit_cost_ht) : '—'}
                                        sub={refPrice ? `${refPrice.quantity} cartes · ${shortDate(refPrice.computed_at)}` : 'aucune référence'}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <MetricCard label="Estimé à l'unité (cette prod.)" value={eur(selectedCard.unit_cost_ht)} sub={`${eur(selectedCard.unit_cost_ttc)} TTC`} accent />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <MetricCard
                                        label="Écart vs référence"
                                        value={ecart === null ? '—' : `${ecart >= 0 ? '+' : '−'}${eur(Math.abs(ecart))}`}
                                    />
                                </Grid>
                            </Grid>
                            <Box sx={{ mb: 2 }}>
                                <CardCostBreakdown card={selectedCard} />
                            </Box>
                            <CardPriceHistory history={history?.history} />
                        </>
                    )}
                </Box>
            )}

            <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast('')} message={toast} />
        </Box>
    );
}

export default CostingPage;
