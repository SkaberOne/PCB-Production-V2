import React from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
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
    Snackbar,
    Stack,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import apiClient from '../api/client';
import PageHeader from '../components/common/PageHeader';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { colors } from '../theme';
import { formatCardLabel } from '../utils/formatCardLabel';

const STATUS_LABELS = { OPEN: 'Ouverte', READY: 'Prête', DELIVERED: 'Livrée', CANCELLED: 'Annulée' };
const STATUS_COLOR = { OPEN: 'warning', READY: 'success', DELIVERED: 'default', CANCELLED: 'error' };

function ClientOrdersPage() {
    const [tab, setTab] = React.useState(0);
    const [error, setError] = React.useState(null);
    const [success, setSuccess] = React.useState(null);
    const [refs, setRefs] = React.useState([]);
    const [refRevisions, setRefRevisions] = React.useState({});
    const [machines, setMachines] = React.useState([]);
    // Bumpé pour forcer le rechargement de la liste des clients (import PDF,
    // retour sur l'onglet Clients) : les onglets restent montés donc la liste
    // ne se recharge pas d'elle-même.
    const [clientsRefresh, setClientsRefresh] = React.useState(0);

    const loadShared = React.useCallback(async () => {
        try {
            const [r, m] = await Promise.all([
                apiClient.get('/marketplace/board-stock'),
                apiClient.get('/marketplace/machine-models'),
            ]);
            const rows = Array.isArray(r.data) ? r.data : [];
            // Références distinctes (le board-stock renvoie une ligne par révision).
            const byId = new Map();
            const revs = {};
            rows.forEach((x) => {
                if (!byId.has(x.bom_reference_id)) byId.set(x.bom_reference_id, { id: x.bom_reference_id, label: formatCardLabel(x.reference, x.name), reference: x.reference, name: x.name || '' });
                if (x.revision) {
                    revs[x.bom_reference_id] = revs[x.bom_reference_id] || [];
                    if (!revs[x.bom_reference_id].includes(x.revision)) revs[x.bom_reference_id].push(x.revision);
                }
            });
            Object.values(revs).forEach((arr) => arr.sort());
            setRefs(Array.from(byId.values()));
            setRefRevisions(revs);
            setMachines(Array.isArray(m.data) ? m.data : []);
        } catch (e) { setError(e?.response?.data?.detail || 'Chargement des références / machines impossible.'); }
    }, []);

    React.useEffect(() => { loadShared(); }, [loadShared]);

    return (
        <Box>
            <PageHeader
                title="Commandes client / machine"
                subtitle="Clients, leurs commandes et machines, préparation de boîte. Catalogue de machines."
            />
            <Snackbar
                open={Boolean(error)}
                autoHideDuration={7000}
                onClose={() => setError(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity="error" variant="filled" onClose={() => setError(null)} sx={{ width: '100%' }}>{error}</Alert>
            </Snackbar>
            <Snackbar
                open={Boolean(success)}
                autoHideDuration={3000}
                onClose={() => setSuccess(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity="success" variant="filled" onClose={() => setSuccess(null)} sx={{ width: '100%' }}>{success}</Alert>
            </Snackbar>

            <Tabs value={tab} onChange={(_e, v) => { setTab(v); if (v === 0) setClientsRefresh((x) => x + 1); }} sx={{ mb: 2, borderBottom: `1px solid ${colors.border}` }}>
                <Tab label="Clients" />
                <Tab label="Machines" />
                <Tab label="Import commande PDF" />
            </Tabs>

            <Box sx={{ display: tab === 0 ? 'block' : 'none' }}>
                <ClientsTab refs={refs} refRevisions={refRevisions} machines={machines} setError={setError} setSuccess={setSuccess} onNeedRefresh={loadShared} refresh={clientsRefresh} />
            </Box>
            <Box sx={{ display: tab === 1 ? 'block' : 'none' }}>
                <MachinesTab refs={refs} refRevisions={refRevisions} setError={setError} setSuccess={setSuccess} onChanged={loadShared} />
            </Box>
            <Box sx={{ display: tab === 2 ? 'block' : 'none' }}>
                <ImportOrderTab refs={refs} setError={setError} onImported={() => { loadShared(); setClientsRefresh((x) => x + 1); }} />
            </Box>
        </Box>
    );
}

// ══════════════════════════ Onglet Clients ══════════════════════════
function ClientsTab({ refs, refRevisions, machines, setError, setSuccess, onNeedRefresh, refresh }) {
    const [clients, setClients] = React.useState(null);
    const [createOpen, setCreateOpen] = React.useState(false);
    const [detailId, setDetailId] = React.useState(null);

    const load = React.useCallback(async () => {
        try {
            const res = await apiClient.get('/marketplace/clients');
            setClients(Array.isArray(res.data) ? res.data : []);
        } catch (e) { setClients([]); }
    }, []);
    React.useEffect(() => { load(); }, [load, refresh]);

    return (
        <Box>
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
                <Button variant="contained" color="success" startIcon={<AddRoundedIcon />} onClick={() => setCreateOpen(true)}>Nouveau client</Button>
            </Stack>
            <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 1 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>Client</TableCell>
                            <TableCell>Contact</TableCell>
                            <TableCell align="right">Commandes actives</TableCell>
                            <TableCell align="right">Cartes à préparer</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {clients === null ? (
                            <TableRow><TableCell colSpan={4} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>Chargement…</TableCell></TableRow>
                        ) : clients.length === 0 ? (
                            <TableRow><TableCell colSpan={4} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>Aucun client. Crée-en un avec « Nouveau client ».</TableCell></TableRow>
                        ) : clients.map((c) => (
                            <TableRow key={c.id} hover onClick={() => setDetailId(c.id)} sx={{ cursor: 'pointer' }}>
                                <TableCell sx={{ fontWeight: 600 }}>{c.name}</TableCell>
                                <TableCell sx={{ color: colors.textSecondary }}>{c.contact || '—'}</TableCell>
                                <TableCell align="right">{c.active_order_count}</TableCell>
                                <TableCell align="right">
                                    {c.cards_to_prepare > 0 ? <Chip size="small" label={c.cards_to_prepare} color="warning" /> : '—'}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <CreateClientDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={async () => { setCreateOpen(false); await load(); }} setError={setError} setSuccess={setSuccess} />
            <ClientDetailDialog
                clientId={detailId}
                refs={refs}
                refRevisions={refRevisions}
                machines={machines}
                onClose={() => setDetailId(null)}
                onChanged={async () => { await load(); await onNeedRefresh(); }}
                setError={setError}
                setSuccess={setSuccess}
            />
        </Box>
    );
}

function CreateClientDialog({ open, onClose, onCreated, setError, setSuccess }) {
    const [name, setName] = React.useState('');
    const [contact, setContact] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    React.useEffect(() => { if (open) { setName(''); setContact(''); } }, [open]);
    const submit = async () => {
        setSaving(true);
        try { await apiClient.post('/marketplace/clients', { name: name.trim(), contact: contact.trim() || null }); if (setSuccess) setSuccess('Client créé.'); onCreated(); }
        catch (e) { setError(e?.response?.data?.detail || 'Création client impossible.'); }
        finally { setSaving(false); }
    };
    return (
        <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="xs" fullWidth>
            <DialogTitle>Nouveau client</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ mt: 0.5 }}>
                    <TextField autoFocus fullWidth size="small" label="Nom du client" value={name} onChange={(e) => setName(e.target.value)} />
                    <TextField fullWidth size="small" label="Contact (optionnel)" value={contact} onChange={(e) => setContact(e.target.value)} />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose} disabled={saving}>Annuler</Button>
                <Button variant="contained" color="success" onClick={submit} disabled={saving || !name.trim()}>Créer</Button>
            </DialogActions>
        </Dialog>
    );
}

function ClientDetailDialog({ clientId, refs, refRevisions, machines, onClose, onChanged, setError, setSuccess }) {
    const [data, setData] = React.useState(null);
    const [busy, setBusy] = React.useState(false);
    const [newOrderOpen, setNewOrderOpen] = React.useState(false);
    const [confirm, setConfirm] = React.useState(null); // { title, message, run }

    const load = React.useCallback(async () => {
        if (!clientId) { setData(null); return; }
        try { const res = await apiClient.get(`/marketplace/clients/${clientId}/detail`); setData(res.data); }
        catch (e) { setError(e?.response?.data?.detail || 'Chargement du client impossible.'); }
    }, [clientId, setError]);
    React.useEffect(() => { load(); }, [load]);

    const call = async (fn) => {
        setBusy(true);
        try { await fn(); await load(); await onChanged(); }
        catch (e) { setError(e?.response?.data?.detail || 'Action impossible.'); }
        finally { setBusy(false); }
    };
    const prepare = (orderId, lineId, qty) => call(() => apiClient.post(`/marketplace/client-orders/${orderId}/prepare`, { line_id: lineId, qty }));
    const setStatus = (orderId, status) => call(() => apiClient.put(`/marketplace/client-orders/${orderId}`, { status }));
    const removeOrder = (orderId) => call(async () => { await apiClient.delete(`/marketplace/client-orders/${orderId}`); if (setSuccess) setSuccess('Commande supprimée.'); });
    const removeClient = () => call(async () => { await apiClient.delete(`/marketplace/clients/${clientId}`); onClose(); if (setSuccess) setSuccess('Client supprimé.'); });
    const askRemoveOrder = (order) => setConfirm({ title: 'Supprimer la commande', message: `Supprimer la commande « ${order.label} » ? Cette action est irréversible.`, run: () => removeOrder(order.id) });
    const askRemoveClient = () => setConfirm({ title: 'Supprimer le client', message: `Supprimer le client « ${data?.name || ''} » et ses ${(data?.orders || []).length} commande(s) ? Cette action est irréversible.`, run: removeClient });

    const allOrders = data?.orders || [];
    const activeOrders = allOrders.filter((o) => o.status !== 'DELIVERED');
    const deliveredOrders = allOrders.filter((o) => o.status === 'DELIVERED');
    const fmtDate = (iso) => {
        if (!iso) return '—';
        try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
        catch (_) { return '—'; }
    };

    return (
        <Dialog open={Boolean(clientId)} onClose={() => !busy && onClose()} maxWidth="md" fullWidth>
            <DialogTitle>
                {data?.name || 'Client'}
                {data?.contact ? <Typography variant="body2" sx={{ color: colors.textSecondary }}>{data.contact}</Typography> : null}
            </DialogTitle>
            <DialogContent dividers>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2">Commandes & machines</Typography>
                    <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setNewOrderOpen(true)}>Nouvelle commande / machine</Button>
                </Stack>

                {activeOrders.length === 0 ? (
                    <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 2 }}>Aucune commande en cours pour ce client.</Typography>
                ) : (activeOrders.map((order) => (
                    <Accordion key={order.id} disableGutters sx={{ backgroundColor: 'transparent', border: `1px solid ${colors.border}`, mb: 1 }}>
                        <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }} flexWrap="wrap" useFlexGap>
                                <Chip size="small" label={order.order_type === 'MACHINE' ? 'Machine' : 'Commande'} variant="outlined" />
                                <Typography sx={{ fontWeight: 600 }}>{order.label}</Typography>
                                {order.external_reference ? <Chip size="small" label={`Bon ${order.external_reference}`} variant="outlined" sx={{ color: colors.textSecondary }} /> : null}
                                <Chip size="small" label={STATUS_LABELS[order.status] || order.status} color={STATUS_COLOR[order.status] || 'default'} />
                                <Box sx={{ flex: 1 }} />
                                <Typography variant="body2" sx={{ color: colors.textSecondary }}>{order.total_prepared}/{order.total_quantity} préparées</Typography>
                            </Stack>
                        </AccordionSummary>
                        <AccordionDetails>
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
                                            <TableCell>
                                                {line.reference}
                                                {line.revision ? <Chip size="small" label={line.revision} variant="outlined" sx={{ ml: 0.75 }} /> : null}
                                            </TableCell>
                                            <TableCell align="right">{line.quantity}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 600 }}>{line.quantity_prepared}</TableCell>
                                            <TableCell align="center">
                                                <Button size="small" disabled={busy || line.quantity_prepared <= 0} onClick={() => prepare(order.id, line.id, -1)}>−</Button>
                                                <Button size="small" disabled={busy || line.remaining <= 0} onClick={() => prepare(order.id, line.id, 1)}>+</Button>
                                                <Button size="small" disabled={busy || line.remaining <= 0} onClick={() => prepare(order.id, line.id, line.remaining)}>Tout</Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 1 }}>
                                {order.status !== 'DELIVERED' && <Button size="small" color="success" disabled={busy} onClick={() => setStatus(order.id, 'DELIVERED')}>Marquer livrée</Button>}
                                <Button size="small" color="error" disabled={busy} onClick={() => askRemoveOrder(order)}>Supprimer</Button>
                            </Stack>
                        </AccordionDetails>
                    </Accordion>
                )))}

                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Toutes les cartes à préparer</Typography>
                {(data?.cards_to_prepare || []).length === 0 ? (
                    <Typography variant="body2" sx={{ color: colors.textSecondary }}>Rien à préparer.</Typography>
                ) : (
                    <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 1 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Carte</TableCell>
                                    <TableCell align="right">À préparer</TableCell>
                                    <TableCell align="right">En stock</TableCell>
                                    <TableCell align="right">Manque</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {data.cards_to_prepare.map((c) => (
                                    <TableRow key={`${c.bom_reference_id}::${c.revision || ''}`}>
                                        <TableCell>
                                            {c.reference}
                                            {c.revision ? <Chip size="small" label={c.revision} variant="outlined" sx={{ ml: 0.75 }} /> : null}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600 }}>{c.to_prepare}</TableCell>
                                        <TableCell align="right" sx={{ color: colors.textSecondary }}>{c.in_stock}</TableCell>
                                        <TableCell align="right" sx={{ color: c.shortage > 0 ? '#f59e0b' : colors.textSecondary, fontWeight: c.shortage > 0 ? 700 : 400 }}>{c.shortage > 0 ? c.shortage : '—'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}

                <Divider sx={{ my: 2 }} />
                <Accordion disableGutters sx={{ backgroundColor: 'transparent', border: `1px solid ${colors.border}` }}>
                    <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                        <Typography variant="subtitle2">
                            Historique des commandes livrées{deliveredOrders.length ? ` (${deliveredOrders.length})` : ''}
                        </Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        {deliveredOrders.length === 0 ? (
                            <Typography variant="body2" sx={{ color: colors.textSecondary }}>Aucune commande livrée pour l'instant.</Typography>
                        ) : (
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Commande / machine</TableCell>
                                        <TableCell align="right">Cartes</TableCell>
                                        <TableCell align="right">Livrée le</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {deliveredOrders.map((order) => (
                                        <TableRow key={order.id}>
                                            <TableCell>
                                                <Chip size="small" label={order.order_type === 'MACHINE' ? 'Machine' : 'Commande'} variant="outlined" sx={{ mr: 0.75 }} />
                                                {order.label}
                                            </TableCell>
                                            <TableCell align="right">{order.total_quantity}</TableCell>
                                            <TableCell align="right" sx={{ color: colors.textSecondary }}>{fmtDate(order.delivered_at)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </AccordionDetails>
                </Accordion>
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between' }}>
                <Button color="error" onClick={askRemoveClient} disabled={busy}>Supprimer le client</Button>
                <Button color="inherit" onClick={onClose} disabled={busy}>Fermer</Button>
            </DialogActions>

            <ConfirmDialog
                open={Boolean(confirm)}
                title={confirm?.title || ''}
                message={confirm?.message || ''}
                confirmLabel="Supprimer"
                onConfirm={() => { const r = confirm?.run; setConfirm(null); if (r) r(); }}
                onClose={() => setConfirm(null)}
            />
            <NewOrderDialog
                open={newOrderOpen}
                clientId={clientId}
                refs={refs}
                refRevisions={refRevisions}
                machines={machines}
                onClose={() => setNewOrderOpen(false)}
                onCreated={async () => { setNewOrderOpen(false); await load(); await onChanged(); }}
                setError={setError}
            />
        </Dialog>
    );
}

function NewOrderDialog({ open, clientId, refs, refRevisions, machines, onClose, onCreated, setError }) {
    const [type, setType] = React.useState('CLIENT');
    const [machine, setMachine] = React.useState(null);
    const [count, setCount] = React.useState('1');
    const [lines, setLines] = React.useState([{ ref: null, revision: '', qty: '1' }]);
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => { if (open) { setType('CLIENT'); setMachine(null); setCount('1'); setLines([{ ref: null, revision: '', qty: '1' }]); } }, [open]);

    const setLine = (i, patch) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

    const submit = async () => {
        setSaving(true);
        try {
            const body = { order_type: type, client_id: clientId };
            if (type === 'MACHINE') {
                body.machine_model_id = machine?.id;
                body.machine_count = Math.max(parseInt(count, 10) || 1, 1);
            } else {
                body.lines = lines.filter((l) => l.ref && (parseInt(l.qty, 10) || 0) > 0).map((l) => ({ bom_reference_id: l.ref.id, revision: l.revision || '', quantity: parseInt(l.qty, 10) || 0 }));
            }
            await apiClient.post('/marketplace/client-orders', body);
            onCreated();
        } catch (e) { setError(e?.response?.data?.detail || 'Création impossible.'); }
        finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
            <DialogTitle>Nouvelle commande / machine</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ mt: 0.5 }}>
                    <TextField select size="small" label="Type" value={type} onChange={(e) => setType(e.target.value)} sx={{ maxWidth: 220 }}>
                        <MenuItem value="CLIENT">Commande de cartes</MenuItem>
                        <MenuItem value="MACHINE">Machine (catalogue)</MenuItem>
                    </TextField>

                    {type === 'MACHINE' ? (
                        <Stack direction="row" spacing={2}>
                            <Autocomplete
                                size="small" sx={{ flex: 1 }} options={machines} value={machine}
                                onChange={(_e, v) => setMachine(v)}
                                getOptionLabel={(o) => (o ? `${o.name} (${o.total_cards} cartes)` : '')}
                                isOptionEqualToValue={(o, v) => o.id === v.id}
                                renderInput={(params) => <TextField {...params} label="Modèle de machine" />}
                            />
                            <TextField size="small" type="number" label="Nb machines" value={count} onChange={(e) => setCount(e.target.value)} inputProps={{ min: 1 }} sx={{ width: 110 }} />
                        </Stack>
                    ) : (
                        <>
                            <Typography variant="subtitle2">Cartes demandées</Typography>
                            {lines.map((l, i) => {
                                const revOptions = (l.ref && refRevisions?.[l.ref.id]) || [];
                                return (
                                <Stack key={i} direction="row" spacing={1} alignItems="center">
                                    <Autocomplete
                                        size="small" sx={{ flex: 1 }} options={refs} value={l.ref}
                                        onChange={(_e, v) => setLine(i, { ref: v, revision: '' })}
                                        getOptionLabel={(o) => o?.label || ''}
                                        isOptionEqualToValue={(o, v) => o.id === v.id}
                                        renderInput={(params) => <TextField {...params} label="Référence carte" />}
                                    />
                                    <TextField
                                        select size="small" label="Rév." value={l.revision}
                                        onChange={(e) => setLine(i, { revision: e.target.value })}
                                        disabled={revOptions.length === 0} sx={{ width: 110 }}
                                    >
                                        <MenuItem value="">—</MenuItem>
                                        {revOptions.map((rev) => <MenuItem key={rev} value={rev}>{rev}</MenuItem>)}
                                    </TextField>
                                    <TextField size="small" type="number" label="Qté" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} inputProps={{ min: 1 }} sx={{ width: 90 }} />
                                    <IconButton size="small" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} disabled={lines.length <= 1}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                                </Stack>
                                );
                            })}
                            <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setLines((p) => [...p, { ref: null, revision: '', qty: '1' }])}>Ajouter une carte</Button>
                        </>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose} disabled={saving}>Annuler</Button>
                <Button variant="contained" color="success" onClick={submit} disabled={saving || (type === 'MACHINE' && !machine)}>Créer</Button>
            </DialogActions>
        </Dialog>
    );
}

// ══════════════════════════ Onglet Machines ══════════════════════════
function MachinesTab({ refs, refRevisions, setError, setSuccess, onChanged }) {
    const [models, setModels] = React.useState(null);
    const [editing, setEditing] = React.useState(null); // {id?...} ou 'new'

    const load = React.useCallback(async () => {
        try { const res = await apiClient.get('/marketplace/machine-models'); setModels(Array.isArray(res.data) ? res.data : []); }
        catch (e) { setModels([]); }
    }, []);
    React.useEffect(() => { load(); }, [load]);

    return (
        <Box>
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
                <Button variant="contained" color="success" startIcon={<AddRoundedIcon />} onClick={() => setEditing('new')}>Nouvelle machine</Button>
            </Stack>
            <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 1 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>Machine</TableCell>
                            <TableCell align="right">Types de carte</TableCell>
                            <TableCell align="right">Total cartes</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {models === null ? (
                            <TableRow><TableCell colSpan={3} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>Chargement…</TableCell></TableRow>
                        ) : models.length === 0 ? (
                            <TableRow><TableCell colSpan={3} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>Aucune machine. Crée un modèle avec « Nouvelle machine ».</TableCell></TableRow>
                        ) : models.map((m) => (
                            <TableRow key={m.id} hover onClick={() => setEditing(m)} sx={{ cursor: 'pointer' }}>
                                <TableCell sx={{ fontWeight: 600 }}>{m.name}</TableCell>
                                <TableCell align="right">{m.card_types}</TableCell>
                                <TableCell align="right">{m.total_cards}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <MachineEditDialog
                model={editing}
                refs={refs}
                refRevisions={refRevisions}
                onClose={() => setEditing(null)}
                onSaved={async () => { setEditing(null); await load(); await onChanged(); }}
                setError={setError}
                setSuccess={setSuccess}
            />
        </Box>
    );
}

function MachineEditDialog({ model, refs, refRevisions, onClose, onSaved, setError, setSuccess }) {
    const isNew = model === 'new';
    const open = Boolean(model);
    const [confirmDel, setConfirmDel] = React.useState(false);
    const [name, setName] = React.useState('');
    const [cards, setCards] = React.useState([{ ref: null, revision: '', qty: '1' }]);
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        if (!open) return;
        if (isNew) { setName(''); setCards([{ ref: null, revision: '', qty: '1' }]); }
        else {
            setName(model.name || '');
            const existing = (model.cards || []).map((c) => ({ ref: { id: c.bom_reference_id, label: c.reference }, revision: c.revision || '', qty: String(c.quantity) }));
            setCards(existing.length ? existing : [{ ref: null, revision: '', qty: '1' }]);
        }
    }, [open, isNew, model]);

    const setCard = (i, patch) => setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

    const submit = async () => {
        setSaving(true);
        const payload = {
            name: name.trim(),
            cards: cards.filter((c) => c.ref && (parseInt(c.qty, 10) || 0) > 0).map((c) => ({ bom_reference_id: c.ref.id, revision: c.revision || '', quantity: parseInt(c.qty, 10) || 0 })),
        };
        try {
            if (isNew) await apiClient.post('/marketplace/machine-models', payload);
            else await apiClient.put(`/marketplace/machine-models/${model.id}`, payload);
            if (setSuccess) setSuccess(isNew ? 'Machine créée.' : 'Machine enregistrée.');
            onSaved();
        } catch (e) { setError(e?.response?.data?.detail || 'Enregistrement machine impossible.'); }
        finally { setSaving(false); }
    };

    const remove = async () => {
        setSaving(true);
        try { await apiClient.delete(`/marketplace/machine-models/${model.id}`); if (setSuccess) setSuccess('Machine supprimée.'); onSaved(); }
        catch (e) { setError(e?.response?.data?.detail || 'Suppression impossible.'); }
        finally { setSaving(false); }
    };

    return (
        <>
        <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
            <DialogTitle>{isNew ? 'Nouvelle machine' : model?.name}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ mt: 0.5 }}>
                    <TextField autoFocus fullWidth size="small" label="Nom de la machine" value={name} onChange={(e) => setName(e.target.value)} />
                    <Divider />
                    <Typography variant="subtitle2">Cartes composant la machine</Typography>
                    {cards.map((c, i) => {
                        const revOptions = (c.ref && refRevisions?.[c.ref.id]) || [];
                        return (
                        <Stack key={i} direction="row" spacing={1} alignItems="center">
                            <Autocomplete
                                size="small" sx={{ flex: 1 }} options={refs} value={c.ref}
                                onChange={(_e, v) => setCard(i, { ref: v, revision: '' })}
                                getOptionLabel={(o) => o?.label || ''}
                                isOptionEqualToValue={(o, v) => o.id === v.id}
                                renderInput={(params) => <TextField {...params} label="Référence carte" />}
                            />
                            <TextField
                                select size="small" label="Rév." value={c.revision}
                                onChange={(e) => setCard(i, { revision: e.target.value })}
                                disabled={revOptions.length === 0} sx={{ width: 110 }}
                            >
                                <MenuItem value="">—</MenuItem>
                                {revOptions.map((rev) => <MenuItem key={rev} value={rev}>{rev}</MenuItem>)}
                            </TextField>
                            <TextField size="small" type="number" label="Qté" value={c.qty} onChange={(e) => setCard(i, { qty: e.target.value })} inputProps={{ min: 1 }} sx={{ width: 90 }} />
                            <IconButton size="small" onClick={() => setCards((p) => p.filter((_, idx) => idx !== i))} disabled={cards.length <= 1}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                        </Stack>
                        );
                    })}
                    <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setCards((p) => [...p, { ref: null, revision: '', qty: '1' }])}>Ajouter une carte</Button>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between' }}>
                <Box>{!isNew && <Button color="error" onClick={() => setConfirmDel(true)} disabled={saving}>Supprimer</Button>}</Box>
                <Box>
                    <Button color="inherit" onClick={onClose} disabled={saving}>Annuler</Button>
                    <Button variant="contained" color="success" onClick={submit} disabled={saving || !name.trim()}>Enregistrer</Button>
                </Box>
            </DialogActions>
        </Dialog>
        <ConfirmDialog
            open={confirmDel}
            title="Supprimer la machine"
            message={`Supprimer le modèle machine « ${model?.name || ''} » ? Cette action est irréversible.`}
            confirmLabel="Supprimer"
            onConfirm={() => { setConfirmDel(false); remove(); }}
            onClose={() => setConfirmDel(false)}
        />
        </>
    );
}

