import React from 'react';
import apiClient, { extractApiError } from '../../api/client';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import LibraryBooksRoundedIcon from '@mui/icons-material/LibraryBooksRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DeleteComponentDialog from './DeleteComponentDialog';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Grid,
    MenuItem,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    TextField,
    Typography,
} from '@mui/material';
import { compactCellSx, compactTableContainerSx, compactTableSx } from '../../utils/compactTable';
import { componentFeederTypeOptions } from '../../utils/feederTypes';
import {
    applyMachineFootprintCatalogDefaults,
    buildComponentTypeRefreshFeedback,
    buildMachineFootprintOptions,
    buildLibraryImportFeedback,
    buildMachineFootprintCatalogLookup,
    componentToForm,
    emptyComponent,
    emptyFeedback,
    formatMachineFootprintCatalogSummary,
    isSupportedLibraryFile,
    lookupMachineFootprintCatalogEntry,
    normalizeMachineFootprintCatalogPayload,
    normalizeComponentsPayload,
    normalizePackageFields,
    pickComponentField,
    readComponentBooleanField,
    safeDecodeFileName,
    stickyEditorSx,
} from '../../utils/componentLibraryForm';
import { componentTypeOptions } from '../../utils/componentTypes';


const componentSortColumns = [
    { id: 'component_type', label: 'Type', width: '12%', valueKeys: ['component_type', 'Type'] },
    { id: 'value', label: 'Value', width: '22%', valueKeys: ['value', 'Value'] },
    { id: 'mpn', label: 'MPN', width: '18%', valueKeys: ['mpn', 'MPN'] },
    { id: 'footprint_pnp', label: 'MachineFootprint', width: '22%', valueKeys: ['footprint_pnp', 'MachineFootprint'] },
    { id: 'is_fixed_feeder', label: 'Fixe', width: '10%', valueKeys: ['is_fixed_feeder'] },
    { id: 'feeder_type', label: 'Type feeder', width: '16%', valueKeys: ['feeder_type', 'FeederType'] },
];

const componentSortLabels = [
    { id: 'id', label: 'Ajout recent' },
    ...componentSortColumns.map(({ id, label }) => ({ id, label })),
];

const SettingsComponentTableRow = React.memo(function SettingsComponentTableRow({
    item,
    index,
    selected,
    onSelect,
}) {
    return (
        <TableRow
            hover
            selected={selected}
            onClick={() => onSelect(item.id)}
            sx={{ cursor: 'pointer' }}
        >
            {componentSortColumns.map((column) => (
                <TableCell key={`${item.id || item.reference || index}-${column.id}`} sx={compactCellSx}>
                    {column.id === 'is_fixed_feeder'
                        ? (readComponentBooleanField(item, column.valueKeys) ? 'Oui' : 'Non')
                        : (pickComponentField(item, column.valueKeys) || '-')}
                </TableCell>
            ))}
        </TableRow>
    );
});

const componentEditorFields = [
    'reference',
    'value',
    'mpn',
    'component_type',
    'footprint_pnp',
    'tape_width_mm',
    'pitch_mm',
    'feeder_type',
    'package',
    'supplier_code',
    'footprint_eagle',
    'description',
    'notes',
];

