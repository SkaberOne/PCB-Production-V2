import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    Grid,
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
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import apiClient from '../../api/client';
import { colors } from '../../theme';
import LifecycleBadge from '../common/LifecycleBadge';
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
 *   - commandId: number (pour persister la qté reçue + complétion manuelle)
 *   - refreshNonce: number — incrémente pour forcer une actualisation temps réel
 *   - onRefreshState: (state) => void — remonte {loading, error} au parent (bouton Actualiser)
 *   - onLineSaved: (summary) => void — remonte le summary à jour après complétion manuelle
 */
const EMPTY_FORM = {
    mpn: '', quantityToOrder: '', note: '',
    supplier: '', supplierPart: '', unitPrice: '', currency: 'EUR', productUrl: '',
};

/**
 * Options du menu déroulant « quantité » d'une ligne : le besoin restant, la
 * quantité courante, les paliers de prix de l'offre retenue (souvent les tailles
 * de bobine 2000/3000/5000) et la taille de bobine du composant. Dédupliqué, trié.
 */
function buildQtyChoices({ autoQty, current, offer, qtyPerReel }) {
    const set = new Set();
    [autoQty, current].forEach((q) => { if (q && q > 0) set.add(Number(q)); });
    const breaks = Array.isArray(offer?.price_breaks) ? offer.price_breaks : [];
    breaks.forEach((b) => { if (b && Number(b.qty) > 0) set.add(Number(b.qty)); });
    if (qtyPerReel && Number(qtyPerReel) > 0) set.add(Number(qtyPerReel));
    return Array.from(set).sort((a, b) => a - b);
}

