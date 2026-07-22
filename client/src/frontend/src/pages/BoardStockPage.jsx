import React from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
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
import apiClient from '../api/client';
import PageHeader from '../components/common/PageHeader';
import ProductionSuiviBar from '../components/dashboard/ProductionSuiviBar';
import { colors } from '../theme';

const BELOW_MIN_BG = 'rgba(239, 68, 68, 0.12)';

function eur(v) {
    if (v == null || Number.isNaN(Number(v))) return '—';
    try {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
    } catch (e) {
        return `${Number(v).toFixed(2)} €`;
    }
}

/**
 * Stock des cartes produites (ADR 0017). Une ligne par référence de carte :
 * quantité en stock, minimum, prix par carte (Costing + override), valeur du
 * stock, et état QA (testées / validées / à débugger). Cliquer une ligne ouvre
 * l'édition.
 */
function BoardStockPage() {
    const [rows, setRows] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [editing, setEditing] = React.useState(null);
    const [form, setForm] = React.useState(null);
    const [saving, setSaving] = React.useState(false);

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
                subtitle="Stock de cartes finies par référence : quantité, minimum, prix et état QA."
            />

            {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert> : null}

            <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
                <Chip label={`Valeur totale du stock : ${eur(totalValue)}`} sx={{ backgroundColor: 'rgba(5,150,105,0.14)', color: '#6ee7b7' }} />
                <Chip label={`${belowMinCount} référence(s) sous le minimum`} color={belowMinCount ? 'error' : 'default'} variant={belowMinCount ? 'filled' : 'outlined'} />
            </Stack>

            <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 1 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>Référence carte</TableCell>
                            <TableCell>Révision</TableCell>
                            <TableCell align="right">En stock</TableCell>
                            <TableCell align="right">Min.</TableCell>
                            <TableCell align="right">Prix / carte</TableCell>
                            <TableCell align="right">Valeur stock</TableCell>
                            <TableCell align="right">Testées</TableCell>
                            <TableCell align="right">Validées</TableCell>
                            <TableCell align="right">À débugger</TableCell>
                            <TableCell align="right">Suivi</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows === null ? (
                            <TableRow><TableCell colSpan={10} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>Chargement…</TableCell></TableRow>
                        ) : rows.length === 0 ? (
                            <TableRow><TableCell colSpan={10} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>Aucune référence de carte.</TableCell></TableRow>
                        ) : rows.map((row) => (
                            <TableRow
                                key={`${row.bom_reference_id}::${row.revision || ''}`}
                                hover
                                onClick={() => openEditor(row)}
                                sx={{ cursor: 'pointer', ...(row.below_min ? { backgroundColor: BELOW_MIN_BG, '&:hover': { backgroundColor: BELOW_MIN_BG } } : {}) }}
                            >
                                <TableCell>
                                    {row.reference}
                                    {row.below_min ? <Chip size="small" label="sous min." color="error" sx={{ ml: 0.75 }} /> : null}
                                </TableCell>
                                <TableCell>
                                    {row.revision ? <Chip size="small" label={row.revision} variant="outlined" /> : <span style={{ color: colors.textSecondary }}>—</span>}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>{row.qty_in_stock}</TableCell>
                                <TableCell align="right" sx={{ color: colors.textSecondary }}>{row.min_stock}</TableCell>
                                <TableCell align="right">
                                    {eur(row.unit_price_effective)}
                                    {row.unit_price_override != null
                                        ? <Chip size="small" label="manuel" variant="outlined" sx={{ ml: 0.5 }} />
                                        : (row.reference_unit_cost_ht != null ? <Chip size="small" label="auto" variant="outlined" sx={{ ml: 0.5, color: colors.textSecondary }} /> : null)}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>{eur(row.stock_value)}</TableCell>
                                <TableCell align="right" sx={{ color: '#3b82f6' }}>{row.cards_tested}</TableCell>
                                <TableCell align="right" sx={{ color: '#22c55e' }}>{row.cards_validated}</TableCell>
                                <TableCell align="right" sx={{ color: '#f59e0b' }}>{row.cards_to_debug}</TableCell>
                                <TableCell align="right">
                                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <ProductionSuiviBar
                                            produced={row.qty_in_stock}
                                            tested={row.cards_tested}
                                            validated={row.cards_validated}
                                            toDebug={row.cards_to_debug}
                                            testId={`suivi-bar-${row.bom_reference_id}`}
                                        />
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={Boolean(editing)} onClose={() => !saving && setEditing(null)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editing?.reference}
                    {editing?.revision ? <Chip size="small" label={editing.revision} variant="outlined" sx={{ ml: 1 }} /> : null}
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