function ComposantsPanel() {
    const allComponentsDisplayLimit = 10000;
    const fileInputRef = React.useRef(null);
    const machineFootprintDatalistId = 'component-machine-footprint-options';
    const componentTypeDatalistId = 'component-type-options';
    const [components, setComponents] = React.useState([]);
    const [componentForm, setComponentForm] = React.useState(emptyComponent);
    const [selectedComponentId, setSelectedComponentId] = React.useState(null);
    const [componentSearch, setComponentSearch] = React.useState('');
    const [componentOriginFilter, setComponentOriginFilter] = React.useState('all');
    const [componentSort, setComponentSort] = React.useState({ field: 'value', direction: 'asc' });
    const [libraryFile, setLibraryFile] = React.useState(null);
    const [machineFootprintCatalog, setMachineFootprintCatalog] = React.useState([]);
    const [machineFootprintLookup, setMachineFootprintLookup] = React.useState({});
    const [machineFootprintLoading, setMachineFootprintLoading] = React.useState(false);
    const [machineFootprintFeedback, setMachineFootprintFeedback] = React.useState(emptyFeedback);
    const [libraryLoading, setLibraryLoading] = React.useState(false);
    const [libraryImporting, setLibraryImporting] = React.useState(false);
    const [libraryExporting, setLibraryExporting] = React.useState(false);
    const [componentTypeRefreshing, setComponentTypeRefreshing] = React.useState(false);
    const [componentSaving, setComponentSaving] = React.useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
    const [conflict, setConflict] = React.useState(null); // données serveur à jour si conflit de version
    const [totalComponents, setTotalComponents] = React.useState(0);
    const [ambiguousComponentIds, setAmbiguousComponentIds] = React.useState([]);
    const [libraryFeedback, setLibraryFeedback] = React.useState(emptyFeedback);
    const [editorFeedback, setEditorFeedback] = React.useState(emptyFeedback);
    const deferredComponentSearch = React.useDeferredValue(componentSearch);
    const currentSortColumn = componentSortLabels.find((column) => column.id === componentSort.field) || componentSortLabels[0];
    const machineFootprintOptions = React.useMemo(
        () => buildMachineFootprintOptions(machineFootprintCatalog),
        [machineFootprintCatalog],
    );
    const machineFootprintOptionNodes = React.useMemo(
        () => machineFootprintOptions.map((entry) => (
            <option
                key={entry.machine_footprint}
                value={entry.machine_footprint}
            />
        )),
        [machineFootprintOptions],
    );
    const componentTypeOptionNodes = React.useMemo(
        () => componentTypeOptions.map((option) => (
            <option key={option} value={option} />
        )),
        [],
    );
    const componentFeederTypeMenuItems = React.useMemo(
        () => componentFeederTypeOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
        )),
        [],
    );
    const componentsById = React.useMemo(
        () => new Map(components.map((item) => [item.id, item])),
        [components],
    );
    const selectedMachineFootprintEntry = React.useMemo(() => lookupMachineFootprintCatalogEntry(
        machineFootprintLookup,
        componentForm.footprint_pnp || componentForm.package,
        componentForm.component_type,
    ), [
        componentForm.component_type,
        componentForm.footprint_pnp,
        componentForm.package,
        machineFootprintLookup,
    ]);
    const selectedComponent = React.useMemo(
        () => componentsById.get(selectedComponentId) || null,
        [componentsById, selectedComponentId],
    );
    const handleSelectComponent = React.useCallback((componentId) => {
        React.startTransition(() => {
            setSelectedComponentId(componentId);
        });
    }, []);
    const ambiguousComponentIdSet = React.useMemo(
        () => new Set(ambiguousComponentIds.map((value) => Number(value))),
        [ambiguousComponentIds],
    );
    const selectedComponentRequiresTypeConfirmation = ambiguousComponentIdSet.has(Number(selectedComponentId || 0));
    const loadComponents = React.useCallback(async () => {
        setLibraryLoading(true);
        try {
            const response = await apiClient.get(`/bom/components`, {
                params: {
                    skip: 0,
                    limit: allComponentsDisplayLimit,
                    ...(deferredComponentSearch.trim() ? { search: deferredComponentSearch.trim() } : {}),
                    ...(componentOriginFilter === 'bom' ? { created_from_bom: true } : {}),
                    sort_by: componentSort.field,
                    sort_dir: componentSort.direction,
                },
            });
            const nextComponents = normalizeComponentsPayload(response.data);
            setComponents(nextComponents);
            setTotalComponents(Number(response.headers?.['x-total-count'] || nextComponents.length || 0));
        } catch (error) {
            setComponents([]);
            setTotalComponents(0);
            setLibraryFeedback({
                status: 'error',
                message: extractApiError(error) || 'Erreur lors du chargement des composants',
                details: [],
            });
        } finally {
            setLibraryLoading(false);
        }
    }, [allComponentsDisplayLimit, componentOriginFilter, componentSort.direction, componentSort.field, deferredComponentSearch]);
    const scheduleBackgroundComponentReload = React.useCallback(() => {
        if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(() => {
                loadComponents();
            });
            return;
        }

        window.setTimeout(() => {
            loadComponents();
        }, 0);
    }, [loadComponents]);
    React.useEffect(() => { loadComponents(); }, [loadComponents]);
    const refreshComponentTypes = async () => {
        setComponentTypeRefreshing(true);
        setLibraryFeedback(emptyFeedback);
        try {
            const response = await apiClient.post(`/bom/components/types/refresh`);
            setAmbiguousComponentIds(Array.isArray(response.data?.ambiguous_component_ids) ? response.data.ambiguous_component_ids : []);
            setLibraryFeedback(buildComponentTypeRefreshFeedback(response.data));
            await loadComponents();
        } catch (error) {
            setLibraryFeedback({
                status: 'error',
                message: extractApiError(error) || 'Erreur lors du rattrapage automatique des types',
                details: [],
            });
        } finally {
            setComponentTypeRefreshing(false);
        }
    };
    const loadMachineFootprints = React.useCallback(async () => {
        setMachineFootprintLoading(true);
        try {
            const response = await apiClient.get(`/bom/machine-footprints`, {
                params: { limit: 5000 },
            });
            const entries = normalizeMachineFootprintCatalogPayload(response.data);
            setMachineFootprintCatalog(entries);
            setMachineFootprintLookup(buildMachineFootprintCatalogLookup(entries));
        } catch (error) {
            setMachineFootprintCatalog([]);
            setMachineFootprintLookup({});
            setMachineFootprintFeedback({
                status: 'error',
                message: extractApiError(error) || 'Erreur lors du chargement du catalogue MachineFootprint',
                details: [],
            });
        } finally {
            setMachineFootprintLoading(false);
        }
    }, []);
    React.useEffect(() => { loadMachineFootprints(); }, [loadMachineFootprints]);
    React.useEffect(() => {
        if (!selectedComponentId) {
            setComponentForm(emptyComponent);
            return;
        }
        const selected = selectedComponent;
        if (!selected) {
            setSelectedComponentId(null);
            setComponentForm(emptyComponent);
            return;
        }
        const nextForm = componentToForm(selected);
        const catalogEntry = lookupMachineFootprintCatalogEntry(
            machineFootprintLookup,
            nextForm.footprint_pnp || nextForm.package,
            nextForm.component_type,
        );
        setComponentForm(catalogEntry ? applyMachineFootprintCatalogDefaults(nextForm, catalogEntry) : nextForm);
    }, [machineFootprintLookup, selectedComponent, selectedComponentId]);
    const onComponentChange = React.useCallback((field) => (event) => setComponentForm((current) => {
        const value = event.target.value;
        if (field === 'package') {
            const nextForm = {
                ...current,
                ...normalizePackageFields(value, value),
            };
            const catalogEntry = lookupMachineFootprintCatalogEntry(machineFootprintLookup, value, current.component_type);
            return catalogEntry ? applyMachineFootprintCatalogDefaults(nextForm, catalogEntry) : nextForm;
        }
        if (field === 'footprint_pnp') {
            const nextForm = {
                ...current,
                ...normalizePackageFields(value, value),
            };
            const catalogEntry = lookupMachineFootprintCatalogEntry(machineFootprintLookup, value, current.component_type);
            return catalogEntry ? applyMachineFootprintCatalogDefaults(nextForm, catalogEntry) : nextForm;
        }
        if (field === 'component_type') {
            const nextForm = { ...current, [field]: value };
            const catalogEntry = lookupMachineFootprintCatalogEntry(
                machineFootprintLookup,
                current.footprint_pnp || current.package,
                value,
            );
            return catalogEntry ? applyMachineFootprintCatalogDefaults(nextForm, catalogEntry) : nextForm;
        }
        return { ...current, [field]: value };
    }), [machineFootprintLookup]);
    const componentChangeHandlers = React.useMemo(
        () => Object.fromEntries(componentEditorFields.map((field) => [field, onComponentChange(field)])),
        [onComponentChange],
    );
    const clearComponentSearch = React.useCallback(() => {
        setComponentSearch('');
    }, []);
    const setComponentLibraryView = React.useCallback((nextFilter) => {
        setComponentOriginFilter(nextFilter);
        if (nextFilter === 'bom') {
            setComponentSort({ field: 'id', direction: 'desc' });
        }
    }, []);
    const toggleComponentSort = React.useCallback((field) => {
        setComponentSort((current) => ({
            field,
            direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    }, []);
    const handleLibraryFileSelection = (event) => {
        const nextFile = event.target.files?.[0] || null;
        if (nextFile && !isSupportedLibraryFile(nextFile)) {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            setLibraryFile(null);
            setLibraryFeedback({
                status: 'error',
                message: 'Seuls les fichiers Excel .xlsx ou .xlsm sont supportés pour la bibliothèque composants.',
                details: [],
            });
            return;
        }
        setLibraryFile(nextFile);
    };
    const resetComponentForm = React.useCallback(() => {
        const selected = selectedComponent;
        if (!selected) {
            setComponentForm(emptyComponent);
            return;
        }
        const nextForm = componentToForm(selected);
        const catalogEntry = lookupMachineFootprintCatalogEntry(
            machineFootprintLookup,
            nextForm.footprint_pnp || nextForm.package,
            nextForm.component_type,
        );
        setComponentForm(catalogEntry ? applyMachineFootprintCatalogDefaults(nextForm, catalogEntry) : nextForm);
    }, [machineFootprintLookup, selectedComponent]);
    const saveComponent = React.useCallback(async () => {
        if (!selectedComponentId || !componentForm.reference.trim()) {
            setEditorFeedback({ status: 'error', message: 'Sélectionnez un composant et renseignez une référence valide.', details: [] });
            return;
        }
        setComponentSaving(true);
        setEditorFeedback(emptyFeedback);
        try {
            const response = await apiClient.put(`/bom/components/${selectedComponentId}`, {
                id: selectedComponentId,
                version: selectedComponent?.version ?? null,
                reference: componentForm.reference,
                value: componentForm.value || null,
                mpn: componentForm.mpn || null,
                component_type: componentForm.component_type || null,
                package: componentForm.package || null,
                tape_width_mm: componentForm.tape_width_mm === '' ? null : Number(componentForm.tape_width_mm),
                pitch_mm: componentForm.pitch_mm === '' ? null : Number(componentForm.pitch_mm),
                supplier_code: componentForm.supplier_code || null,
                footprint_eagle: componentForm.footprint_eagle || null,
                footprint_pnp: componentForm.footprint_pnp || null,
                feeder_type: componentForm.feeder_type || null,
                description: componentForm.description || null,
                notes: componentForm.notes || null,
            });
            const normalizedSavedComponent = normalizeComponentsPayload([response.data])[0] || response.data;
            setComponents((current) => current.map((item) => (
                item.id === selectedComponentId ? normalizedSavedComponent : item
            )));
            setAmbiguousComponentIds((current) => current.filter((value) => Number(value) !== Number(selectedComponentId)));
            setEditorFeedback({ status: 'success', message: 'Composant mis à jour dans la base de données.', details: [] });
            setConflict(null);
            scheduleBackgroundComponentReload();
        } catch (error) {
            const status = error.response?.status;
            const detail = error.response?.data?.detail;
            if (status === 409 && detail && typeof detail === 'object' && detail.code === 'version_conflict') {
                // Concurrence optimiste : un autre poste a modifié entre-temps.
                const fresh = normalizeComponentsPayload([detail.current])[0] || detail.current;
                setConflict(fresh);
                setEditorFeedback({
                    status: 'warning',
                    message: detail.message || 'Ce composant a été modifié par un autre poste. Recharge les valeurs à jour avant d\'enregistrer.',
                    details: [],
                });
            } else {
                setEditorFeedback({
                    status: 'error',
                    message: extractApiError(error) || 'Erreur lors de la mise à jour du composant',
                    details: [],
                });
            }
        } finally {
            setComponentSaving(false);
        }
    }, [
        componentForm.component_type,
        componentForm.description,
        componentForm.feeder_type,
        componentForm.footprint_eagle,
        componentForm.footprint_pnp,
        componentForm.mpn,
        componentForm.notes,
        componentForm.package,
        componentForm.pitch_mm,
        componentForm.reference,
        componentForm.supplier_code,
        componentForm.tape_width_mm,
        componentForm.value,
        scheduleBackgroundComponentReload,
        selectedComponent,
        selectedComponentId,
    ]);
    const handleComponentDeleted = React.useCallback((deletedId) => {
        setComponents((current) => current.filter((item) => item.id !== deletedId));
        setSelectedComponentId((current) => (current === deletedId ? null : current));
        setTotalComponents((current) => Math.max(0, current - 1));
        setEditorFeedback({ status: 'success', message: 'Composant supprimé de la base de données.', details: [] });
        scheduleBackgroundComponentReload();
    }, [scheduleBackgroundComponentReload]);
    const reloadConflict = React.useCallback(() => {
        if (!conflict) return;
        setComponents((current) => current.map((item) => (item.id === conflict.id ? conflict : item)));
        setConflict(null);
        setEditorFeedback({ status: 'info', message: 'Valeurs à jour rechargées. Tu peux ré-appliquer tes modifications puis enregistrer.', details: [] });
    }, [conflict]);
    const importLibrary = async () => {
        if (!libraryFile) {
            setLibraryFeedback({ status: 'error', message: "Choisissez un fichier Excel avant de lancer l'import.", details: [] });
            return;
        }
        if (!isSupportedLibraryFile(libraryFile)) {
            setLibraryFeedback({
                status: 'error',
                message: 'Seuls les fichiers Excel .xlsx ou .xlsm sont supportés pour la bibliothèque composants.',
                details: [],
            });
            return;
        }
        setLibraryImporting(true);
        setLibraryFeedback(emptyFeedback);
        try {
            const formData = new FormData();
            formData.append('file', libraryFile);
            const response = await apiClient.post(`/bom/components/library/import`, formData);
            setLibraryFeedback(buildLibraryImportFeedback(response.data));
            setLibraryFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            if (
                Number(response.data?.item_count || 0) > 0
                || Number(response.data?.created_count || 0) > 0
                || Number(response.data?.updated_count || 0) > 0
            ) {
                await loadComponents();
            }
        } catch (error) {
            setLibraryFeedback({
                status: 'error',
                message: extractApiError(error) || "Erreur lors de l'import de la bibliothèque composants",
                details: [],
            });
        } finally {
            setLibraryImporting(false);
        }
    };
    const exportLibrary = async () => {
        setLibraryExporting(true);
        setLibraryFeedback(emptyFeedback);
        try {
            const response = await apiClient.get(`/bom/components/library/export`, { responseType: 'blob' });
            const blob = new Blob([response.data], { type: response.headers?.['content-type'] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const blobUrl = window.URL.createObjectURL(blob);
            const match = (response.headers?.['content-disposition'] || '').match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = safeDecodeFileName(match?.[1] || match?.[2] || 'bibliothèque-composants.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);
            setLibraryFeedback({ status: 'success', message: 'Export lancé au format Excel.', details: [] });
        } catch (error) {
            setLibraryFeedback({
                status: 'error',
                message: extractApiError(error) || "Erreur lors de l'export de la bibliothèque composants",
                details: [],
            });
        } finally {
            setLibraryExporting(false);
        }
    };

    return (
        <Stack spacing={3}>
                    {editorFeedback.status !== 'idle' ? (
                        <Alert severity={editorFeedback.status} onClose={() => setEditorFeedback(emptyFeedback)}>
                            {editorFeedback.message}
                        </Alert>
                    ) : null}
                    {conflict ? (
                        <Alert
                            severity="warning"
                            action={<Button color="inherit" size="small" onClick={reloadConflict}>Recharger</Button>}
                        >
                            Un autre poste a modifié « {conflict.value || conflict.reference} » depuis ton ouverture.
                            Recharge les valeurs à jour, puis ré-applique ta modification avant d'enregistrer.
                        </Alert>
                    ) : null}
                    {libraryFeedback.status !== 'idle' ? (
                        <Alert severity={libraryFeedback.status} onClose={() => setLibraryFeedback(emptyFeedback)}>
                            <Stack spacing={1}>
                                <span>{libraryFeedback.message}</span>
                                {libraryFeedback.details?.length ? (
                                    <Box component="ul" sx={{ mb: 0, mt: 0, pl: 2.5 }}>
                                        {libraryFeedback.details.slice(0, 5).map((detail) => (
                                            <li key={detail}>{detail}</li>
                                        ))}
                                        {libraryFeedback.details.length > 5 ? <li>{`... ${libraryFeedback.details.length - 5} autre(s) message(s)`}</li> : null}
                                    </Box>
                                ) : null}
                            </Stack>
                        </Alert>
                    ) : null}

            <Card sx={{ backgroundColor: '#18181b', border: '1px solid #1f2937' }}>
                <CardContent>
                        <Stack spacing={3}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <LibraryBooksRoundedIcon sx={{ color: '#3b82f6' }} />
                                <Typography variant="h6">Catalogue composants</Typography>
                            </Stack>
                            <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                            La liste de composants est chargée côté serveur, avec recherche, tri, pagination et un focus rapide sur les ajouts créés depuis les BOM.
                            </Typography>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
                            <Button variant="outlined" startIcon={<UploadFileRoundedIcon />} onClick={() => fileInputRef.current?.click()}>Choisir un fichier</Button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
                                onChange={handleLibraryFileSelection}
                                style={{ display: 'none' }}
                            />
                            <Typography variant="body2" sx={{ color: 'text.secondary', flexGrow: 1 }}>
                                {libraryFile ? `Fichier sélectionné : ${libraryFile.name}` : 'Aucun fichier sélectionné.'}
                            </Typography>
                            <Button variant="contained" onClick={importLibrary} disabled={libraryImporting || !libraryFile}>{libraryImporting ? 'Import en cours...' : 'Importer la bibliothèque'}</Button>
                            <Button variant="outlined" startIcon={<DownloadRoundedIcon />} onClick={exportLibrary} disabled={libraryExporting}>{libraryExporting ? 'Export en cours...' : 'Exporter'}</Button>
                            <Button
                                variant="text"
                                onClick={refreshComponentTypes}
                                disabled={libraryLoading || componentTypeRefreshing}
                            >
                                {componentTypeRefreshing ? 'Rattrapage...' : 'Actualiser'}
                            </Button>
                        </Stack>
                        <Grid container spacing={3} sx={{ width: '100%', m: 0 }}>
                            <Grid item xs={12} lg={9}>
                                <Card variant="outlined" sx={{ borderColor: 'var(--border)' }}>
                                    <CardContent>
                                        <Stack spacing={2}>
                                            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', lg: 'center' }}>
                                                <TextField
                                                    fullWidth
                                                    size="small"
                                                    label="Recherche composants"
                                                    placeholder="Type, Référence, Value, MPN, footprint..."
                                                    value={componentSearch}
                                                    onChange={(event) => {
                                                        setComponentSearch(event.target.value);
                                                    }}
                                                />
                                                <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'space-between', lg: 'flex-end' }}>
                                                    <Chip
                                                        size="small"
                                                        variant="outlined"
                                                        label={`Tri : ${currentSortColumn.label} ${componentSort.direction === 'asc' ? 'croissant' : 'decroissant'}`}
                                                    />
                                                    <Chip
                                                        size="small"
                                                        color={componentOriginFilter === 'bom' ? 'primary' : 'default'}
                                                        variant={componentOriginFilter === 'bom' ? 'filled' : 'outlined'}
                                                        label={componentOriginFilter === 'bom' ? 'Ajouts BOM' : 'Toute la base'}
                                                        onClick={() => setComponentLibraryView(componentOriginFilter === 'bom' ? 'all' : 'bom')}
                                                        sx={{ cursor: 'pointer' }}
                                                    />
                                                    <Chip
                                                        size="small"
                                                        variant="outlined"
                                                        label={components.length >= totalComponents
                                                            ? `${totalComponents} composant(s) affiches`
                                                            : `${components.length}/${totalComponents} composant(s) affiches`}
                                                    />
                                                    <Button size="small" variant="text" onClick={clearComponentSearch} disabled={!componentSearch.trim()}>
                                                        Effacer recherche
                                                    </Button>
                                                </Stack>
                                            </Stack>
                                            {libraryLoading ? (
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <CircularProgress size={18} />
                                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Chargement de la bibliothèque composants...</Typography>
                                                </Stack>
                                            ) : (
                                                <>
                                                    <TableContainer sx={{ ...compactTableContainerSx, maxHeight: 460, overflowY: 'auto' }}>
                                                        <Table stickyHeader sx={compactTableSx}>
                                                            <TableHead>
                                                                <TableRow>
                                                                    {componentSortColumns.map((column) => (
                                                                        <TableCell key={column.id} sx={{ width: column.width }}>
                                                                            <TableSortLabel
                                                                                active={componentSort.field === column.id}
                                                                                direction={componentSort.field === column.id ? componentSort.direction : 'asc'}
                                                                                onClick={() => toggleComponentSort(column.id)}
                                                                                sx={{
                                                                                    color: 'inherit',
                                                                                    '&.Mui-active': { color: 'inherit' },
                                                                                    '& .MuiTableSortLabel-icon': { color: '#a1a1aa !important' },
                                                                                }}
                                                                            >
                                                                                {column.label}
                                                                            </TableSortLabel>
                                                                        </TableCell>
                                                                    ))}
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {!components.length ? (
                                                                    <TableRow>
                                                                        <TableCell colSpan={componentSortColumns.length}>
                                                                            <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
                                                                                Aucun composant correspondant pour le moment.
                                                                            </Typography>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ) : components.map((item, index) => (
                                                                    <SettingsComponentTableRow
                                                                        key={item.id || item.reference || index}
                                                                        item={item}
                                                                        index={index}
                                                                        selected={item.id === selectedComponentId}
                                                                        onSelect={handleSelectComponent}
                                                                    />
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </TableContainer>
                                                </>
                                            )}
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid
                                item
                                xs={12}
                                lg={3}
                                sx={{
                                    display: 'flex',
                                    justifyContent: { xs: 'stretch', lg: 'flex-end' },
                                    pl: { lg: 1 },
                                }}
                            >
                                <Card
                                    variant="outlined"
                                    sx={{
                                        borderColor: 'var(--border)',
                                        width: '100%',
                                        maxWidth: 320,
                                        minWidth: 0,
                                        ml: { lg: 'auto' },
                                        ...stickyEditorSx,
                                    }}
                                >
                                    <CardContent sx={{ p: 1.5, overflow: 'hidden', '&:last-child': { pb: 1.5 } }}>
                                        <Stack spacing={1.25}>
                                            <Stack spacing={0.75}>
                                                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
                                                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                                        Edition composant
                                                    </Typography>
                                                    <Chip
                                                        size="small"
                                                        label={selectedComponentId ? `ID ${selectedComponentId}` : 'Aucune selection'}
                                                        color={selectedComponentId ? 'primary' : 'default'}
                                                        variant={selectedComponentId ? 'filled' : 'outlined'}
                                                    />
                                                </Stack>
                                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.5 }}>
                                                    {selectedComponentId
                                                        ? 'Édition rapide sans quitter la bibliothèque.'
                                                        : "Sélectionne une ligne pour ouvrir l'éditeur."}
                                                </Typography>
                                            </Stack>

                                            <Grid container spacing={1}>
                                                <Grid item xs={12}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            label="Référence"
                                                            required
                                                            value={componentForm.reference}
                                                            onChange={componentChangeHandlers.reference}
                                                            disabled={!selectedComponentId}
                                                            error={!!selectedComponentId && !componentForm.reference.trim()}
                                                            helperText={!!selectedComponentId && !componentForm.reference.trim() ? 'Référence obligatoire pour enregistrer.' : ''}
                                                        />
                                                </Grid>
                                                <Grid item xs={12}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            label="Value"
                                                            value={componentForm.value}
                                                            onChange={componentChangeHandlers.value}
                                                            disabled={!selectedComponentId}
                                                        />
                                                </Grid>
                                                <Grid item xs={12}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            label="MPN"
                                                            value={componentForm.mpn}
                                                            onChange={componentChangeHandlers.mpn}
                                                            disabled={!selectedComponentId}
                                                        />
                                                </Grid>
                                                <Grid item xs={12}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            label="Type"
                                                            value={componentForm.component_type}
                                                            onChange={componentChangeHandlers.component_type}
                                                            disabled={!selectedComponentId}
                                                            inputProps={{ list: componentTypeDatalistId }}
                                                        />
                                                        <datalist id={componentTypeDatalistId}>
                                                            {componentTypeOptionNodes}
                                                        </datalist>
                                                    {selectedComponentRequiresTypeConfirmation ? (
                                                        <Typography variant="caption" sx={{ mt: 0.5, color: 'warning.main', display: 'block', lineHeight: 1.4 }}>
                                                            Type propose automatiquement depuis la reference BOM. Enregistre la fiche pour confirmer ou corrige la valeur.
                                                        </Typography>
                                                    ) : null}
                                                </Grid>
                                                <Grid item xs={12}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            label="MachineFootprint"
                                                            value={componentForm.footprint_pnp}
                                                            onChange={componentChangeHandlers.footprint_pnp}
                                                            disabled={!selectedComponentId}
                                                            inputProps={{ list: machineFootprintDatalistId }}
                                                        />
                                                        <datalist id={machineFootprintDatalistId}>
                                                            {machineFootprintOptionNodes}
                                                        </datalist>
                                                    <Typography variant="caption" sx={{ mt: 0.5, color: 'text.secondary', display: 'block', lineHeight: 1.4 }}>
                                                        {selectedMachineFootprintEntry
                                                            ? formatMachineFootprintCatalogSummary(selectedMachineFootprintEntry)
                                                            : `${machineFootprintOptions.length} empreinte(s) machine disponible(s).`}
                                                    </Typography>
                                                </Grid>
                                                <Grid item xs={12}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            type="number"
                                                            label="Tape width (mm)"
                                                            value={componentForm.tape_width_mm}
                                                            onChange={componentChangeHandlers.tape_width_mm}
                                                            disabled={!selectedComponentId}
                                                        />
                                                </Grid>
                                                <Grid item xs={12}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            type="number"
                                                            label="Pitch (mm)"
                                                            value={componentForm.pitch_mm}
                                                            onChange={componentChangeHandlers.pitch_mm}
                                                            disabled={!selectedComponentId}
                                                        />
                                                </Grid>
                                                <Grid item xs={12}>
                                                        <TextField
                                                            fullWidth
                                                            select
                                                            size="small"
                                                            label="Type feeder"
                                                            value={componentForm.feeder_type || ''}
                                                            onChange={componentChangeHandlers.feeder_type}
                                                            disabled={!selectedComponentId}
                                                        >
                                                            <MenuItem value="">Aucun</MenuItem>
                                                            {componentFeederTypeMenuItems}
                                                        </TextField>
                                                </Grid>
                                                <Grid item xs={12}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            label="Package"
                                                            value={componentForm.package}
                                                            onChange={componentChangeHandlers.package}
                                                            disabled={!selectedComponentId}
                                                        />
                                                </Grid>
                                            </Grid>

                                            <Accordion
                                                disableGutters
                                                elevation={0}
                                                defaultExpanded={Boolean(componentForm.description || componentForm.notes)}
                                                sx={{
                                                    backgroundColor: 'transparent',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: 2,
                                                    '&:before': { display: 'none' },
                                                }}
                                            >
                                                <AccordionSummary
                                                    expandIcon={<ExpandMoreRoundedIcon />}
                                                    sx={{ minHeight: 40, px: 1.5 }}
                                                >
                                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                        Champs avances et notes
                                                    </Typography>
                                                </AccordionSummary>
                                                <AccordionDetails sx={{ px: 1.5, pb: 1.5, pt: 0 }}>
                                                    <Stack spacing={1}>
                                                        <TextField fullWidth size="small" label="Code fournisseur" value={componentForm.supplier_code} onChange={componentChangeHandlers.supplier_code} disabled={!selectedComponentId} />
                                                        <TextField fullWidth size="small" label="Footprint Eagle" value={componentForm.footprint_eagle} onChange={componentChangeHandlers.footprint_eagle} disabled={!selectedComponentId} />
                                                        <TextField fullWidth size="small" label="Description" value={componentForm.description} onChange={componentChangeHandlers.description} disabled={!selectedComponentId} multiline minRows={2} />
                                                        <TextField fullWidth size="small" label="Notes" value={componentForm.notes} onChange={componentChangeHandlers.notes} disabled={!selectedComponentId} multiline minRows={2} />
                                                    </Stack>
                                                </AccordionDetails>
                                            </Accordion>

                                            <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    color="error"
                                                    startIcon={<DeleteOutlineRoundedIcon />}
                                                    onClick={() => setDeleteDialogOpen(true)}
                                                    disabled={!selectedComponentId}
                                                >
                                                    Supprimer
                                                </Button>
                                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                    <Button size="small" variant="outlined" onClick={resetComponentForm} disabled={!selectedComponentId} sx={{ minWidth: 94 }}>
                                                        Annuler
                                                    </Button>
                                                    <Button size="small" variant="contained" onClick={saveComponent} disabled={!selectedComponentId || componentSaving} sx={{ minWidth: 110 }}>
                                                        {componentSaving ? 'Enregistrement...' : 'Enregistrer'}
                                                    </Button>
                                                </Stack>
                                            </Stack>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    </Stack>
                </CardContent>
            </Card>
            <DeleteComponentDialog
                open={deleteDialogOpen}
                component={selectedComponentId ? {
                    id: selectedComponentId,
                    label: componentForm.value || componentForm.reference || `#${selectedComponentId}`,
                } : null}
                onClose={() => setDeleteDialogOpen(false)}
                onDeleted={handleComponentDeleted}
            />
        </Stack>
    );
}

export default ComposantsPanel;
