import React from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
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
    DialogTitle,
    Grid,
    IconButton,
    InputAdornment,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';

import apiClient, { extractApiError } from '../api/client';
import PageHeader from '../components/common/PageHeader';
import ConfirmDialog from '../components/common/ConfirmDialog';
import BomLibraryDetail from '../components/library/BomLibraryDetail';
import {
    DEFAULT_UNCATEGORIZED_CATEGORY,
    groupStoredBomFiles,
} from '../utils/bomFileExplorer';

const cardSx = {
    backgroundColor: '#18181b',
    border: '1px solid #27272a',
};

const treeCategorySx = {
    px: 1.25,
    py: 1,
    borderRadius: 1,
    cursor: 'pointer',
    transition: 'background-color 0.14s ease',
    color: '#e4e4e7',
    fontWeight: 600,
    fontSize: '0.875rem',
    '&:hover': { backgroundColor: '#27272a' },
};

const treeReferenceSx = {
    pl: 3.5,
    pr: 1.25,
    py: 0.75,
    borderRadius: 1,
    cursor: 'pointer',
    fontSize: '0.875rem',
    color: '#a1a1aa',
    transition: 'background-color 0.14s ease, color 0.14s ease',
    '&:hover': { backgroundColor: '#27272a', color: '#f4f4f5' },
};

const treeReferenceSelectedSx = {
    ...treeReferenceSx,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    color: '#10b981',
    fontWeight: 600,
    '&:hover': { backgroundColor: 'rgba(16, 185, 129, 0.18)', color: '#10b981' },
};

/**
 * Bibliothèque BOM — explorer en lecture seule de toutes les BOM stockées.
 *
 * Layout : 2 colonnes
 *   - gauche : tree explorer par catégorie → références
 *   - droite : détail de la référence sélectionnée (table des révisions/faces + actions)
 *
 * Endpoints utilisés :
 *   - GET    /bom/files          : liste plate des fichiers BOM
 *   - GET    /bom/categories     : catégories existantes
 *   - POST   /bom/categories     : créer une catégorie
 *   - PATCH  /bom/references/{id}/category : changer la catégorie d'une référence
 *   - DELETE /bom/files/{rev_id} : supprimer une révision
 */
