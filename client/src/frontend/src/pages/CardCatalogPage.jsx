import React from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    InputAdornment,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import DeleteSweepRoundedIcon from '@mui/icons-material/DeleteSweepRounded';
import apiClient, { extractApiError } from '../api/client';
import PageHeader from '../components/common/PageHeader';
import ConfirmDialog from '../components/common/ConfirmDialog';
import CardDetailDialog from '../components/library/CardDetailDialog';
import CardCatalogTable from '../components/library/CardCatalogTable';
import BulkDeleteReportDialog from '../components/library/BulkDeleteReportDialog';
import { DEFAULT_UNCATEGORIZED_CATEGORY, groupStoredBomFiles } from '../utils/bomFileExplorer';
import { matchesQuery } from '../utils/textSearch';
import { colors } from '../theme';

function eur(v) {
    if (v == null || Number.isNaN(Number(v))) return '—';
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v); }
    catch (e) { return `${Number(v).toFixed(2)} €`; }
}

/**
 * Catalogue de cartes unifié (ADR 0018 + prompt 001). Entrée unique du catalogue :
 * la fiche par carte regroupe métadonnées, composition d'assemblage et révisions/BOM.
 * Prompt 020 : recherche réf/nom, suppression unitaire et multiple (avec rapport).
 */
