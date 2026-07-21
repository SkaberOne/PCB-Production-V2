import React from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
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
    Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import apiClient from '../api/client';
import PageHeader from '../components/common/PageHeader';
import { colors } from '../theme';

function eur(v) {
    if (v == null || Number.isNaN(Number(v))) return '—';
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v); }
    catch (e) { return `${Number(v).toFixed(2)} €`; }
}

/**
 * Catalogue de cartes unifié (ADR 0018). Une fiche par référence de carte :
 * notre référence, code KELENN (part_number), nom, type (SIMPLE/ASSEMBLY),
 * révisions connues, prix (Costing ou somme des enfants). Cliquer une ligne
 * ouvre l'édition (nom / code / type / composition d'assemblage).
 */
function CardCatalogPage() {
    const [rows, setRows] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [editing, setEditing] = React.useState(null);

    const load = React.useCallback(async () => {
        setError(null);
        try {
            const res = await apiClient.get('/marketplace/cards');
            setRows(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            setError(e?.response?.data?.detail || 'Chargement du catalogue impossible.');
            setRows([]);
        }
    }, []);
    React.useEffect(() => { load(); }, [load]);

    const assemblies = (rows || []).filter((r) => r.card_type === 'ASSEMBLY').length;

    return (
        <Box>
            <PageHeader
                title="Catalogue des cartes"
                subtitle="Fiche unifiée : référence, code KELENN, nom, type, révisions, prix et composition (assemblages)."
            />
            {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert> : null}

            <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
                <Chip label={`${(rows || []).length} carte(s)`} variant="outlined" />
                <Chip label={`${assemblies} assemblage(s)`} variant="outlined" />
            </Stack>

            <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 1 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>Référence</TableCell>
                            <TableCell>Nom</TableCell>
                            <TableCell>Code KELENN</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>Révisions</TableCell>
                            <TableCell align="right">Prix / carte</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows === null ? (
                            <TableRow><TableCell colSpan={6} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>Chargement…</TableCell></TableRow>
                        ) : rows.length === 0 ? (
                            <TableRow><TableCell colSpan={6} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>Aucune carte.</TableCell></TableRow>
                        ) : rows.map((row) => (
                            <TableRow key={row.bom_reference_id} hover onClick={() => setEditing(row)} sx={{ cursor: 'pointer' }}>
                                <TableCell sx={{ fontWeight: 600 }}>{row.reference}</TableCell>
                                <TableCell>{row.name || <span style={{ color: colors.textSecondary }}>—</span>}</TableCell>
                                <TableCell>{row.part_number || <span style={{ color: colors.textSecondary }}>—</span>}</TableCell>
                                <TableCell>
                                    {row.card_type === 'ASSEMBLY'
                                        ? <Chip size="small" label={`Assemblage (${row.assembly_items.length})`} color="secondary" variant="outlined" />
                                        : <Chip size="small" label="Simple" variant="outlined" />}
                                </TableCell>
                                <TableCell>
                                    {(row.revisions || []).length
                                        ? row.revisions.map((r) => <Chip key={r} size="small" label={r} variant="outlined" sx={{ mr: 0.5 }} />)
                                        : <span style={{ color: colors.textSecondary }}>—</span>}
                                </TableCell>
                                <TableCell align="right">
                                    {eur(row.unit_price)}
                                    {row.card_type === 'ASSEMBLY' && !row.price_complete
                                        ? <Chip size="small" label="incomplet" color="warning" variant="outlined" sx={{ ml: 0.5 }} />
                                        : null}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <CardEditDialog
                card={editing}
                allCards={rows || []}
                onClose={() => setEditing(null)}
                onSaved={async () => { setEditing(null); await load(); }}
                setError={setError}
            />
        </Box>
    );
}

function CardEditDialog({ card, allCards, onClose, onSaved, setError }) {
    const open = Boolean(card);
    const [name, setName] = React.useState('');
    const [partNumber, setPartNumber] = React.useState('');
    const [cardType, setCardType] = React.useState('SIMPLE');
    const [items, setItems] = React.useState([]);
    const [saving, setSaving] = React.useState(false);
    const [compOptions, setCompOptions] = React.useState([]);

    React.useEffect(() => {
        if (!open) return;
        setName(card.name || '');
        setPartNumber(card.part_number || '');
        setCardType(card.card_type || 'SIMPLE');
        setItems((card.assembly_items || []).map((it) => ({
            kind: it.kind,
            child_reference_id: it.child_reference_id,
            component_id: it.component_id,
            label: it.label,
            qty: String(it.quantity),
        })));
    }, [open, card]);

    // Recherche de composants (pour les éléments en vrac d'un assemblage).
    const searchComponents = React.useCallback(async (q) => {
        try {
            const res = await apiClient.get('/bom/components', { params: { search: q || '', limit: 25 } });
            const list = Array.isArray(res.data) ? res.data : [];
            setCompOptions(list.map((c) => ({ id: c.id, label: c.value || c.mpn || c.reference })));
        } catch (e) { /* ignore */ }
    }, []);

    const cardOptions = (allCards || [])
        .filter((c) => !card || c.bom_reference_id !== card.bom_reference_id)
        .map((c) => ({ id: c.bom_reference_id, label: c.name ? `${c.reference} — ${c.name}` : c.reference }));

    const setItem = (i, patch) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
    const addCardItem = () => setItems((p) => [...p, { kind: 'card', child_reference_id: null, label: '', qty: '1' }]);
    const addCompItem = () => setItems((p) => [...p, { kind: 'component', component_id: null, label: '', qty: '1' }]);

    const save = async () => {
        setSaving(true);
        try {
            await apiClient.put(`/marketplace/cards/${card.bom_reference_id}`, {
                name: name.trim() || null,
                part_number: partNumber.trim() || null,
                card_type: cardType,
            });
            if (cardType === 'ASSEMBLY') {
                const payload = items
                    .filter((it) => (it.kind === 'card' ? it.child_reference_id : it.component_id) && (parseInt(it.qty, 10) || 0) > 0)
                    .map((it) => (it.kind === 'card'
                        ? { child_reference_id: it.child_reference_id, quantity: parseInt(it.qty, 10) || 1 }
                        : { component_id: it.component_id, quantity: parseInt(it.qty, 10) || 1 }));
                await apiClient.put(`/marketplace/cards/${card.bom_reference_id}/assembly`, { items: payload });
            }
            onSaved();
        } catch (e) {
            setError(e?.response?.data?.detail || 'Enregistrement impossible.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
            <DialogTitle>
                {card?.reference}
                <Typography variant="body2" sx={{ color: colors.textSecondary }}>Fiche carte</Typography>
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ mt: 0.5 }}>
                    <TextField fullWidth size="small" label="Nom de la carte" value={name} onChange={(e) => setName(e.target.value)} />
                    <TextField fullWidth size="small" label="Code KELENN (notre référence)" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} helperText="Sert au matching des commandes PDF (ex. KT240576)" />
                    <TextField select size="small" label="Type" value={cardType} onChange={(e) => setCardType(e.target.value)} sx={{ maxWidth: 240 }}>
                        <MenuItem value="SIMPLE">Carte simple</MenuItem>
                        <MenuItem value="ASSEMBLY">Assemblage (kit)</MenuItem>
                    </TextField>

                    {cardType === 'ASSEMBLY' ? (
                        <>
                            <Divider />
                            <Typography variant="subtitle2">Composition de l'assemblage</Typography>
                            {items.length === 0 ? (
                                <Typography variant="body2" sx={{ color: colors.textSecondary }}>Aucun élément. Ajoute des sous-cartes ou des composants.</Typography>
                            ) : items.map((it, i) => (
                                <Stack key={i} direction="row" spacing={1} alignItems="center">
                                    {it.kind === 'card' ? (
                                        <Autocomplete
                                            size="small" sx={{ flex: 1 }} options={cardOptions}
                                            value={it.child_reference_id ? { id: it.child_reference_id, label: it.label } : null}
                                            onChange={(_e, v) => setItem(i, { child_reference_id: v?.id || null, label: v?.label || '' })}
                                            getOptionLabel={(o) => o?.label || ''}
                                            isOptionEqualToValue={(o, v) => o.id === v.id}
                                            renderInput={(params) => <TextField {...params} label="Sous-carte" />}
                                        />
                                    ) : (
                                        <Autocomplete
                                            size="small" sx={{ flex: 1 }} options={compOptions} filterOptions={(x) => x}
                                            value={it.component_id ? { id: it.component_id, label: it.label } : null}
                                            onChange={(_e, v) => setItem(i, { component_id: v?.id || null, label: v?.label || '' })}
                                            onInputChange={(_e, val, reason) => { if (reason === 'input') searchComponents(val); }}
                                            getOptionLabel={(o) => o?.label || ''}
                                            isOptionEqualToValue={(o, v) => o.id === v.id}
                                            renderInput={(params) => <TextField {...params} label="Composant" placeholder="Rechercher…" />}
                                        />
                                    )}
                                    <Chip size="small" label={it.kind === 'card' ? 'carte' : 'composant'} variant="outlined" />
                                    <TextField size="small" type="number" label="Qté" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} inputProps={{ min: 1 }} sx={{ width: 80 }} />
                                    <IconButton size="small" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                                </Stack>
                            ))}
                            <Stack direction="row" spacing={1}>
                                <Button size="small" startIcon={<AddRoundedIcon />} onClick={addCardItem}>Sous-carte</Button>
                                <Button size="small" startIcon={<AddRoundedIcon />} onClick={addCompItem}>Composant</Button>
                            </Stack>
                            <Alert severity="info" variant="outlined" sx={{ py: 0 }}>Le prix de l'assemblage = somme automatique des prix des enfants.</Alert>
                        </>
                    ) : null}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose} disabled={saving}>Annuler</Button>
                <Button variant="contained" color="success" onClick={save} disabled={saving}>Enregistrer</Button>
            </DialogActions>
        </Dialog>
    );
}

export default CardCatalogPage;