// ══════════════════════════ Onglet Import commande PDF ══════════════════════════
function ImportOrderTab({ refs, setError, onImported }) {
    const [preview, setPreview] = React.useState(null);
    const [clientName, setClientName] = React.useState('');
    const [maps, setMaps] = React.useState({}); // part_number -> {id, label} (mapping manuel)
    const [busy, setBusy] = React.useState(false);
    const [done, setDone] = React.useState(null);
    const [drag, setDrag] = React.useState(false);
    const fileRef = React.useRef(null);

    const reset = () => { setPreview(null); setClientName(''); setMaps({}); setDone(null); };

    const handleDrop = (e) => {
        e.preventDefault();
        setDrag(false);
        if (busy) return;
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            setError('Merci de déposer un fichier PDF.');
            return;
        }
        upload(file);
    };

    const upload = async (file) => {
        if (!file) return;
        setBusy(true); setError(null); setDone(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await apiClient.post('/marketplace/client-orders/import-pdf', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setPreview(res.data);
            setClientName(res.data.client_name || '');
            setMaps({});
        } catch (e) {
            setError(e?.response?.data?.detail || 'Import du PDF impossible.');
        } finally {
            setBusy(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const commit = async () => {
        setBusy(true); setError(null);
        try {
            const lines = [];
            const mappings = [];
            (preview.matched || []).forEach((m) => lines.push({ bom_reference_id: m.bom_reference_id, revision: m.revision || '', quantity: m.quantity }));
            (preview.unmatched || []).forEach((u) => {
                const chosen = maps[u.part_number];
                if (chosen) {
                    lines.push({ bom_reference_id: chosen.id, revision: u.revision || '', quantity: u.quantity });
                    mappings.push({ part_number: u.part_number, bom_reference_id: chosen.id });
                }
            });
            const res = await apiClient.post('/marketplace/client-orders/import-pdf/commit', {
                client_name: clientName.trim(),
                lines,
                mappings,
                order_reference: preview.order_reference || null,
            });
            setDone(res.data);
            setPreview(null);
            await onImported();
        } catch (e) {
            setError(e?.response?.data?.detail || 'Création de la commande impossible.');
        } finally {
            setBusy(false);
        }
    };

    const matchedCount = preview?.matched?.length || 0;
    const mappedCount = Object.values(maps).filter(Boolean).length;

    return (
        <Box>
            <Box
                onDragOver={(e) => { e.preventDefault(); if (!drag) setDrag(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
                onDrop={handleDrop}
                sx={{
                    mb: 2,
                    p: 3,
                    borderRadius: 1,
                    border: `2px dashed ${drag ? colors.primary || '#22c55e' : colors.border}`,
                    backgroundColor: drag ? 'rgba(34,197,94,0.08)' : 'transparent',
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                }}
            >
                <Typography variant="body1" sx={{ mb: 1.5, color: colors.textSecondary }}>
                    {busy ? 'Lecture du PDF…' : 'Glisse-dépose un PDF de commande ici'}
                </Typography>
                <Stack direction="row" spacing={2} alignItems="center" justifyContent="center">
                    <Button variant="contained" component="label" disabled={busy}>
                        Choisir un PDF de commande
                        <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => upload(e.target.files?.[0])} />
                    </Button>
                    {preview ? <Button color="inherit" onClick={reset} disabled={busy}>Réinitialiser</Button> : null}
                </Stack>
            </Box>

            {done ? (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setDone(null)}>
                    Commande {done.reference} créée pour « {done.recipient || done.label} » ({done.total_quantity} carte(s)).
                </Alert>
            ) : null}

            {!preview ? (
                !done ? <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                    Glisse un bon de commande PDF : les cartes qu'on produit (reconnues par leur code) sont extraites avec leur révision et quantité, le client est détecté, et tu crées la commande.
                </Typography> : null
            ) : (
                <Stack spacing={2}>
                    {preview.order_reference ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" sx={{ color: colors.textSecondary }}>Bon de commande :</Typography>
                            <Chip size="small" label={preview.order_reference} variant="outlined" />
                        </Stack>
                    ) : null}
                    {preview.already_imported ? (
                        <Alert severity="warning" variant="outlined">
                            Ce bon ({preview.order_reference}) a déjà été importé (commande {preview.already_imported_as}). Tu peux quand même le recréer si besoin.
                        </Alert>
                    ) : null}
                    <TextField size="small" label="Client" value={clientName} onChange={(e) => setClientName(e.target.value)} sx={{ maxWidth: 320 }} helperText="Détecté depuis le PDF, modifiable. Créé s'il n'existe pas." />

                    <Typography variant="subtitle2">Cartes reconnues ({matchedCount})</Typography>
                    <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 1 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Code</TableCell>
                                    <TableCell>Carte</TableCell>
                                    <TableCell>Rév.</TableCell>
                                    <TableCell align="right">Qté</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {matchedCount === 0 ? (
                                    <TableRow><TableCell colSpan={4} sx={{ color: colors.textSecondary }}>Aucune carte reconnue. Mappe les codes ci-dessous.</TableCell></TableRow>
                                ) : preview.matched.map((m) => (
                                    <TableRow key={m.part_number}>
                                        <TableCell>{m.part_number}</TableCell>
                                        <TableCell>{m.reference}</TableCell>
                                        <TableCell>{m.revision ? <Chip size="small" label={m.revision} variant="outlined" /> : '—'}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 600 }}>{m.quantity}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    {(preview.unmatched || []).length ? (
                        <>
                            <Typography variant="subtitle2">
                                Codes non reconnus ({preview.unmatched.length}) — mappe ceux qui sont des cartes qu'on produit
                            </Typography>
                            <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 1 }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Code PDF</TableCell>
                                            <TableCell>Nom PDF</TableCell>
                                            <TableCell>Rév.</TableCell>
                                            <TableCell align="right">Qté</TableCell>
                                            <TableCell>Rattacher à…</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {preview.unmatched.map((u) => (
                                            <TableRow key={u.part_number}>
                                                <TableCell>{u.part_number}</TableCell>
                                                <TableCell sx={{ color: colors.textSecondary }}>{u.name}</TableCell>
                                                <TableCell>{u.revision ? <Chip size="small" label={u.revision} variant="outlined" /> : '—'}</TableCell>
                                                <TableCell align="right">{u.quantity}</TableCell>
                                                <TableCell sx={{ minWidth: 260 }}>
                                                    <Autocomplete
                                                        size="small" options={refs} value={maps[u.part_number] || null}
                                                        onChange={(_e, v) => setMaps((p) => ({ ...p, [u.part_number]: v }))}
                                                        getOptionLabel={(o) => o?.label || ''}
                                                        isOptionEqualToValue={(o, v) => o.id === v.id}
                                                        renderInput={(params) => <TextField {...params} placeholder="Ignorer / choisir une carte" />}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                                Le code d'une carte mappée est mémorisé : au prochain PDF elle sera reconnue automatiquement. Les codes laissés vides sont ignorés (non produits).
                            </Typography>
                        </>
                    ) : null}

                    <Stack direction="row" justifyContent="flex-end">
                        <Button variant="contained" color="success" onClick={commit} disabled={busy || !clientName.trim() || (matchedCount + mappedCount) === 0}>
                            Créer la commande ({matchedCount + mappedCount} carte(s))
                        </Button>
                    </Stack>
                </Stack>
            )}
        </Box>
    );
}

export default ClientOrdersPage;