function BomFilesPage() {
    const [files, setFiles] = React.useState([]);
    const [categories, setCategories] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(null);
    const [search, setSearch] = React.useState('');
    const [expandedCategories, setExpandedCategories] = React.useState(new Set());
    const [selectedReferenceId, setSelectedReferenceId] = React.useState(null);
    const [categoryDialogOpen, setCategoryDialogOpen] = React.useState(false);
    const [newCategoryName, setNewCategoryName] = React.useState('');
    const [pendingDelete, setPendingDelete] = React.useState(null);

    // ── Chargement initial ──────────────────────────────────────────────────
    const loadData = React.useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [filesRes, catsRes] = await Promise.all([
                apiClient.get('/bom/files'),
                apiClient.get('/bom/categories'),
            ]);
            setFiles(filesRes?.data?.items || []);
            setCategories(catsRes?.data?.items || []);
        } catch (err) {
            const msg = extractApiError(err);
            if (msg) setError(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => { loadData(); }, [loadData]);

    // ── Tri & filtrage ───────────────────────────────────────────────────────
    const groupedData = React.useMemo(() => {
        const knownCategoryNames = categories.map((c) => c.name).filter(Boolean);
        return groupStoredBomFiles(files, knownCategoryNames);
    }, [files, categories]);

    const filteredData = React.useMemo(() => {
        if (!search.trim()) return groupedData;
        const needle = search.trim().toLowerCase();
        return groupedData
            .map((cat) => ({
                ...cat,
                references: cat.references.filter((ref) =>
                    ref.reference.toLowerCase().includes(needle) ||
                    cat.category.toLowerCase().includes(needle)
                ),
            }))
            .filter((cat) => cat.references.length > 0 || cat.category.toLowerCase().includes(needle));
    }, [groupedData, search]);

    // Auto-expand all categories at first load (or when search applied)
    React.useEffect(() => {
        if (filteredData.length > 0 && expandedCategories.size === 0) {
            setExpandedCategories(new Set(filteredData.map((c) => c.category)));
        }
    }, [filteredData, expandedCategories.size]);

    // Auto-expand all when searching
    React.useEffect(() => {
        if (search.trim() && filteredData.length > 0) {
            setExpandedCategories(new Set(filteredData.map((c) => c.category)));
        }
    }, [search, filteredData]);

    const totalReferences = groupedData.reduce((sum, c) => sum + c.references.length, 0);

    // ── Référence sélectionnée ──────────────────────────────────────────────
    const { selectedReferenceNode, selectedCategoryName } = React.useMemo(() => {
        for (const cat of groupedData) {
            for (const ref of cat.references) {
                if (ref.bomReferenceId === selectedReferenceId) {
                    return { selectedReferenceNode: ref, selectedCategoryName: cat.category };
                }
            }
        }
        return { selectedReferenceNode: null, selectedCategoryName: null };
    }, [groupedData, selectedReferenceId]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const toggleCategory = (categoryName) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(categoryName)) next.delete(categoryName);
            else next.add(categoryName);
            return next;
        });
    };

    const handleCreateCategory = async () => {
        const name = newCategoryName.trim();
        if (!name) return;
        try {
            await apiClient.post('/bom/categories', { name });
            setNewCategoryName('');
            setCategoryDialogOpen(false);
            await loadData();
        } catch (err) {
            setError(extractApiError(err));
        }
    };

    const handleCategoryChange = async (bomReferenceId, newCategoryName) => {
        try {
            await apiClient.patch(`/bom/references/${bomReferenceId}/category`, {
                category: newCategoryName === DEFAULT_UNCATEGORIZED_CATEGORY ? null : newCategoryName,
            });
            await loadData();
        } catch (err) {
            setError(extractApiError(err));
        }
    };

    const handleDeleteRevision = (item) => {
        setPendingDelete(item);
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        try {
            await apiClient.delete(`/bom/files/${pendingDelete.bom_revision_id}`);
            setPendingDelete(null);
            // Reset selection si on a supprimé la révision affichée
            await loadData();
        } catch (err) {
            setError(extractApiError(err));
            setPendingDelete(null);
        }
    };

    const allCategoryNames = React.useMemo(() => {
        const names = new Set(categories.map((c) => c.name).filter(Boolean));
        names.add(DEFAULT_UNCATEGORIZED_CATEGORY);
        return Array.from(names).sort();
    }, [categories]);

    // ── Render ───────────────────────────────────────────────────────────────
    const headerActions = (
        <Stack direction="row" spacing={1}>
            <TextField
                size="small"
                placeholder="Référence, catégorie..."
                aria-label="Rechercher une référence ou catégorie"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchRoundedIcon sx={{ color: '#71717a', fontSize: 18 }} />
                        </InputAdornment>
                    ),
                }}
                sx={{ minWidth: 260, '& .MuiOutlinedInput-root': { backgroundColor: '#18181b' } }}
            />
            <Tooltip title="Recharger">
                <IconButton onClick={loadData} aria-label="Recharger la bibliothèque" sx={{ color: '#a1a1aa' }}>
                    <RefreshRoundedIcon />
                </IconButton>
            </Tooltip>
            <Button
                variant="contained"
                startIcon={<AddRoundedIcon />}
                onClick={() => setCategoryDialogOpen(true)}
            >
                Catégorie
            </Button>
        </Stack>
    );

    return (
        <Box sx={{ p: 3 }}>
            <PageHeader
                eyebrow="BIBLIOTHÈQUE"
                title="BOM enregistrées"
                description="Bibliothèque de toutes les BOM harmonisées, organisées par catégorie."
                actions={headerActions}
            />

            {error && (
                <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            {loading ? (
                <Stack alignItems="center" sx={{ py: 8 }}>
                    <CircularProgress size={32} sx={{ color: '#10b981' }} />
                </Stack>
            ) : totalReferences === 0 ? (
                <Card sx={cardSx}>
                    <CardContent sx={{ py: 6, textAlign: 'center' }}>
                        <FolderRoundedIcon sx={{ fontSize: 48, color: '#3f3f46', mb: 1 }} />
                        <Typography variant="h6" sx={{ color: '#a1a1aa', mb: 0.5 }}>
                            Aucune BOM en bibliothèque
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#a1a1aa', mb: 3 }}>
                            Importe ta première BOM depuis l'onglet Import BOM pour la voir apparaître ici.
                        </Typography>
                        <Button variant="outlined" href="#/import-bom">
                            Aller à Import BOM
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <Grid container spacing={2}>
                    {/* Tree explorer */}
                    <Grid item xs={12} md={4}>
                        <Card sx={cardSx}>
                            <CardContent sx={{ p: 1.5 }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1, pb: 1 }}>
                                    <Typography variant="overline" sx={{ color: '#71717a', letterSpacing: '0.08em' }}>
                                        Catégories
                                    </Typography>
                                    <Chip
                                        size="small"
                                        label={`${totalReferences} BOM`}
                                        sx={{ backgroundColor: '#27272a', color: '#a1a1aa', height: 22 }}
                                    />
                                </Stack>

                                <Stack spacing={0.25}>
                                    {filteredData.length === 0 && (
                                        <Typography variant="body2" sx={{ color: '#71717a', px: 1, py: 2, textAlign: 'center' }}>
                                            Aucun résultat pour "{search}"
                                        </Typography>
                                    )}
                                    {filteredData.map((cat) => {
                                        const isExpanded = expandedCategories.has(cat.category);
                                        return (
                                            <Box key={cat.category}>
                                                <Stack
                                                    direction="row"
                                                    alignItems="center"
                                                    spacing={0.5}
                                                    sx={treeCategorySx}
                                                    role="button"
                                                    tabIndex={0}
                                                    aria-expanded={isExpanded}
                                                    aria-label={`Catégorie ${cat.category}`}
                                                    onClick={() => toggleCategory(cat.category)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            toggleCategory(cat.category);
                                                        }
                                                    }}
                                                >
                                                    {isExpanded
                                                        ? <ExpandMoreRoundedIcon sx={{ fontSize: 18, color: '#71717a' }} />
                                                        : <ChevronRightRoundedIcon sx={{ fontSize: 18, color: '#71717a' }} />}
                                                    <FolderRoundedIcon sx={{ fontSize: 16, color: '#a1a1aa' }} />
                                                    <Box sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {cat.category}
                                                    </Box>
                                                    <Chip
                                                        size="small"
                                                        label={cat.references.length}
                                                        sx={{
                                                            height: 20,
                                                            minWidth: 28,
                                                            backgroundColor: '#27272a',
                                                            color: '#a1a1aa',
                                                            fontSize: '0.7rem',
                                                        }}
                                                    />
                                                </Stack>
                                                {isExpanded && cat.references.map((ref) => {
                                                    const isSelected = ref.bomReferenceId === selectedReferenceId;
                                                    const totalSides = (ref.revisions || []).reduce(
                                                        (sum, rev) => sum + (rev.items?.length || 0),
                                                        0,
                                                    );
                                                    return (
                                                        <Stack
                                                            key={ref.bomReferenceId || ref.reference}
                                                            direction="row"
                                                            alignItems="center"
                                                            spacing={0.75}
                                                            sx={isSelected ? treeReferenceSelectedSx : treeReferenceSx}
                                                            role="button"
                                                            tabIndex={0}
                                                            aria-pressed={isSelected}
                                                            aria-current={isSelected ? 'true' : undefined}
                                                            aria-label={`Référence ${ref.reference}`}
                                                            onClick={() => setSelectedReferenceId(ref.bomReferenceId)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') {
                                                                    e.preventDefault();
                                                                    setSelectedReferenceId(ref.bomReferenceId);
                                                                }
                                                            }}
                                                        >
                                                            <DescriptionRoundedIcon sx={{ fontSize: 14, opacity: 0.7 }} />
                                                            <Box sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {ref.reference}
                                                            </Box>
                                                            <Box sx={{ fontSize: '0.7rem', color: '#71717a' }}>
                                                                {totalSides}
                                                            </Box>
                                                        </Stack>
                                                    );
                                                })}
                                                {isExpanded && cat.references.length === 0 && (
                                                    <Typography variant="caption" sx={{ display: 'block', pl: 4, py: 0.5, color: '#52525b' }}>
                                                        Catégorie vide
                                                    </Typography>
                                                )}
                                            </Box>
                                        );
                                    })}
                                </Stack>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Detail panel */}
                    <Grid item xs={12} md={8}>
                        <BomLibraryDetail
                            referenceNode={selectedReferenceNode}
                            categoryName={selectedCategoryName}
                            availableCategories={allCategoryNames}
                            onCategoryChange={handleCategoryChange}
                            onDeleteRevision={handleDeleteRevision}
                            onReload={loadData}
                        />
                    </Grid>
                </Grid>
            )}

            {/* Dialog création catégorie */}
            <Dialog
                open={categoryDialogOpen}
                onClose={() => setCategoryDialogOpen(false)}
                PaperProps={{ sx: { backgroundColor: '#18181b', border: '1px solid #27272a' } }}
            >
                <DialogTitle sx={{ color: '#f4f4f5' }}>Nouvelle catégorie</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ color: '#a1a1aa', mb: 2 }}>
                        Les catégories servent à organiser tes BOM dans la bibliothèque.
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        size="small"
                        placeholder="Ex : Cartes principales"
                        aria-label="Nom de la nouvelle catégorie"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategory(); }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCategoryDialogOpen(false)} color="inherit">Annuler</Button>
                    <Button onClick={handleCreateCategory} variant="contained" disabled={!newCategoryName.trim()}>
                        Créer
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Confirm delete */}
            <ConfirmDialog
                open={Boolean(pendingDelete)}
                title="Supprimer cette révision ?"
                message={
                    pendingDelete
                        ? `La révision ${pendingDelete.revision} (${pendingDelete.side}) de ${pendingDelete.reference} sera définitivement supprimée. Cette action est irréversible.`
                        : ''
                }
                confirmLabel="Supprimer"
                severity="error"
                onConfirm={confirmDelete}
                onClose={() => setPendingDelete(null)}
            />
        </Box>
    );
}

export default BomFilesPage;
