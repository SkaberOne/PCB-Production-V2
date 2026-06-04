import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Box,
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
    TextField,
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

const GREEN_BG = 'rgba(5, 150, 105, 0.16)';

/**
 * Tableau unique de la page Commande : lignes BOM agrégées + offres fournisseurs
 * (prix/stock/tri) + saisie de la quantité reçue. Une ligne passe en vert quand
 * la quantité reçue couvre la quantité à commander (besoin − stock).
 *
 * Props:
 *   - rows: [{ key, componentName, value, footprint, requiredQuantity,
 *              stockAvailableQty, quantityToOrder, componentLibraryId, mpn, qtyReceived }]
 *   - commandId: number (pour persister la qté reçue)
 *   - refreshNonce: number — incrémente pour forcer une actualisation temps réel
 *   - onRefreshState: (state) => void — remonte {loading, error} au parent (bouton Actualiser)
 */
function ProcurementTable({ rows = [], commandId, refreshNonce = 0, onRefreshState }) {
    const [offersByComponent, setOffersByComponent] = useState({});
    const [strategy, setStrategy] = useState('cheapest');
    const [prioritySupplier, setPrioritySupplier] = useState('MOUSER');
    const [received, setReceived] = useState({});
    const [loading, setLoading] = useState(false);

    const componentIds = useMemo(
        () => rows.map((r) => r.componentLibraryId).filter((id) => Number.isInteger(id)),
        [rows],
    );

    const persistTimers = useRef({});

    // Nettoyage des timers debounce au démontage pour éviter une écriture après navigation.
    useEffect(() => {
        const timers = persistTimers.current;
        return () => { Object.values(timers).forEach((t) => clearTimeout(t)); };
    }, []);

    // Initialise la qté reçue depuis le backend SANS écraser une saisie locale en cours.
    useEffect(() => {
        setReceived((prev) => {
            const next = { ...prev };
            rows.forEach((r) => { if (!(r.key in next)) next[r.key] = r.qtyReceived || 0; });
            return next;
        });
    }, [rows]);

    const loadCache = useCallback(async () => {
        if (componentIds.length === 0) { setOffersByComponent({}); return; }
        try {
            const res = await apiClient.get('/marketplace/supplier-offers', {
                params: { component_ids: componentIds.join(',') },
            });
            setOffersByComponent(res.data.offers || {});
        } catch (e) {
            /* cache vide — silencieux */
        }
    }, [componentIds]);

    useEffect(() => { loadCache(); }, [loadCache]);

    // Actualisation temps réel déclenchée par le bouton du parent (refreshNonce).
    useEffect(() => {
        if (!refreshNonce || componentIds.length === 0) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            onRefreshState?.({ loading: true, error: null });
            try {
                const res = await apiClient.post(
                    '/marketplace/supplier-offers/refresh',
                    { component_ids: componentIds },
                    { timeout: 180000 },
                );
                if (!cancelled) setOffersByComponent(res.data.offers || {});
                onRefreshState?.({ loading: false, error: null });
            } catch (e) {
                if (!cancelled) await loadCache();
                onRefreshState?.({ loading: false, error: "Actualisation partielle ou échouée (quota/API). Cache conservé." });
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshNonce]);

    const persistReceived = useCallback(async (key, qty) => {
        if (!commandId) return;
        try {
            await apiClient.put(`/marketplace/commands/${commandId}/receipts`, {
                line_key: key,
                qty_received: qty,
            });
        } catch (e) {
            /* non bloquant */
        }
    }, [commandId]);

    const handleReceivedChange = (key, value) => {
        const qty = Math.max(parseInt(value, 10) || 0, 0);
        setReceived((prev) => ({ ...prev, [key]: qty }));
        clearTimeout(persistTimers.current[key]);
        persistTimers.current[key] = setTimeout(() => persistReceived(key, qty), 500);
    };

    const sortOptsFor = (qty) => ({ strategy, prioritySupplier, quantity: qty || 1 });

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" gap={1}>
                <Box>
                    <Typography variant="h6" sx={{ color: colors.textPrimary, fontWeight: 600 }}>
                        Composants à commander
                    </Typography>
                    <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                        BOM de la production + prix/dispo fournisseurs. Saisis la qté reçue : la ligne passe au vert quand le besoin est couvert.
                    </Typography>
                </Box>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    {loading && <CircularProgress size={18} />}
                    <FormControl size="small" sx={{ minWidth: 170 }}>
                        <InputLabel>Tri fournisseur</InputLabel>
                        <Select label="Tri fournisseur" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                            <MenuItem value="cheapest">Moins cher</MenuItem>
                            <MenuItem value="priority">Prioriser un fournisseur</MenuItem>
                        </Select>
                    </FormControl>
                    {strategy === 'priority' && (
                        <FormControl size="small" sx={{ minWidth: 140 }}>
                            <InputLabel>Fournisseur</InputLabel>
                            <Select label="Fournisseur" value={prioritySupplier} onChange={(e) => setPrioritySupplier(e.target.value)}>
                                {Object.entries(SUPPLIER_LABELS).map(([code, label]) => (
                                    <MenuItem key={code} value={code}>{label}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                </Stack>
            </Stack>

            <TableContainer>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>Composant</TableCell>
                            <TableCell>Valeur</TableCell>
                            <TableCell>Empreinte</TableCell>
                            <TableCell align="right">Besoin</TableCell>
                            <TableCell align="right">Stock</TableCell>
                            <TableCell align="right">À commander</TableCell>
                            <TableCell align="right">Qté reçue</TableCell>
                            <TableCell>Fournisseur</TableCell>
                            <TableCell align="right">Stock dispo</TableCell>
                            <TableCell align="right">Prix unit.</TableCell>
                            <TableCell align="right">Prix qté</TableCell>
                            <TableCell>Autres offres</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => {
                            const toOrder = Math.max(row.quantityToOrder || 0, 0);
                            const offers = offersByComponent[row.componentLibraryId] || [];
                            const opts = sortOptsFor(toOrder || row.requiredQuantity);
                            const sorted = sortOffers(offers, opts);
                            const best = selectBest(offers, opts);
                            const qty = best ? (toOrder || row.requiredQuantity || 1) : 0;
                            const unit = best ? effectivePrice(best, qty) : null;
                            const total = unit != null && Number.isFinite(unit) ? unit * qty : null;
                            const currency = best?.currency || 'EUR';
                            const recu = received[row.key] || 0;
                            const isCovered = toOrder > 0 && recu >= toOrder;
                            const stock = best?.stock_qty;
                            return (
                                <TableRow
                                    key={row.key}
                                    hover
                                    sx={isCovered ? { backgroundColor: GREEN_BG, '&:hover': { backgroundColor: GREEN_BG } } : undefined}
                                >
                                    <TableCell>{row.componentName || row.value}</TableCell>
                                    <TableCell>{row.value}</TableCell>
                                    <TableCell>{row.footprint}</TableCell>
                                    <TableCell align="right">{row.requiredQuantity}</TableCell>
                                    <TableCell align="right">{row.stockAvailableQty || 0}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600 }}>{toOrder}</TableCell>
                                    <TableCell align="right">
                                        <TextField
                                            type="number"
                                            size="small"
                                            value={recu}
                                            onChange={(e) => handleReceivedChange(row.key, e.target.value)}
                                            onBlur={() => persistReceived(row.key, received[row.key] || 0)}
                                            inputProps={{ min: 0, style: { textAlign: 'right', width: 64, padding: '4px 6px' } }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {best ? (
                                            best.product_url ? (
                                                <a href={best.product_url} target="_blank" rel="noreferrer" style={{ color: colors.textPrimary }}>
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
                                                color={stock <= 0 ? 'error' : stock >= (toOrder || 1) ? 'success' : 'warning'}
                                                variant={stock >= (toOrder || 1) ? 'filled' : 'outlined'}
                                            />
                                        ) : '—'}
                                    </TableCell>
                                    <TableCell align="right">{unit != null ? formatPrice(unit, currency) : '—'}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600 }}>{total != null ? formatPrice(total, currency) : '—'}</TableCell>
                                    <TableCell>
                                        {sorted.slice(1, 3).map((o) => (
                                            <Tooltip key={o.id || o.supplier} title={o.supplier_part || ''}>
                                                <Chip size="small" sx={{ mr: 0.5 }} label={`${supplierLabel(o.supplier)} ${formatPrice(effectivePrice(o, qty || 1), o.currency || 'EUR')}`} />
                                            </Tooltip>
                                        ))}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {rows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={12} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>
                                    Valide le stock dans BOM › Composants et stock pour afficher la liste à commander.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

export default ProcurementTable;
