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

const STATUS_LABELS = { OPEN: 'Ouverte', READY: 'Prête', DELIVERED: 'Livrée', CANCELLED: 'Annulée' };
const STATUS_COLOR = { OPEN: 'warning', READY: 'success', DELIVERED: 'default', CANCELLED: 'error' };

function ClientOrdersPage() {
    const [orders, setOrders] = React.useState(null);
    const [refs, setRefs] = React.useState([]);
    const [error, setError] = React.useState(null);
    const [createOpen, setCreateOpen] = React.useState(false);
    const [detail, setDetail] = React.useState(null); // commande ouverte en détail

    const load = React.useCallback(async () => {
        setError(null);
        try {
            const [o, r] = await Promise.all([
                apiClient.get('/marketplace/client-orders'),
                apiClient.get('/marketplace/board-stock'),
            ]);
            setOrders(Array.isArray(o.data) ? o.data : []);
            setRefs((Array.isArray(r.data) ? r.data : []).map((x) => ({ id: x.bom_reference_id, label: x.reference, in_stock: x.qty_in_stock })));
        } catch (e) {
            setError(e?.response?.data?.detail || 'Chargement des commandes impossible.');
            setOrders([]);
        }
    }, []);

    React.useEffect(() => { load(); }, [load]);

    const refreshDetail = async (orderId) => {
        try {
            const res = await apiClient.get(`/marketplace/client-orders/${orderId}`);
            setDetail(res.data);
        } catch (e) { /* ignore */ }
        await load();
    };

    return (
        <Box>
            <PageHeader
                title="Commandes client / machine"
                subtitle="Demandes de cartes (client externe ou besoin machine), préparation de boîte et suivi."
            />

            {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert> : null}

            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
                <Button variant="contained" color="success" startIcon={<AddRoundedIcon />} onClick={() => setCreateOpen(true)}>
                    Nouvelle commande
                </Button>
            </Stack>

            <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 1 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>Référence</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>Destinataire</TableCell>
                            <TableCell align="right">Cartes</TableCell>
                            <TableCell align="right">Préparées</TableCell>
                            <TableCell>Statut</TableCell>
                            <TableCell>Échéance</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {orders === null ? (
                            <TableRow><TableCell colSpan={7} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>Chargement…</TableCell></TableRow>
                        ) : orders.length === 0 ? (
                            <TableRow><TableCell colSpan={7} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>Aucune commande. Crée-en une avec « Nouvelle commande ».</TableCell></TableRow>
                        ) : orders.map((o) => (
                            <TableRow key={o.id} hover onClick={() => setDetail(o)} sx={{ cursor: 'pointer' }}>
                                <TableCell>{o.reference}</TableCell>
                                <TableCell><Chip size="small" label={o.order_type === 'MACHINE' ? 'Machine' : 'Client'} variant="outlined" /></TableCell>
                                <TableCell>{o.recipient || '—'}</TableCell>
                                <TableCell align="right">{o.total_quantity}</TableCell>
                                <TableCell align="right">{o.total_prepared}</TableCell>
                                <TableCell><Chip size="small" label={STATUS_LABELS[o.status] || o.status} color={STATUS_COLOR[o.status] || 'default'} /></TableCell>
                                <TableCell sx={{ color: colors.textSecondary }}>{o.due_date ? new Date(o.due_date).toLocaleDateString('fr-FR') : '—'}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <CreateOrderDialog
                open={createOpen}
                refs={refs}
                onClose={() => setCreateOpen(false)}
                onCreated={async () => { setCreateOpen(false); await load(); }}
                setError={setError}
            />

            <OrderDetailDialog
                order={detail}
                refs={refs}
                onClose={() => setDetail(null)}
                onChanged={refreshDetail}
                setError={setError}
            />
        </Box>
    );
}

// ── Création ──────────────────────────────────────────────────────────────
function CreateOrderDialog({ open, refs, onClose, onCreated, setError }) {
    const [type, setType] = React.useState('CLIENT');
    const [recipient, setRecipient] = React.useState('');
    const [due, setDue] = React.useState('');
    const [notes, setNotes] = React.useState('');
    const [lines, setLines] = React.useState([{ ref: null, qty: '1' }]);
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        if (open) { setType('CLIENT'); setRecipient(''); setDue(''); setNotes(''); setLines([{ ref: null, qty: '1' }]); }
    }, [open]);

    const setLine = (i, patch) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    const addLine = () => setLines((prev) => [...prev, { ref: null, qty: '1' }]);
    const removeLine = (i) => setLines((prev) => prev.filter((_, idx) => idx !== i));

    const submit = async () => {
        setSaving(true);
        try {
            await apiClient.post('/marketplace/client-orders', {
                order_type: type,
                recipient: recipient.trim() || null,
                due_date: due ? new Date(due).toISOString() : null,
                notes: notes.trim() || null,
                lines: lines
                    .filter((l) => l.ref && (parseInt(l.qty, 10) || 0) > 0)
                    .map((l) => ({ bom_reference_id: l.ref.id, quantity: parseInt(l.qty, 10) || 0 })),
            });
            onCreated();
        } catch (e) {
            setError(e?.response?.data?.detail || 'Création impossible.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
            <DialogTitle>Nouvelle commande</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ mt: 0.5 }}>
                    <Stack direction="row" spacing={2}>
                        <TextField select size="small" label="Type" value={type} onChange={(e) => setType(e.target.value)} sx={{ minWidth: 140 }}>
                            <MenuItem value="CLIENT">Client</MenuItem>
                            <MenuItem value="MACHINE">Machine / interne</MenuItem>
                        </TextField>
                        <TextField fullWidth size="small" label={type === 'MACHINE' ? 'Machine / besoin' : 'Client'} value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                    </Stack>
                    <Stack direction="row" spacing={2}>
                        <TextField size="small" type="date" label="Échéance" value={due} onChange={(e) => setDue(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: 180 }} />
                    </Stack>
                    <TextField fullWidth size="small" label="Note" multiline minRows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    <Divider />
                    <Typography variant="subtitle2">Cartes demandées</Typography>
                    {lines.map((l, i) => (
                        <Stack key={i} direction="row" spacing={1} alignItems="center">
                            <Autocomplete
                                size="small"
                                sx={{ flex: 1 }}
                                options={refs}
                                value={l.ref}
                                onChange={(_e, v) => setLine(i, { ref: v })}
                                getOptionLabel={(o) => o?.label || ''}
                                isOptionEqualToValue={(o, v) => o.id === v.id}
                                renderInput={(params) => <TextField {...params} label="Référence carte" />}
                            />
                            <TextField size="small" type="number" label="Qté" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} inputProps={{ min: 1 }} sx={{ width: 90 }} />
                            <IconButton size="small" onClick={() => removeLine(i)} disabled={lines.length <= 1}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                        </Stack>
                    ))}
                    <Button size="small" startIcon={<AddRoundedIcon />} onClick={addLine}>Ajouter une carte</Button>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose} disabled={saving}>Annuler</Button>
                <Button variant="contained" color="success" onClick={submit} disabled={saving}>Créer</Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Détail + préparation ──────────────────────────────────────────────────
function OrderDetailDialog({ order, refs, onClose, onChanged, setError }) {
    const [busy, setBusy] = React.useState(false);
    if (!order) return null;

    const call = async (fn) => {
        setBusy(true);
        try { await fn(); await onChanged(order.id); }
        catch (e) { setError(e?.response?.data?.detail || 'Action impossible.'); }
        finally { setBusy(false); }
    };

    const prepare = (lineId, qty) => call(() => apiClient.post(`/marketplace/client-orders/${order.id}/prepare`, { line_id: lineId, qty }));
    const setStatus = (status) => call(() => apiClient.put(`/marketplace/client-orders/${order.id}`, { status }));
    const remove = () => call(async () => { await apiClient.delete(`/marketplace/client-orders/${order.id}`); onClose(); });

    return (
        <Dialog open={Boolean(order)} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
            <DialogTitle>
                {order.reference} — {order.order_type === 'MACHINE' ? 'Machine' : 'Client'}
                <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                    {order.recipient || '—'} · {STATUS_LABELS[order.status] || order.status}
                </Typography>
            </DialogTitle>
            <DialogContent dividers>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Carte</TableCell>
                            <TableCell align="right">Demandé</TableCell>
                            <TableCell align="right">Préparé</TableCell>
                            <TableCell align="center">Boîte</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {order.lines.map((line) => (
                            <TableRow key={line.id}>
                                <TableCell>{line.reference}</TableCell>
                                <TableCell align="right">{line.quantity}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 600 }}>{line.quantity_prepared}</TableCell>
                                <TableCell align="center">
                                    <Button size="small" disabled={busy || line.quantity_prepared <= 0} onClick={() => prepare(line.id, -1)}>−</Button>
                                    <Button size="small" disabled={busy || line.remaining <= 0} onClick={() => prepare(line.id, 1)}>+</Button>
                                    <Button size="small" disabled={busy || line.remaining <= 0} onClick={() => prepare(line.id, line.remaining)}>Tout</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <Typography variant="caption" sx={{ color: colors.textSecondary, mt: 1, display: 'block' }}>
                    Préparer décrémente le stock de cartes ; retirer le rend au stock.
                </Typography>
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between' }}>
                <Button color="error" onClick={remove} disabled={busy}>Supprimer</Button>
                <Box>
                    {order.status !== 'DELIVERED' && (
                        <Button color="success" onClick={() => setStatus('DELIVERED')} disabled={busy}>Marquer livrée</Button>
                    )}
                    <Button color="inherit" onClick={onClose} disabled={busy}>Fermer</Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}

export default ClientOrdersPage;
