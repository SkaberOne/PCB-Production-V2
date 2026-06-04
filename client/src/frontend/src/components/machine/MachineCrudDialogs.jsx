import React, { useEffect, useState } from 'react';
import {
    Alert,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    Stack,
    TextField,
} from '@mui/material';
import apiClient from '../../api/client';
import { cartKindOptions, extractRequestError } from '../../utils/machinePnp';

/** Création d'une machine PnP. */
export function CreateMachineDialog({ open, onClose, onCreated }) {
    const [name, setName] = useState('');
    const [positions, setPositions] = useState('80');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setName('');
            setPositions('80');
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
        setLoading(true);
        setError('');
        try {
            await apiClient.post('/marketplace/machines', {
                name: name.trim(),
                num_positions: numPositions,
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
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (machine && open) {
            setName(machine.name || '');
            setPositions(String(machine.num_positions ?? 80));
            setDescription(machine.description || '');
            setError('');
        }
    }, [machine, open]);

    const handleSubmit = async () => {
        if (!name.trim()) { setError('Le nom est obligatoire.'); return; }
        const numPositions = parseInt(positions, 10);
        if (!numPositions || numPositions < 1 || numPositions > 200) {
            setError('Le nombre de positions doit être entre 1 et 200.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await apiClient.put(`/marketplace/machines/${machine.id}`, {
                name: name.trim(),
                num_positions: numPositions,
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
