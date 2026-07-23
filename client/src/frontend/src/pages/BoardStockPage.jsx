import React from 'react';
import {
    Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
    InputAdornment, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, Typography,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import apiClient from '../api/client';
import PageHeader from '../components/common/PageHeader';
import CardStockRow from '../components/stock/CardStockRow';
import { normalizeRevisionCode, formatRevisionLabel } from '../utils/revision';
import { matchesQuery } from '../utils/textSearch';
import { colors } from '../theme';

function eur(v) {
    if (v == null || Number.isNaN(Number(v))) return '—';
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v); }
    catch (e) { return `${Number(v).toFixed(2)} €`; }
}

/**
 * Stock des cartes produites (ADR 0017). Prompt 022 : vue **groupée par carte**
 * (une ligne par référence, résumé agrégé stock/valeur + barre SUIVI), déroulant
 * `Collapse` avec le détail par révision (édition au clic), et barre de recherche
 * réf + nom (insensible casse/accents). Le regroupement s'applique au filtré.
 */
function BoardStockPage() {
    const [rows, setRows] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [editing, setEditing] = React.useState(null);
    const [form, setForm] = React.useState(null);
    const [saving, setSaving] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const [openCards, setOpenCards] = React.useState(() => new Set());

    const load = React.useCallback(async () => {
        setError(null);
        try {
            const res = await apiClient.get('/marketplace/board-stock');
            setRows(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            setError(e?.response?.data?.detail || 'Chargement du stock cartes impossible.');
            setRows([]);
        }
    }, []);
    React.useEffect(() => { load(); }, [load]);

    // Agrégation par carte (référence) : total stock/valeur, révisions, QA agrégé.
    const cards = React.useMemo(() => {
        if (rows === null) return null;
        const byRef = new Map();
        rows.forEach((r) => {
            let c = byRef.get(r.bom_reference_id);
            if (!c) {
                c = {
                    bom_reference_id: r.bom_reference_id, reference: r.reference, name: r.name || '',
                    revisions: [], totalStock: 0, totalValue: 0,
                    totalTested: 0, totalValidated: 0, totalToDebug: 0, anyBelowMin: false,
                };
                byRef.set(r.bom_reference_id, c);
            }
            c.revisions.push(r);
            c.totalStock += r.qty_in_stock || 0;
            c.totalValue += r.stock_value || 0;
            c.totalTested += r.cards_tested || 0;
            c.totalValidated += r.cards_validated || 0;
            c.totalToDebug += r.cards_to_debug || 0;
            if (r.below_min) c.anyBelowMin = true;
        });
        // Cartes avec du stock en tête, puis par référence.
        return Array.from(byRef.values()).sort((a, b) => {
            if ((b.totalStock > 0) !== (a.totalStock > 0)) return b.totalStock > 0 ? 1 : -1;
            return String(a.reference).localeCompare(String(b.reference));
        });
    }, [rows]);

    const filteredCards = React.useMemo(() => {
        if (cards === null) return null;
        return cards.filter((c) => matchesQuery(search, [c.reference, c.name]));
    }, [cards, search]);

    const toggleCard = (id) => setOpenCards((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const openEditor = (row) => {
        setForm({
            revision: row.revision || '',
            qty_in_stock: String(row.qty_in_stock ?? 0),
            min_stock: String(row.min_stock ?? 0),
            unit_price_override: row.unit_price_override != null ? String(row.unit_price_override) : '',
            cards_tested: String(row.cards_tested ?? 0),
            cards_validated: String(row.cards_validated ?? 0),
            cards_to_debug: String(row.cards_to_debug ?? 0),
            notes: row.notes || '',
        });
        setEditing(row);
    };
    const setField = (k) => (e) => setForm((prev) => ({ ...prev, [k]: e.target.value }));

    const save = async () => {
        if (!editing) return;
        setSaving(true);
        const priceRaw = form.unit_price_override.trim();
        try {
            await apiClient.put(`/marketplace/board-stock/${editing.bom_reference_id}`, {
                revision: form.revision || '',
                qty_in_stock: Math.max(parseInt(form.qty_in_stock, 10) || 0, 0),
                min_stock: Math.max(parseInt(form.min_stock, 10) || 0, 0),
                unit_price_override: priceRaw === '' ? null : Math.max(parseFloat(priceRaw.replace(',', '.')) || 0, 0),
                clear_price_override: priceRaw === '',
                cards_tested: Math.max(parseInt(form.cards_tested, 10) || 0, 0),
                cards_validated: Math.max(parseInt(form.cards_validated, 10) || 0, 0),
                cards_to_debug: Math.max(parseInt(form.cards_to_debug, 10) || 0, 0),
                notes: form.notes.trim() || null,
            });
            setEditing(null);
            await load();
        } catch (e) {
            setError(e?.response?.data?.detail || 'Enregistrement impossible.');
        } finally {
            setSaving(false);
        }
    };

    const totalValue = (rows || []).reduce((acc, r) => acc + (r.stock_value || 0), 0);
    const belowMinCount = (rows || []).filter((r) => r.below_min).length;

    return (
        <Box>
            <PageHeader
                title="Stock des cartes produites"
                subtitle="Stock de cartes finies groupé par carte : total, révisions dépliables, prix et état QA."
            />

            {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert> : null}

            <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="center" flexWrap="wrap" useFlexGap>
                <TextField
                    size="small"
                    placeholder="Rechercher (référence ou nom)…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    inputProps={{ 'aria-label': 'Rechercher une carte' }}
                    sx={{ minWidth: 280, flex: 1 }}
                    InputProps={{ startAdornment: (<InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment>) }}
                />
                <Chip label={`${(filteredCards || []).length} carte(s)`} variant="outlined" />
                <Chip label={`Valeur totale du stock : ${eur(totalValue)}`} sx={{ backgroundColor: 'rgba(5,150,105,0.14)', color: '#6ee7b7' }} />
                <Chip label={`${belowMinCount} référence(s) sous le minimum`} color={belowMinCount ? 'error' : 'default'} variant={belowMinCount ? 'filled' : 'outlined'} />
            </Stack>

            <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 1 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox" />
                            <TableCell>Référence carte</TableCell>
                            <TableCell>Nom</TableCell>
                            <TableCell align="right">Révisions</TableCell>
                            <TableCell align="right">En stock</TableCell>
                            <TableCell align="right">Valeur stock</TableCell>
                            <TableCell align="right">Suivi</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredCards === null ? (
                            <TableRow><TableCell colSpan={7} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>Chargement…</TableCell></TableRow>
                        ) : filteredCards.length === 0 ? (
                            <TableRow><TableCell colSpan={7} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>Aucune référence de carte.</TableCell></TableRow>
                        ) : filteredCards.map((card) => (
                            <CardStockRow
                                key={card.bom_reference_id}
                                card={card}
                                open={openCards.has(card.bom_reference_id)}
                                onToggle={() => toggleCard(card.bom_reference_id)}
                                onEditRevision={openEditor}
                                formatPrice={eur}
                            />
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={Boolean(editing)} onClose={() => !saving && setEditing(null)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editing?.reference}
                    {normalizeRevisionCode(editing?.revision) ? <Chip size="small" label={formatRevisionLabel(editing.revision)} variant="outlined" sx={{ ml: 1 }} /> : null}
                    <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                        Prix Costing de référence : {eur(editing?.reference_unit_cost_ht)}
                    </Typography>
                </DialogTitle>
                <DialogContent dividers>
                    {form ? (
                        <Grid container spacing={2} sx={{ mt: 0 }}>
                            <Grid item xs={6}><TextField fullWidth size="small" type="number" label="Quantité en stock" value={form.qty_in_stock} onChange={setField('qty_in_stock')} inputProps={{ min: 0 }} /></Grid>
                            <Grid item xs={6}><TextField fullWidth size="small" type="number" label="Stock minimum" value={form.min_stock} onChange={setField('min_stock')} inputProps={{ min: 0 }} /></Grid>
                            <Grid item xs={12}><TextField fullWidth size="small" label="Prix / carte (override manuel)" value={form.unit_price_override} onChange={setField('unit_price_override')} inputProps={{ inputMode: 'decimal' }} helperText="Vide = prix Costing automatique" /></Grid>
                            <Grid item xs={4}><TextField fullWidth size="small" type="number" label="Testées" value={form.cards_tested} onChange={setField('cards_tested')} inputProps={{ min: 0 }} /></Grid>
                            <Grid item xs={4}><TextField fullWidth size="small" type="number" label="Validées" value={form.cards_validated} onChange={setField('cards_validated')} inputProps={{ min: 0 }} /></Grid>
                            <Grid item xs={4}><TextField fullWidth size="small" type="number" label="À débugger" value={form.cards_to_debug} onChange={setField('cards_to_debug')} inputProps={{ min: 0 }} /></Grid>
                            <Grid item xs={12}><TextField fullWidth size="small" label="Note" multiline minRows={2} value={form.notes} onChange={setField('notes')} /></Grid>
                        </Grid>
                    ) : null}
                </DialogContent>
                <DialogActions>
                    <Button color="inherit" onClick={() => setEditing(null)} disabled={saving}>Annuler</Button>
                    <Button variant="contained" color="success" onClick={save} disabled={saving}>Enregistrer</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

export default BoardStockPage;
