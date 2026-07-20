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
import { colors } from '../theme';

const STATUS_LABELS = { OPEN: 'Ouverte', READY: 'Prête', DELIVERED: 'Livrée', CANCELLED: 'Annulée' };
const STATUS_COLOR = { OPEN: 'warning', READY: 'success', DELIVERED: 'default', CANCELLED: 'error' };

function ClientOrdersPage() {
    const [tab, setTab] = React.useState(0);
    const [error, setError] = React.useState(null);
    const [refs, setRefs] = React.useState([]);
    const [machines, setMachines] = React.useState([]);

    const loadShared = React.useCallback(async () => {
        try {
            const [r, m] = await Promise.all([
                apiClient.get('/marketplace/board-stock'),
                apiClient.get('/marketplace/machine-models'),
            ]);
            setRefs((Array.isArray(r.data) ? r.data : []).map((x) => ({ id: x.bom_reference_id, label: x.reference })));
            setMachines(Array.isArray(m.data) ? m.data : []);
        } catch (e) { /* ignore */ }
    }, []);

    React.useEffect(() => { loadShared(); }, [loadShared]);

    return (
        <Box>
            <PageHeader
                title="Commandes client / machine"
                subtitle="Clients, leurs commandes et machines, préparation de boîte. Catalogue de machines."
            />
            {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert> : null}

            <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2, borderBottom: `1px solid ${colors.border}` }}>
                <Tab label="Clients" />
                <Tab label="Machines" />
            </Tabs>

            <Box sx={{ display: tab === 0 ? 'block' : 'none' }}>
                <ClientsTab refs={refs} machines={machines} setError={setError} onNeedRefresh={loadShared} />
            </Box>
            <Box sx={{ display: tab === 1 ? 'block' : 'none' }}>
                <MachinesTab refs={refs} setError={setError} onChanged={loadShared} />
            </Box>
        </Box>
    );
}

// ══════════════════════════ Onglet Clients ══════════════════════════
function ClientsTab({ refs, machines, setError, onNeedRefresh }) {
    const [clients, setClients] = React.useState(null);
    const [createOpen, setCreateOpen] = React.useState(false);
    const [detailId, setDetailId] = React.useState(null);

    const load = React.useCallback(async () => {
        try {
            const res = await apiClient.get('/marketplace/clients');
            setClients(Array.isArray(res.data) ? res.data : []);
        } catch (e) { setClients([]); }
    }, []);
    React.useEffect(() => { load(); }, [load]);

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

            <CreateClientDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={async () => { setCreateOpen(false); await load(); }} setError={setError} />
            <ClientDetailDialog
                clientId={detailId}
                refs={refs}
                machines={machines}
                onClose={() => setDetailId(null)}
                onChanged={async () => { await load(); await onNeedRefresh(); }}
                setError={setError}
            />
        </Box>
    );
}

function CreateClientDialog({ open, onClose, onCreated, setError }) {
    const [name, setName] = React.useState('');
    const [contact, setContact] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    React.useEffect(() => { if (open) { setName(''); setContact(''); } }, [open]);
    const submit = async () => {
        setSaving(true);
        try { await apiClient.post('/marketplace/clients', { name: name.trim(), contact: contact.trim() || null }); onCreated(); }
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

function ClientDetailDialog({ clientId, refs, machines, onClose, onChanged, setError }) {
    const [data, setData] = React.useState(null);
    const [busy, setBusy] = React.useState(false);
    const [newOrderOpen, setNewOrderOpen] = React.useState(false);

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
    const removeOrder = (orderId) => call(() => apiClient.delete(`/marketplace/client-orders/${orderId}`));
    const removeClient = () => call(async () => { await apiClient.delete(`/marketplace/clients/${clientId}`); onClose(); });

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
                                            <TableCell>{line.reference}</TableCell>
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
                                <Button size="small" color="error" disabled={busy} onClick={() => removeOrder(order.id)}>Supprimer</Button>
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
                                    <TableRow key={c.bom_reference_id}>
                                        <TableCell>{c.reference}</TableCell>
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
                <Button color="error" onClick={removeClient} disabled={busy}>Supprimer le client</Button>
                <Button color="inherit" onClick={onClose} disabled={busy}>Fermer</Button>
            </DialogActions>

            <NewOrderDialog
                open={newOrderOpen}
                clientId={clientId}
                refs={refs}
                machines={machines}
                onClose={() => setNewOrderOpen(false)}
                onCreated={async () => { setNewOrderOpen(false); await load(); await onChanged(); }}
                setError={setError}
            />
        </Dialog>
    );
}

function NewOrderDialog({ open, clientId, refs, machines, onClose, onCreated, setError }) {
    const [type, setType] = React.useState('CLIENT');
    const [machine, setMachine] = React.useState(null);
    const [count, setCount] = React.useState('1');
    const [lines, setLines] = React.useState([{ ref: null, qty: '1' }]);
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => { if (open) { setType('CLIENT'); setMachine(null); setCount('1'); setLines([{ ref: null, qty: '1' }]); } }, [open]);

    const setLine = (i, patch) => setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

    const submit = async () => {
        setSaving(true);
        try {
            const body = { order_type: type, client_id: clientId };
            if (type === 'MACHINE') {
                body.machine_model_id = machine?.id;
                body.machine_count = Math.max(parseInt(count, 10) || 1, 1);
            } else {
                body.lines = lines.filter((l) => l.ref && (parseInt(l.qty, 10) || 0) > 0).map((l) => ({ bom_reference_id: l.ref.id, quantity: parseInt(l.qty, 10) || 0 }));
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
                            {lines.map((l, i) => (
                                <Stack key={i} direction="row" spacing={1} alignItems="center">
                                    <Autocomplete
                                        size="small" sx={{ flex: 1 }} options={refs} value={l.ref}
                                        onChange={(_e, v) => setLine(i, { ref: v })}
                                        getOptionLabel={(o) => o?.label || ''}
                                        isOptionEqualToValue={(o, v) => o.id === v.id}
                                        renderInput={(params) => <TextField {...params} label="Référence carte" />}
                                    />
                                    <TextField size="small" type="number" label="Qté" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} inputProps={{ min: 1 }} sx={{ width: 90 }} />
                                    <IconButton size="small" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} disabled={lines.length <= 1}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                                </Stack>
                            ))}
                            <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setLines((p) => [...p, { ref: null, qty: '1' }])}>Ajouter une carte</Button>
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
function MachinesTab({ refs, setError, onChanged }) {
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
                onClose={() => setEditing(null)}
                onSaved={async () => { setEditing(null); await load(); await onChanged(); }}
                setError={setError}
            />
        </Box>
    );
}