function ProcurementTable({ rows = [], commandId, refreshNonce = 0, onRefreshState, onLineSaved }) {
    const [offersByComponent, setOffersByComponent] = useState({});
    const [strategy, setStrategy] = useState('cheapest');
    const [prioritySupplier, setPrioritySupplier] = useState('MOUSER');
    const [received, setReceived] = useState({});
    const [loading, setLoading] = useState(false);

    // Popup de complétion manuelle d'une ligne.
    const [editRow, setEditRow] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);

    const openEditor = useCallback((row) => {
        setSaveError(null);
        setForm({
            mpn: row.mpn || '',
            quantityToOrder: row.quantityToOrder != null ? String(row.quantityToOrder) : '',
            note: row.note || '',
            supplier: row.manualOffer?.supplier || '',
            supplierPart: row.manualOffer?.supplier_part || '',
            unitPrice: row.manualOffer?.unit_price != null ? String(row.manualOffer.unit_price) : '',
            currency: row.manualOffer?.currency || 'EUR',
            productUrl: row.manualOffer?.product_url || '',
        });
        setEditRow(row);
    }, []);

    const closeEditor = useCallback(() => { setEditRow(null); setSaving(false); }, []);

    const setFormField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

    const saveLineDetail = useCallback(async () => {
        if (!commandId || !editRow) return;
        setSaving(true);
        setSaveError(null);
        const qtyRaw = form.quantityToOrder.trim();
        const priceRaw = form.unitPrice.trim();
        try {
            const res = await apiClient.put(`/marketplace/commands/${commandId}/line-details`, {
                line_key: editRow.key,
                mpn: form.mpn.trim() || null,
                quantity_to_order: qtyRaw === '' ? null : Math.max(parseInt(qtyRaw, 10) || 0, 0),
                note: form.note.trim() || null,
                supplier: form.supplier.trim() || null,
                supplier_part: form.supplierPart.trim() || null,
                unit_price: priceRaw === '' ? null : Math.max(parseFloat(priceRaw.replace(',', '.')) || 0, 0),
                currency: form.currency.trim() || null,
                product_url: form.productUrl.trim() || null,
                component_library_id: Number.isInteger(editRow.componentLibraryId) ? editRow.componentLibraryId : null,
                // Préserve le fournisseur choisi (menu par ligne) lors d'un enregistrement popup.
                selected_supplier: editRow.selectedSupplier || null,
            });
            onLineSaved?.(res.data);
            closeEditor();
        } catch (e) {
            setSaveError(e.response?.data?.detail || e.message || 'Erreur lors de l’enregistrement.');
            setSaving(false);
        }
    }, [commandId, editRow, form, onLineSaved, closeEditor]);

    // Persistance « préservante » : réécrit l'état complet de la ligne (set_line_detail
    // écrase tout) en ne modifiant que `changes`. Sert aux menus déroulants par ligne
    // (fournisseur retenu, quantité) sans effacer note / MPN / offre manuelle.
    const persistLineDetail = useCallback(async (row, changes) => {
        if (!commandId) return;
        try {
            const res = await apiClient.put(`/marketplace/commands/${commandId}/line-details`, {
                line_key: row.key,
                mpn: row.mpn || null,
                quantity_to_order: row.quantityToOrderOverride ?? null,
                note: row.note || null,
                supplier: row.manualOffer?.supplier || null,
                supplier_part: row.manualOffer?.supplier_part || null,
                unit_price: row.manualOffer?.unit_price ?? null,
                currency: row.manualOffer?.currency || null,
                product_url: row.manualOffer?.product_url || null,
                component_library_id: Number.isInteger(row.componentLibraryId) ? row.componentLibraryId : null,
                selected_supplier: row.selectedSupplier || null,
                ...changes,
            });
            onLineSaved?.(res.data);
        } catch (e) {
            /* non bloquant : l'UI se resynchronise au prochain refresh */
        }
    }, [commandId, onLineSaved]);

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
                            <TableCell>MPN</TableCell>
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
                            // Une offre saisie à la main prime ; sinon le fournisseur choisi
                            // par ligne (Feature B) ; sinon le tri automatique.
                            const manual = row.manualOffer;
                            const chosenBySupplier = row.selectedSupplier
                                ? offers.find((o) => (o.supplier || '').toUpperCase() === String(row.selectedSupplier).toUpperCase())
                                : null;
                            const best = manual || chosenBySupplier || selectBest(offers, opts);
                            const qty = best ? (toOrder || row.requiredQuantity || 1) : 0;
                            // Feature A : options de quantité (besoin restant + paliers + bobine).
                            const autoQty = Math.max((row.requiredQuantity || 0) - (row.stockAvailableQty || 0), 0);
                            const qtyChoices = buildQtyChoices({ autoQty, current: toOrder, offer: best, qtyPerReel: row.qtyPerReel });
                            const selectedSupplierValue = (row.selectedSupplier
                                && offers.some((o) => (o.supplier || '').toUpperCase() === String(row.selectedSupplier).toUpperCase()))
                                ? String(row.selectedSupplier).toUpperCase() : '';
                            const unit = best ? effectivePrice(best, qty) : null;
                            const total = unit != null && Number.isFinite(unit) ? unit * qty : null;
                            const currency = best?.currency || 'EUR';
                            const recu = received[row.key] || 0;
                            const isCovered = toOrder > 0 && recu >= toOrder;
                            const stock = manual ? null : best?.stock_qty;
                            return (
                                <TableRow
                                    key={row.key}
                                    hover
                                    onClick={() => openEditor(row)}
                                    sx={{
                                        cursor: 'pointer',
                                        ...(isCovered ? { backgroundColor: GREEN_BG, '&:hover': { backgroundColor: GREEN_BG } } : {}),
                                    }}
                                >
                                    <TableCell>
                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                            <span>{row.componentName || row.value}</span>
                                            <LifecycleBadge status={row.lifecycleStatus} />
                                            {row.note ? (
                                                <Tooltip title={row.note}>
                                                    <EditNoteRoundedIcon fontSize="small" sx={{ color: colors.textSecondary }} />
                                                </Tooltip>
                                            ) : null}
                                        </Stack>
                                    </TableCell>
                                    <TableCell>{row.mpn || '—'}</TableCell>
                                    <TableCell>{row.value}</TableCell>
                                    <TableCell>{row.footprint}</TableCell>
                                    <TableCell align="right">{row.requiredQuantity}</TableCell>
                                    <TableCell align="right">{row.stockAvailableQty || 0}</TableCell>
                                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                        <Select
                                            size="small"
                                            value={toOrder}
                                            onChange={(e) => persistLineDetail(row, { quantity_to_order: Number(e.target.value) })}
                                            renderValue={(v) => <span style={{ fontWeight: 600 }}>{Number(v).toLocaleString('fr-FR')}</span>}
                                            sx={{ minWidth: 96, '& .MuiSelect-select': { py: '4px', textAlign: 'right' } }}
                                        >
                                            {qtyChoices.map((q) => {
                                                const up = best ? effectivePrice(best, q) : null;
                                                const totalAtQ = up != null && Number.isFinite(up) ? up * q : null;
                                                return (
                                                    <MenuItem key={q} value={q}>
                                                        {q.toLocaleString('fr-FR')}
                                                        {totalAtQ != null ? ` · ${formatPrice(totalAtQ, best?.currency || 'EUR')}` : ''}
                                                        {row.qtyPerReel && q === row.qtyPerReel ? ' · bobine' : ''}
                                                    </MenuItem>
                                                );
                                            })}
                                        </Select>
                                    </TableCell>
                                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                        <TextField
                                            type="number"
                                            size="small"
                                            value={recu}
                                            onChange={(e) => handleReceivedChange(row.key, e.target.value)}
                                            onBlur={() => persistReceived(row.key, received[row.key] || 0)}
                                            inputProps={{ min: 0, style: { textAlign: 'right', width: 64, padding: '4px 6px' } }}
                                        />
                                    </TableCell>
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        {manual ? (
                                            <Stack direction="row" spacing={0.5} alignItems="center">
                                                {best?.product_url ? (
                                                    <a href={best.product_url} target="_blank" rel="noreferrer" style={{ color: colors.textPrimary }}>
                                                        {supplierLabel(best.supplier)}
                                                    </a>
                                                ) : <span>{supplierLabel(best?.supplier)}</span>}
                                                <Chip size="small" label="manuel" variant="outlined" />
                                            </Stack>
                                        ) : offers.length ? (
                                            <Stack direction="row" spacing={0.5} alignItems="center">
                                                <Select
                                                    size="small"
                                                    displayEmpty
                                                    value={selectedSupplierValue}
                                                    onChange={(e) => persistLineDetail(row, { selected_supplier: e.target.value || null })}
                                                    sx={{ minWidth: 132, '& .MuiSelect-select': { py: '4px' } }}
                                                >
                                                    <MenuItem value=""><em>Auto (moins cher)</em></MenuItem>
                                                    {sorted.map((o) => (
                                                        <MenuItem key={o.id || o.supplier} value={(o.supplier || '').toUpperCase()}>
                                                            {supplierLabel(o.supplier)} · {formatPrice(effectivePrice(o, qty || 1), o.currency || 'EUR')}
                                                        </MenuItem>
                                                    ))}
                                                </Select>
                                                {best?.product_url ? (
                                                    <a href={best.product_url} target="_blank" rel="noreferrer" title="Ouvrir la fiche produit" style={{ color: colors.textSecondary }}>↗</a>
                                                ) : null}
                                            </Stack>
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
                                <TableCell colSpan={13} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>
                                    Valide le stock dans BOM › Composants et stock pour afficher la liste à commander.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* ── Popup de complétion manuelle d'une ligne ── */}
            <Dialog open={Boolean(editRow)} onClose={closeEditor} maxWidth="sm" fullWidth>
                <DialogTitle>
                    Compléter la ligne
                    {editRow ? (
                        <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                            {editRow.componentName || editRow.value} · {editRow.value} · {editRow.footprint}
                        </Typography>
                    ) : null}
                </DialogTitle>
                <DialogContent dividers>
                    <Grid container spacing={2} sx={{ mt: 0 }}>
                        <Grid item xs={12} sm={8}>
                            <TextField
                                fullWidth size="small" label="MPN (réf. fabricant)"
                                value={form.mpn} onChange={setFormField('mpn')}
                                helperText={
                                    Number.isInteger(editRow?.componentLibraryId)
                                        ? 'Met à jour le composant en bibliothèque (toutes les BOM).'
                                        : 'Composant hors bibliothèque : MPN mémorisé pour cette commande.'
                                }
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField
                                fullWidth size="small" type="number" label="Quantité à commander"
                                value={form.quantityToOrder} onChange={setFormField('quantityToOrder')}
                                inputProps={{ min: 0 }}
                                helperText="Vide = quantité calculée"
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth size="small" label="Note" multiline minRows={2}
                                value={form.note} onChange={setFormField('note')}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Typography variant="caption" sx={{ color: colors.textMuted }}>
                                Offre fournisseur manuelle (si aucune offre API)
                            </Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField fullWidth size="small" label="Fournisseur" value={form.supplier} onChange={setFormField('supplier')} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField fullWidth size="small" label="Réf. fournisseur" value={form.supplierPart} onChange={setFormField('supplierPart')} />
                        </Grid>
                        <Grid item xs={6} sm={4}>
                            <TextField fullWidth size="small" label="Prix unitaire" value={form.unitPrice} onChange={setFormField('unitPrice')} inputProps={{ inputMode: 'decimal' }} />
                        </Grid>
                        <Grid item xs={6} sm={2}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Devise</InputLabel>
                                <Select label="Devise" value={form.currency} onChange={setFormField('currency')}>
                                    <MenuItem value="EUR">EUR</MenuItem>
                                    <MenuItem value="USD">USD</MenuItem>
                                    <MenuItem value="GBP">GBP</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField fullWidth size="small" label="Lien produit (URL)" value={form.productUrl} onChange={setFormField('productUrl')} />
                        </Grid>
                        {saveError ? (
                            <Grid item xs={12}>
                                <Typography variant="body2" color="error">{saveError}</Typography>
                            </Grid>
                        ) : null}
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeEditor} color="inherit" disabled={saving}>Annuler</Button>
                    <Button onClick={saveLineDetail} variant="contained" disabled={saving || !commandId}>
                        {saving ? 'Enregistrement…' : 'Enregistrer'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

export default ProcurementTable;
