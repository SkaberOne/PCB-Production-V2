import React, { useCallback, useEffect, useMemo, useState } from 'react';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from '@mui/material';
import apiClient from '../../api/client';
import { colors } from '../../theme';
import {
    SUPPLIER_LABELS,
    effectivePrice,
    formatPrice,
    selectBest,
    sortOffers,
    supplierLabel,
} from '../../utils/supplierOffers';

const CARD_SX = { backgroundColor: colors.surfaceCard, border: `1px solid ${colors.border}` };

/**
 * Real-time price/availability panel for the components of a command.
 *
 * Reads cached offers by default; the "Actualiser" button forces a live refresh
 * from the supplier APIs. Sorting (cheapest / prioritized supplier) is applied
 * client-side over the cached offers. See ADR 0004.
 *
 * Props:
 *   - components: Array<{ id:number, value?:string, mpn?:string, name?:string }>
 */
function SupplierOffersPanel({ components = [] }) {
    const componentIds = useMemo(
        () => components.map((c) => c.id).filter((id) => Number.isInteger(id)),
        [components],
    );
    const componentById = useMemo(() => {
        const map = {};
        components.forEach((c) => { map[c.id] = c; });
        return map;
    }, [components]);

    const [offersByComponent, setOffersByComponent] = useState({});
    const [strategy, setStrategy] = useState('cheapest');
    const [prioritySupplier, setPrioritySupplier] = useState('MOUSER');
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const loadCache = useCallback(async () => {
        if (componentIds.length === 0) {
            setOffersByComponent({});
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await apiClient.get('/marketplace/supplier-offers', {
                params: { component_ids: componentIds.join(',') },
            });
            setOffersByComponent(res.data.offers || {});
        } catch (e) {
            setError("Impossible de charger les offres en cache.");
        } finally {
            setLoading(false);
        }
    }, [componentIds]);

    useEffect(() => { loadCache(); }, [loadCache]);

    const handleRefresh = async () => {
        if (componentIds.length === 0) return;
        setRefreshing(true);
        setError(null);
        try {
            const res = await apiClient.post('/marketplace/supplier-offers/refresh', {
                component_ids: componentIds,
            });
            setOffersByComponent(res.data.offers || {});
        } catch (e) {
            setError("Échec de l'actualisation temps réel (quota ou API indisponible). Cache conservé.");
        } finally {
            setRefreshing(false);
        }
    };

    const totalOffers = Object.values(offersByComponent).reduce((n, list) => n + (list?.length || 0), 0);

    return (
        <Card sx={CARD_SX}>
            <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
                    <Box>
                        <Typography variant="h6" sx={{ color: colors.textPrimary, fontWeight: 600 }}>
                            Prix & disponibilité fournisseurs
                        </Typography>
                        <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                            Données en cache. « Actualiser » interroge Mouser / DigiKey en temps réel.
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <FormControl size="small" sx={{ minWidth: 170 }}>
                            <InputLabel>Tri</InputLabel>
                            <Select label="Tri" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                                <MenuItem value="cheapest">Moins cher</MenuItem>
                                <MenuItem value="priority">Prioriser un fournisseur</MenuItem>
                            </Select>
                        </FormControl>
                        {strategy === 'priority' && (
                            <FormControl size="small" sx={{ minWidth: 140 }}>
                                <InputLabel>Fournisseur</InputLabel>
                                <Select
                                    label="Fournisseur"
                                    value={prioritySupplier}
                                    onChange={(e) => setPrioritySupplier(e.target.value)}
                                >
                                    {Object.entries(SUPPLIER_LABELS).map(([code, label]) => (
                                        <MenuItem key={code} value={code}>{label}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                        <Button
                            variant="outlined"
                            startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshRoundedIcon />}
                            onClick={handleRefresh}
                            disabled={refreshing || componentIds.length === 0}
                        >
                            Actualiser
                        </Button>
                    </Stack>
                </Stack>

                {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress /></Box>
                ) : totalOffers === 0 ? (
                    <Typography variant="body2" sx={{ color: colors.textSecondary, py: 2 }}>
                        Aucune offre en cache. Clique sur « Actualiser » pour interroger les fournisseurs.
                    </Typography>
                ) : (
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Composant</TableCell>
                                    <TableCell align="right">Qté demandée</TableCell>
                                    <TableCell>Fournisseur</TableCell>
                                    <TableCell align="right">Stock dispo</TableCell>
                                    <TableCell align="right">Prix unitaire</TableCell>
                                    <TableCell align="right">Prix qté demandée</TableCell>
                                    <TableCell>Réf. / fraîcheur</TableCell>
                                    <TableCell>Autres offres</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {componentIds.map((cid) => {
                                    const offers = offersByComponent[cid] || [];
                                    const comp = componentById[cid] || {};
                                    const quantity = Math.max(parseInt(comp.quantity, 10) || 1, 1);
                                    const rowOpts = { strategy, prioritySupplier, quantity };
                                    const sorted = sortOffers(offers, rowOpts);
                                    const best = selectBest(offers, rowOpts);
                                    const unitPrice = best ? effectivePrice(best, quantity) : null;
                                    const lineTotal =
                                        unitPrice != null && Number.isFinite(unitPrice) ? unitPrice * quantity : null;
                                    const currency = best?.currency || 'EUR';
                                    const stock = best?.stock_qty;
                                    const stockOk = (stock || 0) >= quantity;
                                    return (
                                        <TableRow key={cid} hover>
                                            <TableCell>{comp.name || comp.value || comp.mpn || `#${cid}`}</TableCell>
                                            <TableCell align="right">{quantity}</TableCell>
                                            <TableCell>
                                                {best ? (
                                                    best.product_url ? (
                                                        <a href={best.product_url} target="_blank" rel="noreferrer"
                                                           style={{ color: colors.textPrimary }}>
                                                            {supplierLabel(best.supplier)}
                                                        </a>
                                                    ) : supplierLabel(best.supplier)
                                                ) : '—'}
                                            </TableCell>
                                            <TableCell align="right">
                                                {best && stock != null ? (
                                                    <Chip
                                                        size="small"
                                                        label={stock.toLocaleString('fr-FR')}
                                                        color={stock <= 0 ? 'error' : stockOk ? 'success' : 'warning'}
                                                        variant={stockOk ? 'filled' : 'outlined'}
                                                    />
                                                ) : '—'}
                                            </TableCell>
                                            <TableCell align="right">
                                                {unitPrice != null ? formatPrice(unitPrice, currency) : '—'}
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 600, color: colors.textPrimary }}>
                                                {lineTotal != null ? formatPrice(lineTotal, currency) : '—'}
                                            </TableCell>
                                            <TableCell>
                                                {best?.supplier_part || '—'}
                                                {best?.fetched_at && (
                                                    <Tooltip title={`Cache : ${best.fetched_at}`}>
                                                        <Chip
                                                            size="small"
                                                            sx={{ ml: 0.5 }}
                                                            variant="outlined"
                                                            color={best.stale ? 'warning' : 'default'}
                                                            label={best.stale ? 'périmé' : new Date(best.fetched_at).toLocaleDateString('fr-FR')}
                                                        />
                                                    </Tooltip>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {sorted.slice(1).map((o) => (
                                                    <Chip key={o.id || o.supplier} size="small" sx={{ mr: 0.5 }}
                                                          label={`${supplierLabel(o.supplier)} ${formatPrice(effectivePrice(o, quantity), o.currency || 'EUR')}`} />
                                                ))}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </CardContent>
        </Card>
    );
}

export default SupplierOffersPanel;