function MachineEditDialog({ model, refs, onClose, onSaved, setError }) {
    const isNew = model === 'new';
    const open = Boolean(model);
    const [name, setName] = React.useState('');
    const [cards, setCards] = React.useState([{ ref: null, qty: '1' }]);
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        if (!open) return;
        if (isNew) { setName(''); setCards([{ ref: null, qty: '1' }]); }
        else {
            setName(model.name || '');
            const existing = (model.cards || []).map((c) => ({ ref: { id: c.bom_reference_id, label: c.reference }, qty: String(c.quantity) }));
            setCards(existing.length ? existing : [{ ref: null, qty: '1' }]);
        }
    }, [open, isNew, model]);

    const setCard = (i, patch) => setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

    const submit = async () => {
        setSaving(true);
        const payload = {
            name: name.trim(),
            cards: cards.filter((c) => c.ref && (parseInt(c.qty, 10) || 0) > 0).map((c) => ({ bom_reference_id: c.ref.id, quantity: parseInt(c.qty, 10) || 0 })),
        };
        try {
            if (isNew) await apiClient.post('/marketplace/machine-models', payload);
            else await apiClient.put(`/marketplace/machine-models/${model.id}`, payload);
            onSaved();
        } catch (e) { setError(e?.response?.data?.detail || 'Enregistrement machine impossible.'); }
        finally { setSaving(false); }
    };

    const remove = async () => {
        setSaving(true);
        try { await apiClient.delete(`/marketplace/machine-models/${model.id}`); onSaved(); }
        catch (e) { setError(e?.response?.data?.detail || 'Suppression impossible.'); }
        finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="sm" fullWidth>
            <DialogTitle>{isNew ? 'Nouvelle machine' : model?.name}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ mt: 0.5 }}>
                    <TextField autoFocus fullWidth size="small" label="Nom de la machine" value={name} onChange={(e) => setName(e.target.value)} />
                    <Divider />
                    <Typography variant="subtitle2">Cartes composant la machine</Typography>
                    {cards.map((c, i) => (
                        <Stack key={i} direction="row" spacing={1} alignItems="center">
                            <Autocomplete
                                size="small" sx={{ flex: 1 }} options={refs} value={c.ref}
                                onChange={(_e, v) => setCard(i, { ref: v })}
                                getOptionLabel={(o) => o?.label || ''}
                                isOptionEqualToValue={(o, v) => o.id === v.id}
                                renderInput={(params) => <TextField {...params} label="Référence carte" />}
                            />
                            <TextField size="small" type="number" label="Qté" value={c.qty} onChange={(e) => setCard(i, { qty: e.target.value })} inputProps={{ min: 1 }} sx={{ width: 90 }} />
                            <IconButton size="small" onClick={() => setCards((p) => p.filter((_, idx) => idx !== i))} disabled={cards.length <= 1}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                        </Stack>
                    ))}
                    <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setCards((p) => [...p, { ref: null, qty: '1' }])}>Ajouter une carte</Button>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between' }}>
                <Box>{!isNew && <Button color="error" onClick={remove} disabled={saving}>Supprimer</Button>}</Box>
                <Box>
                    <Button color="inherit" onClick={onClose} disabled={saving}>Annuler</Button>
                    <Button variant="contained" color="success" onClick={submit} disabled={saving || !name.trim()}>Enregistrer</Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}

export default ClientOrdersPage;
