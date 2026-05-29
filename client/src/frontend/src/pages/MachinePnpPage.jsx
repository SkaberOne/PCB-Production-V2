import React, { useCallback, useEffect, useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import PrecisionManufacturingRoundedIcon from '@mui/icons-material/PrecisionManufacturingRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded';
import SettingsInputComponentRoundedIcon from '@mui/icons-material/SettingsInputComponentRounded';
import ViewListRoundedIcon from '@mui/icons-material/ViewListRounded';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    IconButton,
    MenuItem,
    Paper,
    Stack,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    Tabs,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import apiClient from '../api/client';
import PageHeader from '../components/common/PageHeader';
import { useBomSession } from '../context/BomSessionContext';

// ─── helpers ──────────────────────────────────────────────────────────────────

function SideChip({ side }) {
    const color = side === 'TOP' ? '#3b82f6' : '#f59e0b';
    return (
        <Chip
            label={side || '—'}
            size="small"
            sx={{
                height: 18,
                fontSize: '0.6rem',
                fontWeight: 700,
                backgroundColor: `${color}22`,
                color,
                border: `1px solid ${color}55`,
            }}
        />
    );
}

function StatusChip({ validated }) {
    return validated ? (
        <Chip
            icon={<CheckCircleRoundedIcon sx={{ fontSize: '0.8rem !important' }} />}
            label="Ordre validé"
            size="small"
            sx={{
                height: 20,
                fontSize: '0.65rem',
                backgroundColor: 'rgba(5,150,105,0.12)',
                color: '#10b981',
                border: '1px solid rgba(5,150,105,0.25)',
            }}
        />
    ) : (
        <Chip
            label="Ordre non validé"
            size="small"
            sx={{
                height: 20,
                fontSize: '0.65rem',
                backgroundColor: 'rgba(245,158,11,0.1)',
                color: '#f59e0b',
                border: '1px solid rgba(245,158,11,0.25)',
            }}
        />
    );
}

function KindChip({ kind }) {
    const isCommon = kind === 'COMMON';
    return (
        <Chip
            label={isCommon ? 'Commun' : 'Catégorie'}
            size="small"
            sx={{
                height: 18,
                fontSize: '0.6rem',
                fontWeight: 700,
                backgroundColor: isCommon ? 'rgba(99,102,241,0.12)' : 'rgba(245,158,11,0.1)',
                color: isCommon ? '#818cf8' : '#f59e0b',
                border: `1px solid ${isCommon ? 'rgba(99,102,241,0.25)' : 'rgba(245,158,11,0.25)'}`,
            }}
        />
    );
}

// ─── CreateMachineDialog ───────────────────────────────────────────────────────

function CreateMachineDialog({ open, onClose, onCreated }) {
    const [name, setName] = useState('');
    const [positions, setPositions] = useState('80');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        if (!name.trim()) { setError('Le nom est obligatoire.'); return; }
        const numPos = parseInt(positions, 10);
        if (!numPos || numPos < 1 || numPos > 200) { setError('Le nombre de positions doit être entre 1 et 200.'); return; }
        setLoading(true);
        setError('');
        try {
            await apiClient.post('/marketplace/machines', {
                name: name.trim(),
                num_positions: numPos,
                description: description.trim() || null,
            });
            setName(''); setPositions('80'); setDescription('');
            onCreated();
            onClose();
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Erreur lors de la création');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
            PaperProps={{ sx: { backgroundColor: '#18181b', border: '1px solid #27272a' } }}>
            <DialogTitle sx={{ color: '#f4f4f5' }}>Nouvelle machine PnP</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    {error && <Alert severity="error" sx={{ fontSize: '0.8rem' }}>{error}</Alert>}
                    <TextField
                        label="Nom de la machine"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        fullWidth size="small"
                        placeholder="PNP-01"
                        InputLabelProps={{ sx: { color: '#71717a' } }}
                        inputProps={{ sx: { color: '#f4f4f5' } }}
                        sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#3f3f46' } } }}
                    />
                    <TextField
                        label="Nombre de positions feeders"
                        value={positions}
                        onChange={(e) => setPositions(e.target.value)}
                        type="number"
                        fullWidth size="small"
                        inputProps={{ min: 1, max: 200, sx: { color: '#f4f4f5' } }}
                        InputLabelProps={{ sx: { color: '#71717a' } }}
                        sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#3f3f46' } } }}
                    />
                    <TextField
                        label="Description (optionnel)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        fullWidth size="small" multiline rows={2}
                        InputLabelProps={{ sx: { color: '#71717a' } }}
                        inputProps={{ sx: { color: '#f4f4f5' } }}
                        sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#3f3f46' } } }}
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} sx={{ color: '#71717a' }}>Annuler</Button>
                <Button onClick={handleSubmit} variant="contained" disabled={loading}
                    sx={{ backgroundColor: '#059669', '&:hover': { backgroundColor: '#047857' } }}>
                    {loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Créer'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── DeleteMachineDialog ───────────────────────────────────────────────────────

function DeleteMachineDialog({ machine, open, onClose, onDeleted }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleDelete = async () => {
        setLoading(true);
        setError('');
        try {
            await apiClient.delete(`/marketplace/machines/${machine.id}`);
            onDeleted();
            onClose();
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Erreur lors de la suppression');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth
            PaperProps={{ sx: { backgroundColor: '#18181b', border: '1px solid #27272a' } }}>
            <DialogTitle sx={{ color: '#f4f4f5' }}>Supprimer la machine</DialogTitle>
            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2, fontSize: '0.8rem' }}>{error}</Alert>}
                <DialogContentText sx={{ color: '#a1a1aa' }}>
                    Supprimer <strong style={{ color: '#f4f4f5' }}>{machine?.name}</strong> ? Cette action est irréversible.
                </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} sx={{ color: '#71717a' }}>Annuler</Button>
                <Button onClick={handleDelete} variant="contained" disabled={loading}
                    sx={{ backgroundColor: '#dc2626', '&:hover': { backgroundColor: '#b91c1c' } }}>
                    {loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Supprimer'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── CreateCartDialog ─────────────────────────────────────────────────────────

function CreateCartDialog({ open, onClose, onCreated }) {
    const [name, setName] = useState('');
    const [capacity, setCapacity] = useState('80');
    const [kind, setKind] = useState('COMMON');
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        if (!name.trim()) { setError('Le nom est obligatoire.'); return; }
        const cap = parseInt(capacity, 10);
        if (!cap || cap < 1 || cap > 500) { setError('La capacité doit être entre 1 et 500.'); return; }
        if (kind === 'CATEGORY' && !category.trim()) { setError('La catégorie cible est obligatoire pour ce type.'); return; }
        setLoading(true);
        setError('');
        try {
            await apiClient.post('/marketplace/carts', {
                name: name.trim(),
                capacity_positions: cap,
                kind,
                target_category: kind === 'CATEGORY' ? category.trim() : null,
                description: description.trim() || null,
            });
            setName(''); setCapacity('80'); setKind('COMMON'); setCategory(''); setDescription('');
            onCreated();
            onClose();
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Erreur lors de la création');
        } finally {
            setLoading(false);
        }
    };

    const inputSx = { color: '#f4f4f5' };
    const labelSx = { sx: { color: '#71717a' } };
    const fieldSx = { '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#3f3f46' } } };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
            PaperProps={{ sx: { backgroundColor: '#18181b', border: '1px solid #27272a' } }}>
            <DialogTitle sx={{ color: '#f4f4f5' }}>Nouveau chariot feeder</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    {error && <Alert severity="error" sx={{ fontSize: '0.8rem' }}>{error}</Alert>}
                    <TextField label="Nom du chariot" value={name} onChange={(e) => setName(e.target.value)}
                        fullWidth size="small" placeholder="COMPOSANT_COMMUN" inputProps={{ sx: inputSx }} InputLabelProps={labelSx} sx={fieldSx} />
                    <TextField select label="Type" value={kind} onChange={(e) => setKind(e.target.value)}
                        fullWidth size="small" inputProps={{ sx: inputSx }} InputLabelProps={labelSx} sx={fieldSx}>
                        <MenuItem value="COMMON">Commun (composants partagés)</MenuItem>
                        <MenuItem value="CATEGORY">Catégorie (dédié à un type de carte)</MenuItem>
                    </TextField>
                    {kind === 'CATEGORY' && (
                        <TextField label="Catégorie cible" value={category} onChange={(e) => setCategory(e.target.value)}
                            fullWidth size="small" placeholder="Carrier Board" inputProps={{ sx: inputSx }} InputLabelProps={labelSx} sx={fieldSx} />
                    )}
                    <TextField label="Capacité (positions)" value={capacity} onChange={(e) => setCapacity(e.target.value)}
                        type="number" fullWidth size="small" inputProps={{ min: 1, max: 500, sx: inputSx }} InputLabelProps={labelSx} sx={fieldSx} />
                    <TextField label="Description (optionnel)" value={description} onChange={(e) => setDescription(e.target.value)}
                        fullWidth size="small" multiline rows={2} inputProps={{ sx: inputSx }} InputLabelProps={labelSx} sx={fieldSx} />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} sx={{ color: '#71717a' }}>Annuler</Button>
                <Button onClick={handleSubmit} variant="contained" disabled={loading}
                    sx={{ backgroundColor: '#059669', '&:hover': { backgroundColor: '#047857' } }}>
                    {loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Créer'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── DeleteCartDialog ─────────────────────────────────────────────────────────

function DeleteCartDialog({ cart, open, onClose, onDeleted }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleDelete = async () => {
        setLoading(true);
        setError('');
        try {
            await apiClient.delete(`/marketplace/carts/${cart.id}`);
            onDeleted();
            onClose();
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Erreur lors de la suppression');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth
            PaperProps={{ sx: { backgroundColor: '#18181b', border: '1px solid #27272a' } }}>
            <DialogTitle sx={{ color: '#f4f4f5' }}>Supprimer le chariot</DialogTitle>
            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2, fontSize: '0.8rem' }}>{error}</Alert>}
                <DialogContentText sx={{ color: '#a1a1aa' }}>
                    Supprimer <strong style={{ color: '#f4f4f5' }}>{cart?.name}</strong> ? Cette action est irréversible.
                </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} sx={{ color: '#71717a' }}>Annuler</Button>
                <Button onClick={handleDelete} variant="contained" disabled={loading}
                    sx={{ backgroundColor: '#dc2626', '&:hover': { backgroundColor: '#b91c1c' } }}>
                    {loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Supprimer'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── EditCartDialog ───────────────────────────────────────────────────────────

function EditCartDialog({ cart, open, onClose, onSaved }) {
    const [name, setName] = useState('');
    const [capacity, setCapacity] = useState('');
    const [kind, setKind] = useState('COMMON');
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Pré-remplir les champs quand le dialog s'ouvre
    useEffect(() => {
        if (cart && open) {
            setName(cart.name || '');
            setCapacity(String(cart.capacity_positions ?? 80));
            setKind(cart.kind || 'COMMON');
            setCategory(cart.target_category || '');
            setDescription(cart.description || '');
            setError('');
        }
    }, [cart, open]);

    const handleSubmit = async () => {
        if (!name.trim()) { setError('Le nom est obligatoire.'); return; }
        const cap = parseInt(capacity, 10);
        if (!cap || cap < 1 || cap > 500) { setError('La capacité doit être entre 1 et 500.'); return; }
        if (kind === 'CATEGORY' && !category.trim()) { setError('La catégorie cible est obligatoire pour ce type.'); return; }
        setLoading(true);
        setError('');
        try {
            await apiClient.put(`/marketplace/carts/${cart.id}`, {
                name: name.trim(),
                capacity_positions: cap,
                kind,
                target_category: kind === 'CATEGORY' ? category.trim() : null,
                description: description.trim() || null,
            });
            onSaved();
            onClose();
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Erreur lors de la mise à jour');
        } finally {
            setLoading(false);
        }
    };

    const inputSx = { color: '#f4f4f5' };
    const labelSx = { sx: { color: '#71717a' } };
    const fieldSx = { '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#3f3f46' } } };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
            PaperProps={{ sx: { backgroundColor: '#18181b', border: '1px solid #27272a' } }}>
            <DialogTitle sx={{ color: '#f4f4f5' }}>Modifier le chariot</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    {error && <Alert severity="error" sx={{ fontSize: '0.8rem' }}>{error}</Alert>}
                    <TextField label="Nom du chariot" value={name} onChange={(e) => setName(e.target.value)}
                        fullWidth size="small" inputProps={{ sx: inputSx }} InputLabelProps={labelSx} sx={fieldSx} />
                    <TextField select label="Type" value={kind} onChange={(e) => setKind(e.target.value)}
                        fullWidth size="small" inputProps={{ sx: inputSx }} InputLabelProps={labelSx} sx={fieldSx}>
                        <MenuItem value="COMMON">Commun (composants partagés)</MenuItem>
                        <MenuItem value="CATEGORY">Catégorie (dédié à un type de carte)</MenuItem>
                    </TextField>
                    {kind === 'CATEGORY' && (
                        <TextField label="Catégorie cible" value={category} onChange={(e) => setCategory(e.target.value)}
                            fullWidth size="small" placeholder="Carrier Board" inputProps={{ sx: inputSx }} InputLabelProps={labelSx} sx={fieldSx} />
                    )}
                    <TextField label="Capacité (positions)" value={capacity} onChange={(e) => setCapacity(e.target.value)}
                        type="number" fullWidth size="small" inputProps={{ min: 1, max: 500, sx: inputSx }} InputLabelProps={labelSx} sx={fieldSx} />
                    <TextField label="Description (optionnel)" value={description} onChange={(e) => setDescription(e.target.value)}
                        fullWidth size="small" multiline rows={2} inputProps={{ sx: inputSx }} InputLabelProps={labelSx} sx={fieldSx} />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} sx={{ color: '#71717a' }}>Annuler</Button>
                <Button onClick={handleSubmit} variant="contained" disabled={loading}
                    sx={{ backgroundColor: '#2563eb', '&:hover': { backgroundColor: '#1d4ed8' } }}>
                    {loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : 'Enregistrer'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── MachineCard ──────────────────────────────────────────────────────────────

function MachineCard({ machine, selected, onSelect, onDelete }) {
    return (
        <Card
            onClick={() => onSelect(machine)}
            sx={{
                cursor: 'pointer',
                backgroundColor: selected ? 'rgba(5,150,105,0.08)' : '#18181b',
                border: '1px solid',
                borderColor: selected ? 'rgba(5,150,105,0.4)' : '#27272a',
                transition: 'all 0.15s ease',
                '&:hover': { borderColor: selected ? 'rgba(5,150,105,0.4)' : '#3f3f46' },
            }}
        >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <PrecisionManufacturingRoundedIcon sx={{ color: selected ? '#10b981' : '#52525b', fontSize: 20, mt: 0.25, flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: '0.875rem', fontWeight: 600, color: selected ? '#10b981' : '#f4f4f5' }}>
                            {machine.name}
                        </Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: '#71717a', mt: 0.25 }}>
                            {machine.num_positions} positions · {machine.assigned_productions} production(s)
                        </Typography>
                        {machine.description && (
                            <Typography noWrap sx={{ fontSize: '0.7rem', color: '#52525b', mt: 0.5 }}>
                                {machine.description}
                            </Typography>
                        )}
                    </Box>
                    <Tooltip title="Supprimer">
                        <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); onDelete(machine); }}
                            sx={{ color: '#52525b', '&:hover': { color: '#dc2626', backgroundColor: 'rgba(220,38,38,0.08)' } }}
                        >
                            <DeleteRoundedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                </Box>
            </CardContent>
        </Card>
    );
}

