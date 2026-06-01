import React from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckBoxOutlineBlankRoundedIcon from '@mui/icons-material/CheckBoxOutlineBlankRounded';
import CheckBoxRoundedIcon from '@mui/icons-material/CheckBoxRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import LibraryBooksRoundedIcon from '@mui/icons-material/LibraryBooksRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    Chip,
    CircularProgress,
    Collapse,
    IconButton,
    InputAdornment,
    Skeleton,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import apiClient from '../../api/client';
import { useBomSession } from '../../context/BomSessionContext';
import {
    formatStoredBomDate,
    groupStoredBomFiles,
    toggleStoredBomSelection,
} from '../../utils/bomFileExplorer';
import { hydrateStoredBomSelection } from '../../utils/productionWorkspace';

// ── Styles partagés ──────────────────────────────────────────────────────────
const cardSx = {
    backgroundColor: '#18181b',
    border: '1px solid #27272a',
};

const treeRowSx = {
    borderRadius: 1,
    px: 1,
    py: 0.5,
    cursor: 'default',
    transition: 'background-color 0.14s ease',
    '&:hover': { backgroundColor: '#27272a' },
};

// ── Sous-composant : ligne d'un item (côté) ──────────────────────────────────
const LibraryRevisionItem = React.memo(function LibraryRevisionItem({ item, selected, onToggle }) {
    return (
        <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ ...treeRowSx, pl: 4, cursor: 'pointer' }}
            onClick={() => onToggle(item)}
        >
            <Checkbox
                size="small"
                checked={selected}
                onChange={() => onToggle(item)}
                onClick={(e) => e.stopPropagation()}
                sx={{ p: 0.25, color: '#52525b', '&.Mui-checked': { color: '#6366f1' } }}
                icon={<CheckBoxOutlineBlankRoundedIcon fontSize="small" />}
                checkedIcon={<CheckBoxRoundedIcon fontSize="small" />}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    <Chip
                        label={item.side || 'TOP'}
                        size="small"
                        sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            backgroundColor: item.side === 'BOT' ? '#1e1b4b' : '#14532d',
                            color: item.side === 'BOT' ? '#a5b4fc' : '#86efac',
                            fontWeight: 600,
                        }}
                    />
                    <Typography variant="caption" sx={{ color: '#a1a1aa', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.file_name || '—'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#52525b', flexShrink: 0 }}>
                        {formatStoredBomDate(item.updated_at || item.created_at)}
                    </Typography>
                </Stack>
            </Box>
        </Stack>
    );
});

