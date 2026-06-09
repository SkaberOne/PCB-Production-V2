import React, { useEffect, useState } from 'react';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    MenuItem,
    Radio,
    RadioGroup,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import apiClient from '../../api/client';
import {
    PNP_EXPORT_COLUMNS,
    PNP_EXPORT_DEFAULT_COLUMNS,
    cartKindOptions,
    extractRequestError,
    normalizeExportColumns,
} from '../../utils/machinePnp';

/** Bloc de configuration du format d'export PnP (partagé création/édition). */
function ExportFormatSection({ format, setFormat, columns, setColumns, separator, setSeparator }) {
    const toggleColumn = (id) => {
        setColumns((current) => (current.includes(id)
            ? current.filter((colId) => colId !== id)
            : [...current, id]));
    };
    return (
        <Box sx={{ mt: 1, pt: 2, borderTop: '1px solid #27272a' }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#10b981', mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <FileDownloadOutlinedIcon sx={{ fontSize: 16 }} /> Format d'export PnP
            </Typography>
            <ToggleButtonGroup
                exclusive
                size="small"
                value={format}
                onChange={(_event, value) => { if (value) setFormat(value); }}
                sx={{
                    '& .MuiToggleButton-root': { textTransform: 'none', color: '#a1a1aa', borderColor: '#2f2f35', fontSize: '0.78rem' },
                    '& .Mui-selected': { backgroundColor: '#059669 !important', color: '#fff !important' },
                }}
            >
                <ToggleButton value="CSV">CSV (colonnes personnalisées)</ToggleButton>
                <ToggleButton value="TXT">TXT (BOM empreintes harmonisées)</ToggleButton>
            </ToggleButtonGroup>

            {format === 'CSV' ? (
                <>
                    <Typography sx={{ fontSize: '0.72rem', color: '#a1a1aa', mt: 1.75, mb: 1 }}>
                        Colonnes incluses — cliquer pour activer/désactiver
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                        {PNP_EXPORT_COLUMNS.map((col) => {
                            const active = columns.includes(col.id);
                            return (
                                <Chip
                                    key={col.id}
                                    size="small"
                                    label={col.required ? `${col.header} ·req` : col.header}
                                    onClick={col.required ? undefined : () => toggleColumn(col.id)}
                                    sx={{
                                        cursor: col.required ? 'default' : 'pointer',
                                        backgroundColor: active ? 'rgba(5,150,105,0.14)' : 'rgba(255,255,255,0.04)',
                                        color: active ? '#6ee7b7' : '#71717a',
                                        border: `1px solid ${active ? 'rgba(5,150,105,0.4)' : '#2f2f35'}`,
                                    }}
                                />
                            );
                        })}
                    </Stack>
                    <RadioGroup row value={separator} onChange={(event) => setSeparator(event.target.value)} sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.78rem', color: '#a1a1aa' } }}>
                        <FormControlLabel value="," control={<Radio size="small" sx={{ color: '#52525b', '&.Mui-checked': { color: '#10b981' } }} />} label="virgule ," />
                        <FormControlLabel value=";" control={<Radio size="small" sx={{ color: '#52525b', '&.Mui-checked': { color: '#10b981' } }} />} label="point-virgule ;" />
                    </RadioGroup>
                </>
            ) : (
                <Typography sx={{ fontSize: '0.78rem', color: '#71717a', mt: 1.75 }}>
                    Export simple : la BOM avec les empreintes harmonisées (Référence, Valeur, Empreinte, Qté), séparé par tabulation.
                </Typography>
            )}
        </Box>
    );
}

/** Numérotation physique du rail arrière (colonne « Feeder » de l'export).
 * Partagé création/édition. ASC = l'arrière prolonge l'avant (ex. 41→80) ;
 * DESC = l'arrière décroît de gauche à droite (ex. 80→41). L'avant reste 1→N/2. */
function FeederBackOrderSection({ value, setValue, numPositions }) {
    const total = Number.parseInt(numPositions, 10);
    const n = Number.isInteger(total) && total > 0 ? total : 80;
    const front = Math.ceil(n / 2);
    const ascExample = `${front + 1}→${n}`;
    const descExample = `${n}→${front + 1}`;
    return (
        <Box sx={{ mt: 1, pt: 2, borderTop: '1px solid #27272a' }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#10b981', mb: 1 }}>
                Numérotation du rail arrière
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: '#a1a1aa', mb: 1.25 }}>
                Sens des numéros de feeder à l'arrière, de gauche à droite. L'avant reste {`1→${front}`} sur toutes les machines.
            </Typography>
            <ToggleButtonGroup
                exclusive
                size="small"
                value={value}
                onChange={(_event, next) => { if (next) setValue(next); }}
                sx={{
                    '& .MuiToggleButton-root': { textTransform: 'none', color: '#a1a1aa', borderColor: '#2f2f35', fontSize: '0.78rem' },
                    '& .Mui-selected': { backgroundColor: '#059669 !important', color: '#fff !important' },
                }}
            >
                <ToggleButton value="ASC">{`Continue (${ascExample})`}</ToggleButton>
                <ToggleButton value="DESC">{`Inversée (${descExample})`}</ToggleButton>
            </ToggleButtonGroup>
        </Box>
    );
}

const NOZZLE_TYPE_OPTIONS = [501, 502, 503, 504, 505];
const NOZZLE_DEFAULT_TYPES = [503, 504, 505];