// ─── BomRevisionTable ─────────────────────────────────────────────────────────

function BomRevisionTable({ revisions }) {
    if (!revisions?.length) {
        return (
            <Box sx={{ py: 4, textAlign: 'center', color: '#52525b' }}>
                <Typography variant="body2">Aucune BOM dans cette production.</Typography>
            </Box>
        );
    }

    return (
        <TableContainer>
            <Table size="small">
                <TableHead>
                    <TableRow sx={{ '& th': { borderColor: '#27272a', color: '#71717a', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', py: 0.75 } }}>
                        <TableCell sx={{ width: 40 }}>#</TableCell>
                        <TableCell>Référence</TableCell>
                        <TableCell>Révision</TableCell>
                        <TableCell>Face</TableCell>
                        <TableCell>Fichier</TableCell>
                        <TableCell sx={{ width: 70, textAlign: 'right' }}>Qté</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {revisions.map((rev) => (
                        <TableRow key={rev.bom_revision_id}
                            sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' }, '& td': { borderColor: '#27272a', py: 0.75 } }}>
                            <TableCell sx={{ color: '#52525b', fontSize: '0.75rem' }}>{rev.sequence_order}</TableCell>
                            <TableCell sx={{ color: '#f4f4f5', fontSize: '0.8rem', fontWeight: 500 }}>{rev.reference}</TableCell>
                            <TableCell sx={{ color: '#a1a1aa', fontSize: '0.75rem' }}>{rev.revision}</TableCell>
                            <TableCell><SideChip side={rev.side} /></TableCell>
                            <TableCell sx={{ color: '#71717a', fontSize: '0.7rem' }}>{rev.file_name || '—'}</TableCell>
                            <TableCell sx={{ textAlign: 'right', color: '#a1a1aa', fontSize: '0.75rem' }}>{rev.quantity_to_produce ?? 1}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

// ─── SequenceTab — contenu onglet Séquence ────────────────────────────────────

function SequenceTab({ summary, summaryLoading, activeProduction, onAssignProduction, assignLoading, isActiveProductionLinked, machines, loadMachines, selectedMachine, setSelectedMachine, setCreateOpen, setDeleteTarget }) {
    return (
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>

            {/* ── Panneau gauche : liste machines ── */}
            <Box sx={{ width: 260, flexShrink: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Machines ({machines.length})
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Actualiser">
                            <IconButton size="small" onClick={loadMachines} sx={{ color: '#52525b' }}>
                                <RefreshRoundedIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Nouvelle machine">
                            <IconButton size="small" onClick={() => setCreateOpen(true)}
                                sx={{ color: '#059669', backgroundColor: 'rgba(5,150,105,0.08)', '&:hover': { backgroundColor: 'rgba(5,150,105,0.15)' } }}>
                                <AddRoundedIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {machines.length === 0 ? (
                    <Box sx={{ py: 4, textAlign: 'center' }}>
                        <PrecisionManufacturingRoundedIcon sx={{ fontSize: 40, color: '#27272a', mb: 1 }} />
                        <Typography sx={{ fontSize: '0.8rem', color: '#52525b' }}>Aucune machine</Typography>
                        <Button startIcon={<AddRoundedIcon />} size="small" onClick={() => setCreateOpen(true)}
                            sx={{ mt: 1, color: '#059669', fontSize: '0.75rem' }}>
                            Créer une machine
                        </Button>
                    </Box>
                ) : (
                    <Stack spacing={1}>
                        {machines.map((m) => (
                            <MachineCard
                                key={m.id}
                                machine={m}
                                selected={selectedMachine?.id === m.id}
                                onSelect={setSelectedMachine}
                                onDelete={(machine) => setDeleteTarget(machine)}
                            />
                        ))}
                    </Stack>
                )}
            </Box>

            {/* ── Panneau droit : détails machine ── */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
                {!selectedMachine ? (
                    <Box sx={{ py: 8, textAlign: 'center', color: '#52525b' }}>
                        <PrecisionManufacturingRoundedIcon sx={{ fontSize: 48, mb: 1 }} />
                        <Typography>Sélectionnez une machine</Typography>
                    </Box>
                ) : summaryLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                        <CircularProgress size={28} sx={{ color: '#059669' }} />
                    </Box>
                ) : (
                    <Stack spacing={2.5}>

                        {/* En-tête machine */}
                        <Card sx={{ backgroundColor: '#18181b', border: '1px solid #27272a' }}>
                            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <PrecisionManufacturingRoundedIcon sx={{ fontSize: 32, color: '#059669' }} />
                                    <Box sx={{ flex: 1 }}>
                                        <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: '#f4f4f5' }}>
                                            {summary?.name}
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.75rem', color: '#71717a' }}>
                                            {summary?.num_positions} positions · {summary?.assigned_productions ?? 0} production(s) affectée(s)
                                        </Typography>
                                        {summary?.description && (
                                            <Typography sx={{ fontSize: '0.75rem', color: '#52525b', mt: 0.25 }}>
                                                {summary.description}
                                            </Typography>
                                        )}
                                    </Box>

                                    {/* Affectation production active */}
                                    {activeProduction ? (
                                        isActiveProductionLinked ? (
                                            <Chip
                                                icon={<CheckCircleRoundedIcon />}
                                                label={`Production "${activeProduction.name}" affectée`}
                                                size="small"
                                                sx={{
                                                    backgroundColor: 'rgba(5,150,105,0.1)',
                                                    color: '#10b981',
                                                    border: '1px solid rgba(5,150,105,0.25)',
                                                    fontSize: '0.7rem',
                                                }}
                                            />
                                        ) : (
                                            <Button
                                                startIcon={assignLoading ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <LinkRoundedIcon />}
                                                variant="contained"
                                                size="small"
                                                onClick={onAssignProduction}
                                                disabled={assignLoading}
                                                sx={{ backgroundColor: '#059669', '&:hover': { backgroundColor: '#047857' }, fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                            >
                                                Affecter &ldquo;{activeProduction.name}&rdquo;
                                            </Button>
                                        )
                                    ) : (
                                        <Typography sx={{ fontSize: '0.7rem', color: '#52525b', fontStyle: 'italic' }}>
                                            Aucune production active
                                        </Typography>
                                    )}
                                </Box>
                            </CardContent>
                        </Card>

                        {/* Productions liées */}
                        {(!summary?.productions || summary.productions.length === 0) ? (
                            <Card sx={{ backgroundColor: '#18181b', border: '1px solid #27272a' }}>
                                <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 }, textAlign: 'center' }}>
                                    <Typography sx={{ fontSize: '0.85rem', color: '#52525b' }}>
                                        Aucune production affectée à cette machine.
                                    </Typography>
                                </CardContent>
                            </Card>
                        ) : (
                            summary.productions.map((prod) => (
                                <Card key={prod.id} sx={{ backgroundColor: '#18181b', border: '1px solid #27272a' }}>
                                    <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                                            <Box sx={{ flex: 1 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: '#f4f4f5' }}>
                                                        {prod.name}
                                                    </Typography>
                                                    <Chip
                                                        label={prod.status}
                                                        size="small"
                                                        sx={{
                                                            height: 18, fontSize: '0.6rem', fontWeight: 700,
                                                            backgroundColor: prod.status === 'ACTIVE' ? 'rgba(5,150,105,0.12)' : 'rgba(255,255,255,0.05)',
                                                            color: prod.status === 'ACTIVE' ? '#10b981' : '#71717a',
                                                            border: `1px solid ${prod.status === 'ACTIVE' ? 'rgba(5,150,105,0.25)' : '#27272a'}`,
                                                        }}
                                                    />
                                                </Box>
                                                <Typography sx={{ fontSize: '0.7rem', color: '#71717a', mt: 0.25 }}>
                                                    {prod.bom_count} BOM · {prod.total_boards_to_produce} carte(s) à produire
                                                </Typography>
                                            </Box>
                                            <StatusChip validated={prod.has_validated_order} />
                                        </Box>

                                        <Divider sx={{ borderColor: '#27272a', mb: 2 }} />

                                        <Typography sx={{ fontSize: '0.7rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}>
                                            Séquence de fabrication ({prod.bom_revisions?.length ?? 0} passages)
                                        </Typography>
                                        <BomRevisionTable revisions={prod.bom_revisions} />
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </Stack>
                )}
            </Box>
        </Box>
    );
}

// ─── FeederTab — onglet Feeders fixes ────────────────────────────────────────

function FeederTab() {
    const [feeders, setFeeders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await apiClient.get('/marketplace/fixed-feeders/components?only_fixed=true&limit=500');
            setFeeders(res.data?.data || []);
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Erreur chargement feeders');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = feeders.filter((f) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            (f.component_label || '').toLowerCase().includes(q) ||
            (f.footprint_pnp || '').toLowerCase().includes(q) ||
            (f.feeder_type || '').toLowerCase().includes(q) ||
            (f.fixed_cart_name || '').toLowerCase().includes(q)
        );
    });
    const paginated = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

    const thSx = { color: '#71717a', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', py: 0.75, borderColor: '#27272a' };
    const tdSx = { fontSize: '0.8rem', py: 0.75, borderColor: '#27272a' };

    return (
        <Stack spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Feeders fixes ({filtered.length})
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <TextField
                        size="small"
                        placeholder="Recherche…"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                        sx={{ width: 220, '& .MuiOutlinedInput-root': { fontSize: '0.8rem', '& fieldset': { borderColor: '#3f3f46' } }, '& input': { color: '#f4f4f5', py: 0.75 } }}
                        InputLabelProps={{ sx: { color: '#71717a' } }}
                    />
                    <Tooltip title="Actualiser">
                        <IconButton size="small" onClick={load} sx={{ color: '#52525b' }}>
                            <RefreshRoundedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress size={28} sx={{ color: '#059669' }} />
                </Box>
            ) : filtered.length === 0 ? (
                <Box sx={{ py: 6, textAlign: 'center', color: '#52525b' }}>
                    <SettingsInputComponentRoundedIcon sx={{ fontSize: 40, mb: 1 }} />
                    <Typography variant="body2">{search ? 'Aucun résultat.' : 'Aucun feeder fixe configuré.'}</Typography>
                </Box>
            ) : (
                <Paper sx={{ backgroundColor: '#18181b', border: '1px solid #27272a' }}>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={thSx}>Composant</TableCell>
                                    <TableCell sx={thSx}>Footprint PnP</TableCell>
                                    <TableCell sx={thSx}>Type feeder</TableCell>
                                    <TableCell sx={{ ...thSx, textAlign: 'center' }}>Taille (mm)</TableCell>
                                    <TableCell sx={thSx}>Chariot</TableCell>
                                    <TableCell sx={{ ...thSx, textAlign: 'right' }}>Nb BOM</TableCell>
                                    <TableCell sx={{ ...thSx, textAlign: 'right' }}>Qté totale</TableCell>
                                    <TableCell sx={thSx}>Catégories</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {paginated.map((f) => (
                                    <TableRow key={f.component_id}
                                        sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' }, '& td': { borderColor: '#27272a' } }}>
                                        <TableCell sx={{ ...tdSx, color: '#f4f4f5', fontWeight: 500 }}>{f.component_label}</TableCell>
                                        <TableCell sx={{ ...tdSx, color: '#a1a1aa' }}>{f.footprint_pnp || '—'}</TableCell>
                                        <TableCell sx={{ ...tdSx, color: '#a1a1aa', fontFamily: 'monospace' }}>{f.feeder_type || '—'}</TableCell>
                                        <TableCell sx={{ ...tdSx, textAlign: 'center', color: '#71717a' }}>{f.feeder_size_mm ?? '—'}</TableCell>
                                        <TableCell sx={tdSx}>
                                            {f.fixed_cart_name ? (
                                                <Chip
                                                    label={f.fixed_cart_name}
                                                    size="small"
                                                    sx={{
                                                        height: 18, fontSize: '0.65rem',
                                                        backgroundColor: f.fixed_cart_kind === 'COMMON' ? 'rgba(99,102,241,0.12)' : 'rgba(245,158,11,0.1)',
                                                        color: f.fixed_cart_kind === 'COMMON' ? '#818cf8' : '#f59e0b',
                                                        border: `1px solid ${f.fixed_cart_kind === 'COMMON' ? 'rgba(99,102,241,0.25)' : 'rgba(245,158,11,0.25)'}`,
                                                    }}
                                                />
                                            ) : '—'}
                                        </TableCell>
                                        <TableCell sx={{ ...tdSx, textAlign: 'right', color: '#71717a' }}>{f.bom_reference_count ?? 0}</TableCell>
                                        <TableCell sx={{ ...tdSx, textAlign: 'right', color: '#71717a' }}>{f.total_board_quantity ?? 0}</TableCell>
                                        <TableCell sx={tdSx}>
                                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                                {(f.categories || []).map((cat) => (
                                                    <Chip key={cat} label={cat} size="small"
                                                        sx={{ height: 16, fontSize: '0.6rem', backgroundColor: 'rgba(255,255,255,0.05)', color: '#71717a', border: '1px solid #27272a' }} />
                                                ))}
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <TablePagination
                        component="div"
                        count={filtered.length}
                        page={page}
                        onPageChange={(_, p) => setPage(p)}
                        rowsPerPage={rowsPerPage}
                        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                        rowsPerPageOptions={[25, 50, 100]}
                        labelRowsPerPage="Lignes"
                        sx={{ borderTop: '1px solid #27272a', color: '#71717a', fontSize: '0.75rem' }}
                    />
                </Paper>
            )}
        </Stack>
    );
}

// ─── ChariotTab — onglet Chariots ─────────────────────────────────────────────

function ChariotTab() {
    const [carts, setCarts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [editTarget, setEditTarget] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await apiClient.get('/marketplace/carts?limit=200');
            setCarts(res.data?.data || []);
        } catch (err) {
            setError(err.response?.data?.detail || err.message || 'Erreur chargement chariots');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!successMsg) return;
        const t = setTimeout(() => setSuccessMsg(''), 4000);
        return () => clearTimeout(t);
    }, [successMsg]);

    const thSx = { color: '#71717a', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', py: 0.75, borderColor: '#27272a' };
    const tdSx = { fontSize: '0.8rem', py: 1, borderColor: '#27272a' };

    return (
        <Stack spacing={2}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Chariots feeders ({carts.length})
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Tooltip title="Actualiser">
                        <IconButton size="small" onClick={load} sx={{ color: '#52525b' }}>
                            <RefreshRoundedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                    <Button
                        startIcon={<AddRoundedIcon />}
                        size="small"
                        variant="contained"
                        onClick={() => setCreateOpen(true)}
                        sx={{ backgroundColor: '#059669', '&:hover': { backgroundColor: '#047857' }, fontSize: '0.75rem' }}
                    >
                        Nouveau chariot
                    </Button>
                </Box>
            </Box>

            {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
            {successMsg && <Alert severity="success" onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress size={28} sx={{ color: '#059669' }} />
                </Box>
            ) : carts.length === 0 ? (
                <Box sx={{ py: 6, textAlign: 'center', color: '#52525b' }}>
                    <ShoppingCartRoundedIcon sx={{ fontSize: 40, mb: 1 }} />
                    <Typography variant="body2" sx={{ mb: 1 }}>Aucun chariot configuré.</Typography>
                    <Button startIcon={<AddRoundedIcon />} size="small" onClick={() => setCreateOpen(true)}
                        sx={{ color: '#059669', fontSize: '0.75rem' }}>
                        Créer un chariot
                    </Button>
                </Box>
            ) : (
                <Paper sx={{ backgroundColor: '#18181b', border: '1px solid #27272a' }}>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={thSx}>Nom</TableCell>
                                    <TableCell sx={thSx}>Type</TableCell>
                                    <TableCell sx={thSx}>Catégorie cible</TableCell>
                                    <TableCell sx={{ ...thSx, textAlign: 'center' }}>Capacité</TableCell>
                                    <TableCell sx={{ ...thSx, textAlign: 'center' }}>Utilisées</TableCell>
                                    <TableCell sx={{ ...thSx, textAlign: 'center' }}>Restantes</TableCell>
                                    <TableCell sx={{ ...thSx, textAlign: 'center' }}>Composants</TableCell>
                                    <TableCell sx={{ ...thSx, width: 80 }} />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {carts.map((cart) => {
                                    const usedPct = cart.capacity_positions > 0
                                        ? Math.round((cart.used_positions / cart.capacity_positions) * 100)
                                        : 0;
                                    const isFull = usedPct >= 100;
                                    return (
                                        <TableRow key={cart.id}
                                            sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' }, '& td': { borderColor: '#27272a' } }}>
                                            <TableCell sx={{ ...tdSx, color: '#f4f4f5', fontWeight: 600 }}>{cart.name}</TableCell>
                                            <TableCell sx={tdSx}><KindChip kind={cart.kind} /></TableCell>
                                            <TableCell sx={{ ...tdSx, color: '#a1a1aa' }}>{cart.target_category || '—'}</TableCell>
                                            <TableCell sx={{ ...tdSx, textAlign: 'center', color: '#71717a' }}>{cart.capacity_positions}</TableCell>
                                            <TableCell sx={{ ...tdSx, textAlign: 'center' }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                                                    <Typography sx={{ fontSize: '0.8rem', color: isFull ? '#f87171' : '#f4f4f5' }}>
                                                        {cart.used_positions}
                                                    </Typography>
                                                    <Typography sx={{ fontSize: '0.65rem', color: '#52525b' }}>({usedPct}%)</Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell sx={{ ...tdSx, textAlign: 'center', color: isFull ? '#f87171' : '#10b981' }}>
                                                {cart.remaining_positions}
                                            </TableCell>
                                            <TableCell sx={{ ...tdSx, textAlign: 'center', color: '#71717a' }}>{cart.fixed_component_count ?? 0}</TableCell>
                                            <TableCell sx={{ ...tdSx, textAlign: 'right', pr: 1 }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                                                    <Tooltip title="Modifier">
                                                        <IconButton size="small" onClick={() => setEditTarget(cart)}
                                                            sx={{ color: '#52525b', '&:hover': { color: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)' } }}>
                                                            <EditRoundedIcon sx={{ fontSize: 16 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Supprimer">
                                                        <IconButton size="small" onClick={() => setDeleteTarget(cart)}
                                                            sx={{ color: '#52525b', '&:hover': { color: '#dc2626', backgroundColor: 'rgba(220,38,38,0.08)' } }}>
                                                            <DeleteRoundedIcon sx={{ fontSize: 16 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            <CreateCartDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={async () => { await load(); setSuccessMsg('Chariot créé.'); }}
            />
            {editTarget && (
                <EditCartDialog
                    cart={editTarget}
                    open={Boolean(editTarget)}
                    onClose={() => setEditTarget(null)}
                    onSaved={async () => { setEditTarget(null); await load(); setSuccessMsg('Chariot mis à jour.'); }}
                />
            )}
            {deleteTarget && (
                <DeleteCartDialog
                    cart={deleteTarget}
                    open={Boolean(deleteTarget)}
                    onClose={() => setDeleteTarget(null)}
                    onDeleted={async () => { setDeleteTarget(null); await load(); setSuccessMsg('Chariot supprimé.'); }}
                />
            )}
        </Stack>
    );
}

// ─── MachinePnpPage ───────────────────────────────────────────────────────────

function MachinePnpPage() {
    const { activeProduction } = useBomSession();

    const [activeTab, setActiveTab] = useState(0);

    const [machines, setMachines] = useState([]);
    const [machinesLoading, setMachinesLoading] = useState(true);
    const [selectedMachine, setSelectedMachine] = useState(null);
    const [summary, setSummary] = useState(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [globalError, setGlobalError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const [createOpen, setCreateOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [assignLoading, setAssignLoading] = useState(false);

    const loadMachines = useCallback(async () => {
        setMachinesLoading(true);
        setGlobalError('');
        try {
            const res = await apiClient.get('/marketplace/machines?limit=100');
            const list = res.data?.data || [];
            setMachines(list);
            if (list.length > 0 && !selectedMachine) {
                setSelectedMachine(list[0]);
            }
        } catch (err) {
            setGlobalError(err.response?.data?.detail || err.message || 'Erreur chargement machines');
        } finally {
            setMachinesLoading(false);
        }
    }, [selectedMachine]);

    const loadSummary = useCallback(async (machine) => {
        if (!machine) { setSummary(null); return; }
        setSummaryLoading(true);
        try {
            const res = await apiClient.get(`/marketplace/machines/${machine.id}/summary`);
            setSummary(res.data);
        } catch (err) {
            setGlobalError(err.response?.data?.detail || err.message || 'Erreur chargement détails machine');
            setSummary(null);
        } finally {
            setSummaryLoading(false);
        }
    }, []);

    useEffect(() => { loadMachines(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (selectedMachine) loadSummary(selectedMachine);
    }, [selectedMachine, loadSummary]);

    const handleAssignProduction = async () => {
        if (!selectedMachine || !activeProduction?.id) return;
        setAssignLoading(true);
        setGlobalError('');
        try {
            await apiClient.patch(`/marketplace/productions/${activeProduction.id}`, {
                machine_id: selectedMachine.id,
            });
            setSuccessMsg(`Production "${activeProduction.name}" affectée à ${selectedMachine.name}.`);
            await loadSummary(selectedMachine);
            await loadMachines();
        } catch (err) {
            setGlobalError(err.response?.data?.detail || err.message || "Erreur lors de l'affectation");
        } finally {
            setAssignLoading(false);
        }
    };

    const isActiveProductionLinked = summary?.productions?.some(
        (p) => activeProduction?.id && p.id === activeProduction.id
    );

    useEffect(() => {
        if (!successMsg) return;
        const t = setTimeout(() => setSuccessMsg(''), 4000);
        return () => clearTimeout(t);
    }, [successMsg]);

    const tabSx = {
        fontSize: '0.8rem',
        minHeight: 40,
        textTransform: 'none',
        fontWeight: 500,
        color: '#71717a',
        '&.Mui-selected': { color: '#10b981' },
    };

    return (
        <Stack spacing={3}>
            <PageHeader
                eyebrow="Machine PnP"
                title="Gestion machine et production"
                description="Gérez vos machines PnP, affectez la production active et visualisez la séquence des BOM."
            />

            {globalError && (
                <Alert severity="error" onClose={() => setGlobalError('')}>{globalError}</Alert>
            )}
            {successMsg && (
                <Alert severity="success" onClose={() => setSuccessMsg('')}>{successMsg}</Alert>
            )}

            {/* Onglets principaux */}
            <Box sx={{ borderBottom: '1px solid #27272a' }}>
                <Tabs
                    value={activeTab}
                    onChange={(_, v) => setActiveTab(v)}
                    sx={{
                        minHeight: 40,
                        '& .MuiTabs-indicator': { backgroundColor: '#10b981' },
                    }}
                >
                    <Tab icon={<ViewListRoundedIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Séquence" sx={tabSx} />
                    <Tab icon={<SettingsInputComponentRoundedIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Feeders" sx={tabSx} />
                    <Tab icon={<ShoppingCartRoundedIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Chariots" sx={tabSx} />
                </Tabs>
            </Box>

            {/* Contenu onglets */}
            {activeTab === 0 && !machinesLoading && (
                <SequenceTab
                    summary={summary}
                    summaryLoading={summaryLoading}
                    activeProduction={activeProduction}
                    onAssignProduction={handleAssignProduction}
                    assignLoading={assignLoading}
                    isActiveProductionLinked={isActiveProductionLinked}
                    machines={machines}
                    loadMachines={loadMachines}
                    selectedMachine={selectedMachine}
                    setSelectedMachine={setSelectedMachine}
                    setCreateOpen={setCreateOpen}
                    setDeleteTarget={setDeleteTarget}
                />
            )}
            {activeTab === 0 && machinesLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress size={28} sx={{ color: '#059669' }} />
                </Box>
            )}
            {activeTab === 1 && <FeederTab />}
            {activeTab === 2 && <ChariotTab />}

            {/* Dialogs (séquence tab) */}
            <CreateMachineDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={loadMachines}
            />
            {deleteTarget && (
                <DeleteMachineDialog
                    machine={deleteTarget}
                    open={Boolean(deleteTarget)}
                    onClose={() => setDeleteTarget(null)}
                    onDeleted={() => {
                        setDeleteTarget(null);
                        if (selectedMachine?.id === deleteTarget?.id) setSelectedMachine(null);
                        loadMachines();
                    }}
                />
            )}
        </Stack>
    );
}

export default MachinePnpPage;