// ── Sous-composant : groupe référence ────────────────────────────────────────
const LibraryReferenceGroup = React.memo(function LibraryReferenceGroup({
    referenceEntry,
    selectedRevisionIds,
    onToggle,
}) {
    const [open, setOpen] = React.useState(true);

    const allItems = React.useMemo(
        () => referenceEntry.revisions.flatMap((rev) => rev.items),
        [referenceEntry.revisions],
    );

    const checkedCount = allItems.filter((item) => selectedRevisionIds.has(Number(item.bom_revision_id))).length;
    const allChecked = allItems.length > 0 && checkedCount === allItems.length;
    const indeterminate = checkedCount > 0 && !allChecked;

    const handleGroupToggle = () => {
        // Si tous cochés → tout décocher ; sinon → tout cocher
        allItems.forEach((item) => {
            const isSelected = selectedRevisionIds.has(Number(item.bom_revision_id));
            if (allChecked ? isSelected : !isSelected) {
                onToggle(item);
            }
        });
    };

    return (
        <Box>
            <Stack
                direction="row"
                alignItems="center"
                spacing={0.5}
                sx={{ ...treeRowSx, pl: 2 }}
            >
                <IconButton size="small" onClick={() => setOpen((v) => !v)} sx={{ color: '#71717a', p: 0.25 }}>
                    {open ? <ExpandMoreRoundedIcon fontSize="small" /> : <ChevronRightRoundedIcon fontSize="small" />}
                </IconButton>
                <Checkbox
                    size="small"
                    checked={allChecked}
                    indeterminate={indeterminate}
                    onChange={handleGroupToggle}
                    sx={{ p: 0.25, color: '#52525b', '&.Mui-checked': { color: '#6366f1' }, '&.MuiCheckbox-indeterminate': { color: '#6366f1' } }}
                    icon={<CheckBoxOutlineBlankRoundedIcon fontSize="small" />}
                    checkedIcon={<CheckBoxRoundedIcon fontSize="small" />}
                />
                <Typography
                    variant="body2"
                    sx={{ color: '#d4d4d8', fontWeight: 600, flex: 1, cursor: 'pointer' }}
                    onClick={() => setOpen((v) => !v)}
                >
                    {referenceEntry.reference}
                </Typography>
                {checkedCount > 0 && (
                    <Chip
                        label={`${checkedCount}/${allItems.length}`}
                        size="small"
                        sx={{ height: 18, fontSize: '0.65rem', backgroundColor: '#312e81', color: '#a5b4fc' }}
                    />
                )}
            </Stack>

            <Collapse in={open}>
                {referenceEntry.revisions.map((revEntry) =>
                    revEntry.items.map((item) => (
                        <LibraryRevisionItem
                            key={item.bom_revision_id}
                            item={item}
                            selected={selectedRevisionIds.has(Number(item.bom_revision_id))}
                            onToggle={onToggle}
                        />
                    )),
                )}
            </Collapse>
        </Box>
    );
});