/** Pré-remplissage par défaut : du plus petit au plus grand, gauche→droite, en
 * blocs croissants (503/504/505). Doit rester aligné avec default_nozzle_layout
 * de serveur/src/utils/nozzles.py. Ex. 10 → 503,503,503,504,504,504,505,505,505,505. */
function defaultNozzleLayout(count) {
    const n = Number.isInteger(count) && count > 0 ? count : 0;
    if (!n) return [];
    const types = NOZZLE_DEFAULT_TYPES;
    const base = Math.floor(n / types.length);
    const remainder = n % types.length;
    const counts = types.map(() => base);
    for (let offset = 0; offset < remainder; offset += 1) {
        counts[types.length - 1 - offset] += 1;
    }
    const layout = [];
    types.forEach((nozzleType, i) => {
        for (let k = 0; k < counts[i]; k += 1) layout.push(nozzleType);
    });
    return layout;
}

/** Layout nozzle calé sur `count` : reprend la source, complète par le défaut croissant. */
function buildNozzleLayout(source, count) {
    const total = Number.isInteger(count) && count > 0 ? count : 0;
    const fallback = defaultNozzleLayout(total);
    return Array.from({ length: total }, (_value, index) => {
        const candidate = source && Number(source[index]);
        return NOZZLE_TYPE_OPTIONS.includes(candidate) ? candidate : fallback[index];
    });
}

/** Création d'une machine PnP. */
export function CreateMachineDialog({ open, onClose, onCreated }) {
    const [name, setName] = useState('');
    const [positions, setPositions] = useState('80');
    const [nozzles, setNozzles] = useState('');
    const [description, setDescription] = useState('');
    const [exportFormat, setExportFormat] = useState('CSV');
    const [exportColumns, setExportColumns] = useState(PNP_EXPORT_DEFAULT_COLUMNS);
    const [exportSeparator, setExportSeparator] = useState(',');
    const [feederBackOrder, setFeederBackOrder] = useState('ASC');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setName('');
            setPositions('80');
            setNozzles('');
            setDescription('');
            setExportFormat('CSV');
            setExportColumns(PNP_EXPORT_DEFAULT_COLUMNS);
            setExportSeparator(',');
            setFeederBackOrder('ASC');
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
                export_format: exportFormat,
                export_columns: normalizeExportColumns(exportColumns),
                export_separator: exportSeparator,
                feeder_back_order: feederBackOrder,
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
                    <FeederBackOrderSection value={feederBackOrder} setValue={setFeederBackOrder} numPositions={positions} />
                    <ExportFormatSection
                        format={exportFormat}
                        setFormat={setExportFormat}
                        columns={exportColumns}
                        setColumns={setExportColumns}
                        separator={exportSeparator}
                        setSeparator={setExportSeparator}
                    />
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
    const [categoryOptions, setCategoryOptions] = useState([]);

    // Catégories déjà créées (catalogue BOM + catégories réellement utilisées),
    // proposées dans le menu déroulant « Catégorie cible ».
    useEffect(() => {
        let active = true;
        apiClient.get('/bom/categories')
            .then((res) => {
                if (!active) return;
                const names = (res?.data?.items || [])
                    .map((item) => item?.name)
                    .filter((name) => typeof name === 'string' && name.trim());
                setCategoryOptions(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b)));
            })
            .catch(() => { if (active) setCategoryOptions([]); });
        return () => { active = false; };
    }, []);

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
                <Autocomplete
                    freeSolo
                    options={categoryOptions}
                    value={form.target_category || ''}
                    onChange={(_event, next) => update({ target_category: next || '' })}
                    onInputChange={(_event, next) => update({ target_category: next || '' })}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Catégorie cible"
                            size="small"
                            placeholder="Carrier Board"
                            helperText="Choisir une catégorie existante ou en saisir une nouvelle."
                        />
                    )}
                />
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
    const [exportFormat, setExportFormat] = useState('CSV');
    const [exportColumns, setExportColumns] = useState(PNP_EXPORT_DEFAULT_COLUMNS);
    const [exportSeparator, setExportSeparator] = useState(',');
    const [feederBackOrder, setFeederBackOrder] = useState('ASC');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (machine && open) {
            setName(machine.name || '');
            setPositions(String(machine.num_positions ?? 80));
            setNozzles(machine.num_nozzles == null ? '' : String(machine.num_nozzles));
            setNozzleLayout(Array.isArray(machine.nozzle_layout) ? machine.nozzle_layout : []);
            setDescription(machine.description || '');
            setExportFormat(machine.export_format === 'TXT' ? 'TXT' : 'CSV');
            setExportColumns(normalizeExportColumns(machine.export_columns));
            setExportSeparator(machine.export_separator === ';' ? ';' : ',');
            setFeederBackOrder(machine.feeder_back_order === 'DESC' ? 'DESC' : 'ASC');
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
                export_format: exportFormat,
                export_columns: normalizeExportColumns(exportColumns),
                export_separator: exportSeparator,
                feeder_back_order: feederBackOrder,
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
                    <FeederBackOrderSection value={feederBackOrder} setValue={setFeederBackOrder} numPositions={positions} />
                    <ExportFormatSection
                        format={exportFormat}
                        setFormat={setExportFormat}
                        columns={exportColumns}
                        setColumns={setExportColumns}
                        separator={exportSeparator}
                        setSeparator={setExportSeparator}
                    />
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
