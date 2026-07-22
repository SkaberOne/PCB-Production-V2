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
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import apiClient, { extractApiError } from '../api/client';
import PageHeader from '../components/common/PageHeader';
import ConfirmDialog from '../components/common/ConfirmDialog';
import CardDetailDialog from '../components/library/CardDetailDialog';
import { DEFAULT_UNCATEGORIZED_CATEGORY, groupStoredBomFiles } from '../utils/bomFileExplorer';
import { colors } from '../theme';

function eur(v) {
    if (v == null || Number.isNaN(Number(v))) return '—';
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v); }
    catch (e) { return `${Number(v).toFixed(2)} €`; }
}

/**
 * Catalogue de cartes unifié (ADR 0018 + prompt 001). Entrée unique du catalogue :
 * la fiche par carte regroupe métadonnées (nom / code KELENN / type / catégorie),
 * composition d'assemblage, et les révisions/BOM de la carte (ouverture dans la
 * Revue BOM éditable, suppression). L'onglet « BOM enregistrées » a été fusionné ici.
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

    // Révisions/BOM groupées par référence de carte (repris de la bibliothèque BOM).
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

    // Garde la carte en cours d'édition synchronisée après un reload.
    const editingCard = React.useMemo(() => {
        if (!editing) return null;
        return (rows || []).find((r) => r.bom_reference_id === editing.bom_reference_id) || editing;
    }, [editing, rows]);

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

    const headerActions = (
        <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => setCategoryDialogOpen(true)}>
            Catégorie
        </Button>
    );

    return (
        <Box>
            {embedded ? (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
                    {headerActions}
                </Box>
            ) : (
                <PageHeader
                    title="Catalogue des cartes"
                    description="Fiche unifiée : référence, code KELENN, nom, type, catégorie, révisions/BOM, prix et composition (assemblages)."
                    actions={headerActions}
                />
            )}
            {error ? <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert> : null}

            <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
                <Chip label={`${(rows || []).length} carte(s)`} variant="outlined" />
                <Chip label={`${assemblies} assemblage(s)`} variant="outlined" />
            </Stack>

            <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 1 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>Référence</TableCell>
                            <TableCell>Nom</TableCell>
                            <TableCell>Code KELENN</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>Catégorie</TableCell>
                            <TableCell>Révisions</TableCell>
                            <TableCell align="right">Prix / carte</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows === null ? (
                            <TableRow><TableCell colSpan={7} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>Chargement…</TableCell></TableRow>
                        ) : rows.length === 0 ? (
                            <TableRow><TableCell colSpan={7} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>Aucune carte.</TableCell></TableRow>
                        ) : rows.map((row) => (
                            <TableRow key={row.bom_reference_id} hover onClick={() => setEditing(row)} sx={{ cursor: 'pointer' }}>
                                <TableCell sx={{ fontWeight: 600 }}>{row.reference}</TableCell>
                                <TableCell>{row.name || <span style={{ color: colors.textSecondary }}>—</span>}</TableCell>
                                <TableCell>{row.part_number || <span style={{ color: colors.textSecondary }}>—</span>}</TableCell>
                                <TableCell>
                                    {row.card_type === 'ASSEMBLY'
                                        ? <Chip size="small" label={`Assemblage (${row.assembly_items.length})`} color="secondary" variant="outlined" />
                                        : <Chip size="small" label="Simple" variant="outlined" />}
                                </TableCell>
                                <TableCell>{row.category || <span style={{ color: colors.textSecondary }}>—</span>}</TableCell>
                                <TableCell>
                                    {(row.revisions || []).length
                                        ? row.revisions.map((r) => <Chip key={r} size="small" label={r} variant="outlined" sx={{ mr: 0.5 }} />)
                                        : <span style={{ color: colors.textSecondary }}>—</span>}
                                </TableCell>
                                <TableCell align="right">
                                    {eur(row.unit_price)}
                                    {row.card_type === 'ASSEMBLY' && !row.price_complete
                                        ? <Chip size="small" label="incomplet" color="warning" variant="outlined" sx={{ ml: 0.5 }} />
                                        : null}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <CardDetailDialog
                card={editingCard}
                allCards={rows || []}
                revisionsNode={editingCard ? (nodeByReferenceId.get(editingCard.bom_reference_id) || null) : null}
                availableCategories={allCategoryNames}
                onClose={() => setEditing(null)}
                onSaved={async () => { await load(); setEditing(null); }}
                onDeleteRevision={(item) => setPendingDelete(item)}
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
                    <Button onClick={handleCreateCategory} variant="contained" disabled={!newCategoryName.trim()}>Créer</Button>
                </DialogActions>
            </Dialog>

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

export default CardCatalogPage;