// ── Sous-composant : groupe catégorie ────────────────────────────────────────
const LibraryCategoryGroup = React.memo(function LibraryCategoryGroup({
    categoryEntry,
    selectedRevisionIds,
    onToggle,
}) {
    const [open, setOpen] = React.useState(true);

    return (
        <Box>
            <Stack
                direction="row"
                alignItems="center"
                spacing={0.5}
                sx={{ ...treeRowSx, cursor: 'pointer' }}
                onClick={() => setOpen((v) => !v)}
            >
                <IconButton size="small" sx={{ color: '#71717a', p: 0.25, pointerEvents: 'none' }}>
                    {open ? <ExpandMoreRoundedIcon fontSize="small" /> : <ChevronRightRoundedIcon fontSize="small" />}
                </IconButton>
                <Typography variant="caption" sx={{ color: '#71717a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1 }}>
                    {categoryEntry.category}
                </Typography>
                <Typography variant="caption" sx={{ color: '#52525b' }}>
                    {categoryEntry.references.length} réf.
                </Typography>
            </Stack>

            <Collapse in={open}>
                {categoryEntry.references.map((refEntry) => (
                    <LibraryReferenceGroup
                        key={refEntry.reference}
                        referenceEntry={refEntry}
                        selectedRevisionIds={selectedRevisionIds}
                        onToggle={onToggle}
                    />
                ))}
            </Collapse>
        </Box>
    );
});

// ── Composant principal ──────────────────────────────────────────────────────
export default function BomLibraryCard() {
    const {
        setImportedBom,
        updateImportWorkspace,
        setSelectedBomEntries,
    } = useBomSession();

    const [items, setItems] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const [search, setSearch] = React.useState('');
    const [selectedEntries, setSelectedEntries] = React.useState([]);
    const [addLoading, setAddLoading] = React.useState(false);
    const [addFeedback, setAddFeedback] = React.useState({ type: 'info', message: '' });

    const deferredSearch = React.useDeferredValue(search);
    const loadRequestIdRef = React.useRef(0);
    const addAbortRef = React.useRef(null);

    // Cleanup à la destruction
    React.useEffect(() => {
        return () => { addAbortRef.current?.abort(); };
    }, []);

    // ── Chargement de la liste ─────────────────────────────────────────────
    const loadFiles = React.useCallback(async () => {
        const requestId = loadRequestIdRef.current + 1;
        loadRequestIdRef.current = requestId;
        setLoading(true);
        setError('');
        try {
            const response = await apiClient.get('/bom/files', {
                params: { search: deferredSearch.trim() || undefined, sort: 'alpha' },
            });
            if (loadRequestIdRef.current !== requestId) return;
            setItems(response.data?.items || []);
        } catch (requestError) {
            if (loadRequestIdRef.current !== requestId) return;
            setError(requestError.response?.data?.detail || requestError.message || 'Erreur lors du chargement des BOM');
        } finally {
            if (loadRequestIdRef.current === requestId) setLoading(false);
        }
    }, [deferredSearch]);

    React.useEffect(() => { loadFiles(); }, [loadFiles]);

    // ── Groupement ──────────────────────────────────────────────────────────
    const groupedItems = React.useMemo(() => groupStoredBomFiles(items), [items]);

    // ── Set des IDs sélectionnés (pour performances) ────────────────────────
    const selectedRevisionIds = React.useMemo(
        () => new Set(selectedEntries.map((e) => Number(e.bom_revision_id))),
        [selectedEntries],
    );

    // ── Toggle d'un item ────────────────────────────────────────────────────
    const handleToggle = React.useCallback((item) => {
        setSelectedEntries((current) => toggleStoredBomSelection(current, item));
    }, []);

    // ── Tout sélectionner / Tout désélectionner ─────────────────────────────
    const handleSelectAll = React.useCallback(() => {
        setSelectedEntries(items.length === selectedEntries.length ? [] : [...items]);
    }, [items, selectedEntries.length]);

    // ── Ajouter au workspace ────────────────────────────────────────────────
    const handleAddToWorkspace = React.useCallback(async () => {
        if (!selectedEntries.length) return;

        addAbortRef.current?.abort();
        const controller = new AbortController();
        addAbortRef.current = controller;

        setAddLoading(true);
        setAddFeedback({ type: 'info', message: '' });
        try {
            await hydrateStoredBomSelection({
                selection: selectedEntries,
                setImportedBom,
                updateImportWorkspace,
                setSelectedBomEntries,
                mergeWithExisting: true,
                signal: controller.signal,
            });
            const count = selectedEntries.length;
            setAddFeedback({ type: 'success', message: `${count} révision${count > 1 ? 's' : ''} ajoutée${count > 1 ? 's' : ''} au workspace.` });
            setSelectedEntries([]);
        } catch (requestError) {
            if (requestError.code === 'ERR_CANCELED' || requestError.name === 'CanceledError') return;
            setAddFeedback({
                type: 'error',
                message: requestError.message || 'Erreur lors de l\'ajout au workspace.',
            });
        } finally {
            setAddLoading(false);
        }
    }, [selectedEntries, setImportedBom, updateImportWorkspace, setSelectedBomEntries]);

    // Auto-dismiss du feedback success
    React.useEffect(() => {
        if (addFeedback.type === 'success' && addFeedback.message) {
            const timer = setTimeout(() => setAddFeedback({ type: 'info', message: '' }), 4000);
            return () => clearTimeout(timer);
        }
    }, [addFeedback.type, addFeedback.message]);

    const allSelected = items.length > 0 && selectedEntries.length === items.length;
    const someSelected = selectedEntries.length > 0 && !allSelected;

    return (
        <Card sx={cardSx}>
            <CardContent>
                <Stack spacing={2}>
                    {/* En-tête */}
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                        <Stack spacing={0.5}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                                <LibraryBooksRoundedIcon sx={{ color: '#6366f1', fontSize: 20 }} />
                                <Typography variant="h6" sx={{ color: '#f4f4f5', fontWeight: 600 }}>
                                    BOM enregistrées
                                </Typography>
                            </Stack>
                            <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                                Sélectionne des révisions déjà enregistrées et ajoute-les directement au workspace d&apos;import.
                            </Typography>
                        </Stack>
                        <Tooltip title="Actualiser la liste">
                            <IconButton
                                size="small"
                                onClick={loadFiles}
                                disabled={loading}
                                sx={{ color: '#71717a', flexShrink: 0, mt: 0.5 }}
                            >
                                {loading ? <CircularProgress size={16} /> : <RefreshRoundedIcon fontSize="small" />}
                            </IconButton>
                        </Tooltip>
                    </Stack>

                    {/* Feedback */}
                    {addFeedback.message && (
                        <Alert severity={addFeedback.type} onClose={() => setAddFeedback({ type: 'info', message: '' })}>
                            {addFeedback.message}
                        </Alert>
                    )}
                    {error && (
                        <Alert severity="error" onClose={() => setError('')}>{error}</Alert>
                    )}

                    {/* Barre de recherche */}
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="Rechercher une référence, révision…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchRoundedIcon sx={{ color: '#52525b', fontSize: 18 }} />
                                </InputAdornment>
                            ),
                        }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: '#111111',
                                '& fieldset': { borderColor: '#27272a' },
                                '&:hover fieldset': { borderColor: '#3f3f46' },
                                '&.Mui-focused fieldset': { borderColor: '#6366f1' },
                            },
                            '& .MuiInputBase-input': { color: '#f4f4f5' },
                        }}
                    />

                    {/* Liste groupée */}
                    <Box
                        sx={{
                            backgroundColor: '#111111',
                            border: '1px solid #27272a',
                            borderRadius: 1,
                            maxHeight: 340,
                            overflowY: 'auto',
                            p: 1,
                        }}
                    >
                        {loading && !items.length ? (
                            <Stack spacing={1}>
                                {[1, 2, 3].map((n) => <Skeleton key={n} variant="rounded" height={28} />)}
                            </Stack>
                        ) : groupedItems.length === 0 ? (
                            <Typography variant="body2" sx={{ color: '#52525b', textAlign: 'center', py: 3 }}>
                                {deferredSearch.trim()
                                    ? 'Aucune BOM ne correspond à la recherche.'
                                    : 'Aucune BOM enregistrée dans la bibliothèque.'}
                            </Typography>
                        ) : (
                            <Stack spacing={0.25}>
                                {groupedItems.map((catEntry) => (
                                    <LibraryCategoryGroup
                                        key={catEntry.category}
                                        categoryEntry={catEntry}
                                        selectedRevisionIds={selectedRevisionIds}
                                        onToggle={handleToggle}
                                    />
                                ))}
                            </Stack>
                        )}
                    </Box>

                    {/* Barre d'actions */}
                    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1.5}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Checkbox
                                size="small"
                                checked={allSelected}
                                indeterminate={someSelected}
                                onChange={handleSelectAll}
                                disabled={items.length === 0}
                                sx={{ p: 0.25, color: '#52525b', '&.Mui-checked': { color: '#6366f1' }, '&.MuiCheckbox-indeterminate': { color: '#6366f1' } }}
                                icon={<CheckBoxOutlineBlankRoundedIcon fontSize="small" />}
                                checkedIcon={<CheckBoxRoundedIcon fontSize="small" />}
                            />
                            <Typography variant="body2" sx={{ color: '#71717a' }}>
                                {selectedEntries.length > 0
                                    ? `${selectedEntries.length} sélectionnée${selectedEntries.length > 1 ? 's' : ''}`
                                    : 'Tout sélectionner'}
                            </Typography>
                        </Stack>

                        <Button
                            variant="contained"
                            size="small"
                            startIcon={addLoading ? <CircularProgress size={14} color="inherit" /> : <AddRoundedIcon />}
                            onClick={handleAddToWorkspace}
                            disabled={selectedEntries.length === 0 || addLoading}
                            sx={{ backgroundColor: '#6366f1', '&:hover': { backgroundColor: '#4f46e5' } }}
                        >
                            {addLoading
                                ? 'Chargement…'
                                : selectedEntries.length > 0
                                    ? `Ajouter ${selectedEntries.length} révision${selectedEntries.length > 1 ? 's' : ''} au workspace`
                                    : 'Ajouter au workspace'}
                        </Button>
                    </Stack>
                </Stack>
            </CardContent>
        </Card>
    );
}