function CardCatalogPage({ embedded = false }) {
    const [rows, setRows] = React.useState(null);
    const [files, setFiles] = React.useState([]);
    const [categories, setCategories] = React.useState([]);
    const [error, setError] = React.useState(null);
    const [editing, setEditing] = React.useState(null);
    const [categoryDialogOpen, setCategoryDialogOpen] = React.useState(false);
    const [newCategoryName, setNewCategoryName] = React.useState('');
    const [pendingDelete, setPendingDelete] = React.useState(null);
    const [search, setSearch] = React.useState('');
    const [selectedIds, setSelectedIds] = React.useState(() => new Set());
    const [pendingCardDelete, setPendingCardDelete] = React.useState(null);
    const [bulkConfirmOpen, setBulkConfirmOpen] = React.useState(false);
    const [report, setReport] = React.useState(null);

    const load = React.useCallback(async () => {
        setError(null);
        try {
            const [cardsRes, filesRes, catsRes] = await Promise.all([
                apiClient.get('/marketplace/cards'),
                apiClient.get('/bom/files'),
                apiClient.get('/bom/categories'),
            ]);
            setRows(Array.isArray(cardsRes.data) ? cardsRes.data : []);
            setFiles(filesRes?.data?.items || []);
            setCategories(catsRes?.data?.items || []);
        } catch (e) {
            setError(extractApiError(e) || 'Chargement du catalogue impossible.');
            setRows([]);
        }
    }, []);
    React.useEffect(() => { load(); }, [load]);

    const nodeByReferenceId = React.useMemo(() => {
        const grouped = groupStoredBomFiles(files, []);
        const map = new Map();
        grouped.forEach((cat) => cat.references.forEach((ref) => map.set(ref.bomReferenceId, ref)));
        return map;
    }, [files]);

    const allCategoryNames = React.useMemo(() => {
        const names = new Set(categories.map((c) => c.name).filter(Boolean));
        names.add(DEFAULT_UNCATEGORIZED_CATEGORY);
        return Array.from(names).sort();
    }, [categories]);

    const editingCard = React.useMemo(() => {
        if (!editing) return null;
        return (rows || []).find((r) => r.bom_reference_id === editing.bom_reference_id) || editing;
    }, [editing, rows]);

    // Filtrage réf + nom (insensible casse/accents), côté client.
    const filteredRows = React.useMemo(() => {
        if (rows === null) return null;
        return rows.filter((r) => matchesQuery(search, [r.reference, r.name]));
    }, [rows, search]);

    const filteredIds = React.useMemo(
        () => (filteredRows || []).map((r) => r.bom_reference_id),
        [filteredRows],
    );
    const selectedVisible = filteredIds.filter((id) => selectedIds.has(id));
    const allSelected = filteredIds.length > 0 && selectedVisible.length === filteredIds.length;
    const someSelected = selectedVisible.length > 0;

    const toggleRow = (id) => setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const toggleAll = () => setSelectedIds((prev) => {
        const next = new Set(prev);
        if (allSelected) filteredIds.forEach((id) => next.delete(id));
        else filteredIds.forEach((id) => next.add(id));
        return next;
    });

    const assemblies = (rows || []).filter((r) => r.card_type === 'ASSEMBLY').length;

    const handleCreateCategory = async () => {
        const name = newCategoryName.trim();
        if (!name) return;
        try {
            await apiClient.post('/bom/categories', { name });
            setNewCategoryName('');
            setCategoryDialogOpen(false);
            await load();
        } catch (e) {
            setError(extractApiError(e));
        }
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        try {
            await apiClient.delete(`/bom/files/${pendingDelete.bom_revision_id}`);
            setPendingDelete(null);
            await load();
        } catch (e) {
            setError(extractApiError(e));
            setPendingDelete(null);
        }
    };

    // Suppression unitaire d'une carte entière (depuis la fiche).
    const confirmCardDelete = async () => {
        const card = pendingCardDelete;
        if (!card) return;
        setPendingCardDelete(null);
        try {
            await apiClient.delete(`/bom/references/${card.bom_reference_id}`);
            setSelectedIds((prev) => { const n = new Set(prev); n.delete(card.bom_reference_id); return n; });
            setEditing(null);
            await load();
        } catch (e) {
            setError(extractApiError(e));
        }
    };

    // Suppression multiple : rapport supprimées / ignorées (liées).
    const confirmBulkDelete = async () => {
        setBulkConfirmOpen(false);
        const ids = filteredIds.filter((id) => selectedIds.has(id));
        if (ids.length === 0) return;
        try {
            const res = await apiClient.delete('/bom/references', { data: { ids } });
            setReport(res.data || { deleted: [], skipped: [] });
            setSelectedIds(new Set());
            await load();
        } catch (e) {
            setError(extractApiError(e));
        }
    };

    const selectedCount = selectedVisible.length;

    const headerActions = (
        <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => setCategoryDialogOpen(true)}>
            Catégorie
        </Button>
    );

    return (
        <Box>
            {embedded ? (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>{headerActions}</Box>
            ) : (
                <PageHeader
                    title="Catalogue des cartes"
                    description="Fiche unifiée : référence, code KELENN, nom, type, catégorie, révisions/BOM, prix et composition (assemblages)."
                    actions={headerActions}
                />
            )}
            {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert> : null}

            <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="center" flexWrap="wrap" useFlexGap>
                <TextField
                    size="small"
                    placeholder="Rechercher (référence ou nom)…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    sx={{ minWidth: 280, flex: 1 }}
                    inputProps={{ 'aria-label': 'Rechercher une carte' }}
                    InputProps={{ startAdornment: (<InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment>) }}
                />
                <Chip label={`${(filteredRows || []).length} carte(s)`} variant="outlined" />
                <Chip label={`${assemblies} assemblage(s)`} variant="outlined" />
                {selectedCount > 0 ? (
                    <Button
                        variant="contained"
                        color="error"
                        startIcon={<DeleteSweepRoundedIcon />}
                        onClick={() => setBulkConfirmOpen(true)}
                    >
                        Supprimer la sélection ({selectedCount})
                    </Button>
                ) : null}
            </Stack>

            <CardCatalogTable
                rows={filteredRows}
                selectedIds={selectedIds}
                onToggleRow={toggleRow}
                onToggleAll={toggleAll}
                allSelected={allSelected}
                someSelected={someSelected}
                onRowClick={setEditing}
                formatPrice={eur}
            />

            <CardDetailDialog
                card={editingCard}
                allCards={rows || []}
                revisionsNode={editingCard ? (nodeByReferenceId.get(editingCard.bom_reference_id) || null) : null}
                availableCategories={allCategoryNames}
                onClose={() => setEditing(null)}
                onSaved={async () => { await load(); setEditing(null); }}
                onDeleteRevision={(item) => setPendingDelete(item)}
                onDeleteCard={(c) => setPendingCardDelete(c)}
                onReload={load}
                setError={setError}
            />

            <Dialog open={categoryDialogOpen} onClose={() => setCategoryDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Nouvelle catégorie</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 2 }}>
                        Les catégories servent à organiser les cartes du catalogue.
                    </Typography>
                    <TextField
                        autoFocus fullWidth size="small"
                        placeholder="Ex : Cartes principales"
                        aria-label="Nom de la nouvelle catégorie"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategory(); }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCategoryDialogOpen(false)} color="inherit">Annuler</Button>
                    <Button onClick={handleCreateCategory} variant="contained" disabled={!newCategoryName.trim()}>Créer</Button>
                </DialogActions>
            </Dialog>

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                title="Supprimer cette révision ?"
                message={pendingDelete
                    ? `La révision ${pendingDelete.revision} (${pendingDelete.side}) de ${pendingDelete.reference} sera définitivement supprimée. Cette action est irréversible.`
                    : ''}
                confirmLabel="Supprimer" severity="error"
                onConfirm={confirmDelete} onClose={() => setPendingDelete(null)}
            />

            <ConfirmDialog
                open={Boolean(pendingCardDelete)}
                title="Supprimer la carte ?"
                message={pendingCardDelete
                    ? `Supprimer la carte ${pendingCardDelete.reference}${pendingCardDelete.name ? ` — ${pendingCardDelete.name}` : ''} et ses ${(pendingCardDelete.revisions || []).length} révision(s) ? Action irréversible. Refusée si la carte est liée (production, stock, commande, assemblage).`
                    : ''}
                confirmLabel="Supprimer" severity="error"
                onConfirm={confirmCardDelete} onClose={() => setPendingCardDelete(null)}
            />

            <ConfirmDialog
                open={bulkConfirmOpen}
                title="Supprimer la sélection ?"
                message={`${selectedCount} carte(s) sélectionnée(s) seront supprimées. Les cartes liées (production, stock, commande, assemblage) seront ignorées. Action irréversible.`}
                confirmLabel="Supprimer" severity="error"
                onConfirm={confirmBulkDelete} onClose={() => setBulkConfirmOpen(false)}
            />

            <BulkDeleteReportDialog report={report} onClose={() => setReport(null)} />
        </Box>
    );
}

export default CardCatalogPage;
