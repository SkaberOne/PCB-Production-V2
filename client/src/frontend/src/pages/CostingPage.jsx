import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Grid,
    MenuItem,
    Snackbar,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import apiClient, { extractApiError } from '../api/client';
import PageHeader from '../components/common/PageHeader';
import CostParametersForm from '../components/costing/CostParametersForm';
import ProductionInputsForm from '../components/costing/ProductionInputsForm';
import CardReferencePanel from '../components/costing/CardReferencePanel';
import { colors } from '../theme';
import { eur, eur0, pct } from '../utils/costingFormat';

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
 * « Prix carte » — deux modes explicites (prompt 009) :
 *  - Production : coût de revient d'une production précise (run — quantités, pertes, série) ;
 *  - Carte en général : prix unitaire de référence d'une carte, hors production (CardReferencePanel).
 * Backed by /api/costing/*. See ADR 0005 / audit 2026-06-09.
 */
function CostingPage() {
    const [mode, setMode] = useState('production');
    const [productions, setProductions] = useState([]);
    const [productionId, setProductionId] = useState('');
    const [params, setParams] = useState(null);
    const [inputs, setInputs] = useState(null);
    const [result, setResult] = useState(null);
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

    const apply = async () => {
        if (!params || !inputs) return;
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
        } catch (e) {
            setError("Échec de l'enregistrement de la référence.");
        } finally {
            setBusy(false);
        }
    };

    const cards = result?.cards || [];

    return (
        <Box>
            <PageHeader
                title="Prix carte"
                description="Deux modes : coût d'une production précise, ou prix unitaire de référence d'une carte."
            />

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <ToggleButtonGroup
                exclusive size="small" value={mode}
                onChange={(_, v) => { if (v) setMode(v); }}
                sx={{ mb: 2 }}
                aria-label="Mode de calcul du prix"
            >
                <ToggleButton value="production" data-testid="mode-production">
                    Production (run précis)
                </ToggleButton>
                <ToggleButton value="card" data-testid="mode-card">
                    Carte en général (référence)
                </ToggleButton>
            </ToggleButtonGroup>

            {mode === 'card' ? (
                <CardReferencePanel />
            ) : (
                <Box>
                    <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 1.5 }}>
                        Coût de revient (HT/TTC) d'une production précise (quantités, pertes, série).
                    </Typography>

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
                        <Button startIcon={<RefreshRoundedIcon />} onClick={apply} disabled={busy || !params || !inputs}>
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
                            <Grid item xs={12} lg={6}>
                                <CostParametersForm
                                    values={params} disabled={busy}
                                    onChange={(k, v) => setParams((prev) => ({ ...prev, [k]: v }))}
                                />
                            </Grid>
                            <Grid item xs={12} lg={6}>
                                <ProductionInputsForm
                                    values={inputs} disabled={busy}
                                    onChange={(k, v) => setInputs((prev) => ({ ...prev, [k]: v }))}
                                />
                            </Grid>
                        </Grid>
                    )}

                    {result && (
                        <Box>
                            <Grid container spacing={2} sx={{ mb: 2 }}>
                                <Grid item xs={6} md={3}>
                                    <MetricCard label="Coût total production HT" value={eur0(result.total_ht)} accent />
                                </Grid>
                                <Grid item xs={6} md={3}>
                                    <MetricCard label="Coût total TTC" value={eur0(result.total_ttc)} />
                                </Grid>
                                <Grid item xs={6} md={3}>
                                    <MetricCard label="Cartes du lot" value={cards.length} />
                                </Grid>
                                <Grid item xs={6} md={3}>
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
                </Box>
            )}

            <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast('')} message={toast} />
        </Box>
    );
}

export default CostingPage;
