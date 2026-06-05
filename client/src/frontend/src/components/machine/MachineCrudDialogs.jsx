import React, { useEffect, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import apiClient from '../../api/client';
import { cartKindOptions, extractRequestError } from '../../utils/machinePnp';

const NOZZLE_TYPE_OPTIONS = [501, 502, 503, 504, 505];
const NOZZLE_DEFAULT_CYCLE = [503, 504, 505];

/** Layout nozzle calé sur `count` : reprend la source, complète par le défaut 503/504/505. */
function buildNozzleLayout(source, count) {
    const total = Number.isInteger(count) && count > 0 ? count : 0;
    return Array.from({ length: total }, (_value, index) => {
        const candidate = source && Number(source[index]);
        return NOZZLE_TYPE_OPTIONS.includes(candidate) ? candidate : NOZZLE_DEFAULT_CYCLE[index % NOZZLE_DEFAULT_CYCLE.length];
    });
}

/** Création d'une machine PnP. */
export function CreateMachineDialog({ open, onClose, onCreated }) {
    const [name, setName] = useState('');
    const [positions, setPositions] = useState('80');
    const [nozzles, setNozzles] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setName('');
            setPositions('80');
            setNozzles('');
            setDescription('');
            setError('');
        }
    }, [open]);

    const handleSubmit = async () => {
        if (!name.trim()) { setError('Le nom est obligatoire.'); return; }
        const numPositions = parseInt(positions, 10);
        if (!numPositions || numPositions < 1 || numPositions > 200) {
            setError('Le nombre de positions doit être entre 1 et 200.');
            return;
        }
        const numNozzles = nozzles === '' ? null : parseInt(nozzles, 10);
        if (numNozzles !== null && (Number.isNaN(numNozzles) || numNozzles < 0 || numNozzles > 40)) {
            setError('Le nombre de nozzles doit être entre 0 et 40.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await apiClient.post('/marketplace/machines', {
                name: name.trim(),
                num_positions: numPositions,
                num_nozzles: numNozzles,
                description: description.trim() || null,
            });
            onCreated();
            onClose();
        } catch (requestError) {
            setError(extractRequestError(requestError, 'Erreur lors de la création.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Nouvelle machine PnP</DialogTitle>
            <DialogContent sx={{ pt: '12px !important' }}>
                <Stack spacing={2}>
                    {error ? <Alert severity="error">{error}</Alert> : null}
                    <TextField label="Nom de la machine" value={name} onChange={(e) => setName(e.target.value)} fullWidth size="small" placeholder="PNP-01" />
                    <TextField label="Nombre de positions feeders" type="number" value={positions} onChange={(e) => setPositions(e.target.value)} fullWidth size="small" inputProps={{ min: 1, max: 200 }} helperText="Entier entre 1 et 200." />
                    <TextField label="Nombre de nozzles (optionnel)" type="number" value={nozzles} onChange={(e) => setNozzles(e.target.value)} fullWidth size="small" inputProps={{ min: 0, max: 40 }} helperText="Nozzles sur la tête (0 à 40). Laisser vide si non configuré." />
                    <TextField label="Description (optionnel)" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth size="small" multiline minRows={2} />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Annuler</Button>
                <Button variant="contained" onClick={handleSubmit} disabled={loading} sx={{ backgroundColor: '#059669', '&:hover': { backgroundColor: '#047857' } }}>
                    {loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Créer'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function CartFormFields({ form, setForm, error }) {
    const update = (patch) => setForm((current) => ({ ...current, ...patch }));
    return (
        <Stack spacing={2}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField label="Nom du chariot" value={form.name} onChange={(e) => update({ name: e.target.value })} fullWidth size="small" placeholder="COMPOSANT_COMMUN" />
            <TextField
                select
                label="Type"
                value={form.kind}
                onChange={(e) => update({ kind: e.target.value, target_category: e.target.value === 'CATEGORY' ? form.target_category : '' })}
                fullWidth
                size="small"
            >
                {cartKindOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
            </TextField>
            {form.kind === 'CATEGORY' ? (
                <TextField label="Catégorie cible" value={form.target_category} onChange={(e) => update({ target_category: e.target.value })} fullWidth size="small" placeholder="Carrier Board" />
            ) : null}
            <TextField label="Capacité (positions)" type="number" value={form.capacity_positions} onChange={(e) => update({ capacity_positions: e.target.value })} fullWidth size="small" inputProps={{ min: 1, max: 500 }} helperText="Entier entre 1 et 500." />
            <TextField label="Description (optionnel)" value={form.description} onChange={(e) => update({ description: e.target.value })} fullWidth size="small" multiline minRows={2} />
        </Stack>
    );
}

function validateCart(form) {
    if (!form.name.trim()) return 'Le nom est obligatoire.';
    const capacity = parseInt(form.capacity_positions, 10);
    if (!capacity || capacity < 1 || capacity > 500) return 'La capacité doit être entre 1 et 500.';
    if (form.kind === 'CATEGORY' && !form.target_category.trim()) return 'La catégorie cible est obligatoire pour ce type.';
    return '';
}

function buildCartPayload(form) {
    return {
        name: form.name.trim(),
        capacity_positions: parseInt(form.capacity_positions, 10),
        kind: form.kind,
        target_category: form.kind === 'CATEGORY' ? form.target_category.trim() : null,
        description: form.description.trim() || null,
    };
}

/** Création d'un chariot logique. */
export function CreateCartDialog({ open, onClose, onCreated }) {
    const [form, setForm] = useState({ name: '', kind: 'COMMON', target_category: '', capacity_positions: '80', description: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setForm({ name: '', kind: 'COMMON', target_category: '', capacity_positions: '80', description: '' });
            setError('');
        }
    }, [open]);

    const handleSubmit = async () => {
        const validationError = validateCart(form);
        if (validationError) { setError(validationError); return; }
        setLoading(true);
        setError('');
        try {
            await apiClient.post('/marketplace/carts', buildCartPayload(form));
            onCreated();
            onClose();
        } catch (requestError) {
            setError(extractRequestError(requestError, 'Erreur lors de la création.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Nouveau chariot feeder</DialogTitle>
            <DialogContent sx={{ pt: '12px !important' }}>
                <CartFormFields form={form} setForm={setForm} error={error} />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Annuler</Button>
                <Button variant="contained" onClick={handleSubmit} disabled={loading} sx={{ backgroundColor: '#059669', '&:hover': { backgroundColor: '#047857' } }}>
                    {loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Créer'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/** Édition d'un chariot logique existant. */
export function EditCartDialog({ cart, open, onClose, onSaved }) {
    const [form, setForm] = useState({ name: '', kind: 'COMMON', target_category: '', capacity_positions: '80', description: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (cart && open) {
            setForm({
                name: cart.name || '',
                kind: cart.kind || 'COMMON',
                target_category: cart.target_category || '',
                capacity_positions: String(cart.capacity_positions ?? 80),
                description: cart.description || '',
            });
            setError('');
        }
    }, [cart, open]);

    const handleSubmit = async () => {
        const validationError = validateCart(form);
        if (validationError) { setError(validationError); return; }
        setLoading(true);
        setError('');
        try {
            await apiClient.put(`/marketplace/carts/${cart.id}`, buildCartPayload(form));
            onSaved();
            onClose();
        } catch (requestError) {
            setError(extractRequestError(requestError, 'Erreur lors de la mise à jour.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Modifier le chariot</DialogTitle>
            <DialogContent sx={{ pt: '12px !important' }}>
                <CartFormFields form={form} setForm={setForm} error={error} />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Annuler</Button>
                <Button variant="contained" onClick={handleSubmit} disabled={loading} sx={{ backgroundColor: '#059669', '&:hover': { backgroundColor: '#047857' } }}>
                    {loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Enregistrer'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/** Édition d'une machine PnP existante. */
export function EditMachineDialog({ machine, open, onClose, onSaved }) {
    const [name, setName] = useState('');
    const [positions, setPositions] = useState('80');
    const [nozzles, setNozzles] = useState('');
    const [nozzleLayout, setNozzleLayout] = useState([]);
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (machine && open) {
            setName(machine.name || '');
            setPositions(String(machine.num_positions ?? 80));
            setNozzles(machine.num_nozzles == null ? '' : String(machine.num_nozzles));
            setNozzleLayout(Array.isArray(machine.nozzle_layout) ? machine.nozzle_layout : []);
            setDescription(machine.description || '');
            setError('');
        }
    }, [machine, open]);

    const numNozzlesValue = parseInt(nozzles, 10);
    const renderedNozzleLayout = buildNozzleLayout(
        nozzleLayout,
        Number.isInteger(numNozzlesValue) ? numNozzlesValue : 0,
    );

    const handleSubmit = async () => {
        if (!name.trim()) { setError('Le nom est obligatoire.'); return; }
        const numPositions = parseInt(positions, 10);
        if (!numPositions || numPositions < 1 || numPositions > 200) {
            setError('Le nombre de positions doit être entre 1 et 200.');
            return;
        }
        const numNozzles = nozzles === '' ? null : parseInt(nozzles, 10);
        if (numNozzles !== null && (Number.isNaN(numNozzles) || numNozzles < 0 || numNozzles > 40)) {
            setError('Le nombre de nozzles doit être entre 0 et 40.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await apiClient.put(`/marketplace/machines/${machine.id}`, {
                name: name.trim(),
                num_positions: numPositions,
                num_nozzles: numNozzles,
                nozzle_layout: numNozzles ? buildNozzleLayout(nozzleLayout, numNozzles) : null,
                description: description.trim() || null,
            });
            onSaved();
            onClose();
        } catch (requestError) {
            setError(extractRequestError(requestError, 'Erreur lors de la mise à jour.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Modifier la machine</DialogTitle>
            <DialogContent sx={{ pt: '12px !important' }}>
                <Stack spacing={2}>
                    {error ? <Alert severity="error">{error}</Alert> : null}
                    <TextField label="Nom de la machine" value={name} onChange={(e) => setName(e.target.value)} fullWidth size="small" />
                    <TextField label="Nombre de positions feeders" type="number" value={positions} onChange={(e) => setPositions(e.target.value)} fullWidth size="small" inputProps={{ min: 1, max: 200 }} helperText="Entier entre 1 et 200." />
                    <TextField label="Nombre de nozzles (optionnel)" type="number" value={nozzles} onChange={(e) => setNozzles(e.target.value)} fullWidth size="small" inputProps={{ min: 0, max: 40 }} helperText="Nozzles sur la tête (0 à 40). Laisser vide si non configuré." />
                    {renderedNozzleLayout.length ? (
                        <Box>
                            <Typography sx={{ fontSize: '0.72rem', color: '#a1a1aa', mb: 1 }}>
                                Type de nozzle par position (pré-rempli, modifiable)
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                {renderedNozzleLayout.map((nozzleType, index) => (
                                    <TextField
                                        key={`nozzle-pos-${index}`}
                                        select
                                        size="small"
                                        label={`#${index + 1}`}
                                        value={nozzleType}
                                        onChange={(e) => {
                                            const next = [...renderedNozzleLayout];
                                            next[index] = parseInt(e.target.value, 10);
                                            setNozzleLayout(next);
                                        }}
                                        sx={{ width: 92 }}
                                    >
                                        {NOZZLE_TYPE_OPTIONS.map((option) => (
                                            <MenuItem key={option} value={option}>{option}</MenuItem>
                                        ))}
                                    </TextField>
                                ))}
                            </Stack>
                        </Box>
                    ) : null}
                    <TextField label="Description (optionnel)" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth size="small" multiline minRows={2} />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Annuler</Button>
                <Button variant="contained" onClick={handleSubmit} disabled={loading} sx={{ backgroundColor: '#059669', '&:hover': { backgroundColor: '#047857' } }}>
                    {loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Enregistrer'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
