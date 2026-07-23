import React from 'react';
import {
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
    TextField,
    Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import apiClient from '../../api/client';
import { colors } from '../../theme';
import BomLibraryDetail from './BomLibraryDetail';
import { DEFAULT_UNCATEGORIZED_CATEGORY } from '../../utils/bomFileExplorer';

/**
 * Fiche carte unifiée (prompt 001). Regroupe au même endroit :
 *   - l'édition des métadonnées : nom, code KELENN, type (SIMPLE/ASSEMBLY),
 *     catégorie, et la composition d'un assemblage ;
 *   - les révisions/BOM de la carte (table réutilisée de la bibliothèque BOM),
 *     avec « Ouvrir » (Revue BOM éditable via /bom?revision=) et suppression.
 *
 * Le contenu d'une BOM se corrige en ouvrant une révision dans la Revue BOM
 * (bouton « Ouvrir »), pas ici : on réutilise l'éditeur existant.
 */
function CardDetailDialog({
    card,
    allCards,
    revisionsNode,
    availableCategories = [],
    onClose,
    onSaved,
    onDeleteRevision,
    onDeleteCard,
    onReload,
    setError,
}) {
    const open = Boolean(card);
    const [name, setName] = React.useState('');
    const [partNumber, setPartNumber] = React.useState('');
    const [cardType, setCardType] = React.useState('SIMPLE');
    const [category, setCategory] = React.useState('');
    const [items, setItems] = React.useState([]);
    const [saving, setSaving] = React.useState(false);
    const [compOptions, setCompOptions] = React.useState([]);

    React.useEffect(() => {
        if (!open) return;
        setName(card.name || '');
        setPartNumber(card.part_number || '');
        setCardType(card.card_type || 'SIMPLE');
        setCategory(card.category || '');
        setItems((card.assembly_items || []).map((it) => ({
            kind: it.kind,
            child_reference_id: it.child_reference_id,
            component_id: it.component_id,
            label: it.label,
            qty: String(it.quantity),
        })));
    }, [open, card]);

    // Recherche de composants (pour les éléments en vrac d'un assemblage).
    const searchComponents = React.useCallback(async (q) => {
        try {
            const res = await apiClient.get('/bom/components', { params: { search: q || '', limit: 25 } });
            const list = Array.isArray(res.data) ? res.data : [];
            setCompOptions(list.map((c) => ({ id: c.id, label: c.value || c.mpn || c.reference })));
        } catch (e) { /* ignore */ }
    }, []);

    const cardOptions = (allCards || [])
        .filter((c) => !card || c.bom_reference_id !== card.bom_reference_id)
        .map((c) => ({ id: c.bom_reference_id, label: c.name ? `${c.reference} — ${c.name}` : c.reference }));

    const setItem = (i, patch) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
    const addCardItem = () => setItems((p) => [...p, { kind: 'card', child_reference_id: null, label: '', qty: '1' }]);
    const addCompItem = () => setItems((p) => [...p, { kind: 'component', component_id: null, label: '', qty: '1' }]);

    const save = async () => {
        setSaving(true);
        try {
            await apiClient.put(`/marketplace/cards/${card.bom_reference_id}`, {
                name: name.trim() || null,
                part_number: partNumber.trim() || null,
                card_type: cardType,
            });
            if (cardType === 'ASSEMBLY') {
                const payload = items
                    .filter((it) => (it.kind === 'card' ? it.child_reference_id : it.component_id) && (parseInt(it.qty, 10) || 0) > 0)
                    .map((it) => (it.kind === 'card'
                        ? { child_reference_id: it.child_reference_id, quantity: parseInt(it.qty, 10) || 1 }
                        : { component_id: it.component_id, quantity: parseInt(it.qty, 10) || 1 }));
                await apiClient.put(`/marketplace/cards/${card.bom_reference_id}/assembly`, { items: payload });
            }
            // Catégorie : persistée au même endroit via l'endpoint de référence.
            const nextCat = (category || '').trim();
            const prevCat = (card.category || '').trim();
            if (nextCat !== prevCat) {
                const catToSend = (!nextCat || nextCat === DEFAULT_UNCATEGORIZED_CATEGORY) ? null : nextCat;
                await apiClient.patch(`/bom/references/${card.bom_reference_id}/category`, { category: catToSend });
            }
            onSaved();
        } catch (e) {
            setError(e?.response?.data?.detail || 'Enregistrement impossible.');
        } finally {
            setSaving(false);
        }
    };

    const categoryOptions = (availableCategories || []).filter(Boolean);

    return (
        <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="md" fullWidth>
            <DialogTitle>
                {card?.reference}
                <Typography variant="body2" sx={{ color: colors.textSecondary }}>Fiche carte — métadonnées, révisions et BOM</Typography>
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ mt: 0.5 }}>
                    <Typography variant="subtitle2">Métadonnées</Typography>
                    <TextField fullWidth size="small" label="Nom de la carte" value={name} onChange={(e) => setName(e.target.value)} />
                    <TextField fullWidth size="small" label="Code KELENN (notre référence)" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} helperText="Sert au matching des commandes PDF (ex. KT240576)" />
                    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                        <TextField select size="small" label="Type" value={cardType} onChange={(e) => setCardType(e.target.value)} sx={{ minWidth: 200 }}>
                            <MenuItem value="SIMPLE">Carte simple</MenuItem>
                            <MenuItem value="ASSEMBLY">Assemblage (kit)</MenuItem>
                        </TextField>
                        <Autocomplete
                            freeSolo
                            size="small"
                            options={categoryOptions}
                            value={category}
                            onChange={(_e, v) => setCategory(v || '')}
                            onInputChange={(_e, v) => setCategory(v || '')}
                            sx={{ minWidth: 240, flex: 1 }}
                            renderInput={(params) => <TextField {...params} label="Catégorie" placeholder="Sans catégorie" />}
                        />
                    </Stack>

                    {cardType === 'ASSEMBLY' ? (
                        <>
                            <Divider />
                            <Typography variant="subtitle2">Composition de l'assemblage</Typography>
                            {items.length === 0 ? (
                                <Typography variant="body2" sx={{ color: colors.textSecondary }}>Aucun élément. Ajoute des sous-cartes ou des composants.</Typography>
                            ) : items.map((it, i) => (
                                <Stack key={i} direction="row" spacing={1} alignItems="center">
                                    {it.kind === 'card' ? (
                                        <Autocomplete
                                            size="small" sx={{ flex: 1 }} options={cardOptions}
                                            value={it.child_reference_id ? { id: it.child_reference_id, label: it.label } : null}
                                            onChange={(_e, v) => setItem(i, { child_reference_id: v?.id || null, label: v?.label || '' })}
                                            getOptionLabel={(o) => o?.label || ''}
                                            isOptionEqualToValue={(o, v) => o.id === v.id}
                                            renderInput={(params) => <TextField {...params} label="Sous-carte" />}
                                        />
                                    ) : (
                                        <Autocomplete
                                            size="small" sx={{ flex: 1 }} options={compOptions} filterOptions={(x) => x}
                                            value={it.component_id ? { id: it.component_id, label: it.label } : null}
                                            onChange={(_e, v) => setItem(i, { component_id: v?.id || null, label: v?.label || '' })}
                                            onInputChange={(_e, val, reason) => { if (reason === 'input') searchComponents(val); }}
                                            getOptionLabel={(o) => o?.label || ''}
                                            isOptionEqualToValue={(o, v) => o.id === v.id}
                                            renderInput={(params) => <TextField {...params} label="Composant" placeholder="Rechercher…" />}
                                        />
                                    )}
                                    <Chip size="small" label={it.kind === 'card' ? 'carte' : 'composant'} variant="outlined" />
                                    <TextField size="small" type="number" label="Qté" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} inputProps={{ min: 1 }} sx={{ width: 80 }} />
                                    <IconButton size="small" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                                </Stack>
                            ))}
                            <Stack direction="row" spacing={1}>
                                <Button size="small" startIcon={<AddRoundedIcon />} onClick={addCardItem}>Sous-carte</Button>
                                <Button size="small" startIcon={<AddRoundedIcon />} onClick={addCompItem}>Composant</Button>
                            </Stack>
                            <Alert severity="info" variant="outlined" sx={{ py: 0 }}>Le prix de l'assemblage = somme automatique des prix des enfants.</Alert>
                        </>
                    ) : null}

                    <Divider />
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Révisions & BOM</Typography>
                        <BomLibraryDetail
                            referenceNode={revisionsNode}
                            categoryName={card?.category || DEFAULT_UNCATEGORIZED_CATEGORY}
                            availableCategories={[]}
                            onDeleteRevision={onDeleteRevision}
                            onReload={onReload}
                        />
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between' }}>
                <Button
                    color="error"
                    startIcon={<DeleteOutlineRoundedIcon />}
                    onClick={() => onDeleteCard && onDeleteCard(card)}
                    disabled={saving || !onDeleteCard}
                >
                    Supprimer la carte
                </Button>
                <Box>
                    <Button color="inherit" onClick={onClose} disabled={saving} sx={{ mr: 1 }}>Fermer</Button>
                    <Button variant="contained" color="success" onClick={save} disabled={saving}>Enregistrer</Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}

export default CardDetailDialog;
