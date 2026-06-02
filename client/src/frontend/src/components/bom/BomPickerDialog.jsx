import React from 'react';
import {
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import apiClient from '../../api/client';

/**
 * Dialog de sélection multiple des BOM enregistrées à ajouter à la session
 * de revue (et donc à la production active).
 *
 * - Charge la liste des révisions via GET /bom/files à l'ouverture.
 * - Les révisions déjà présentes dans la session sont cochées + désactivées.
 * - `onConfirm(revisionIds)` reçoit les ids nouvellement sélectionnés.
 */
function BomPickerDialog({ open, onClose, onConfirm, alreadySelectedIds = [] }) {
    const [items, setItems] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const [search, setSearch] = React.useState('');
    const [checked, setChecked] = React.useState({});

    React.useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;
        setLoading(true);
        setError('');
        setChecked({});
        setSearch('');
        apiClient.get('/bom/files')
            .then((res) => {
                if (cancelled) return;
                setItems(Array.isArray(res.data?.items) ? res.data.items : []);
            })
            .catch((requestError) => {
                if (cancelled) return;
                setError(requestError.response?.data?.detail || requestError.message || 'Erreur de chargement des BOM.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [open]);

    const alreadySet = React.useMemo(
        () => new Set((alreadySelectedIds || []).map(Number)),
        [alreadySelectedIds],
    );

    const filtered = React.useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return items;
        return items.filter((item) => (
            `${item.reference || ''} ${item.revision || ''} ${item.side || ''} ${item.category || ''}`
                .toLowerCase()
                .includes(query)
        ));
    }, [items, search]);

    const toggle = (id) => setChecked((current) => ({ ...current, [id]: !current[id] }));

    const selectedIds = React.useMemo(
        () => Object.keys(checked).filter((key) => checked[key]).map(Number),
        [checked],
    );

    const handleConfirm = () => onConfirm(selectedIds);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Choisir des BOM à ajouter</DialogTitle>
            <DialogContent dividers>
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Rechercher (référence, révision, face, catégorie…)"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    sx={{ mb: 2 }}
                />

                {loading ? (
                    <Stack alignItems="center" sx={{ py: 4 }}>
                        <CircularProgress size={28} />
                    </Stack>
                ) : null}

                {error ? (
                    <Typography color="error" variant="body2" sx={{ py: 2 }}>{error}</Typography>
                ) : null}

                {!loading && !error && !filtered.length ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        Aucune BOM enregistrée ne correspond.
                    </Typography>
                ) : null}

                {!loading && !error && filtered.length ? (
                    <List dense sx={{ maxHeight: 360, overflowY: 'auto' }}>
                        {filtered.map((item) => {
                            const id = item.bom_revision_id;
                            const isAlready = alreadySet.has(Number(id));
                            const isChecked = isAlready || Boolean(checked[id]);
                            return (
                                <ListItemButton
                                    key={id}
                                    dense
                                    disabled={isAlready}
                                    onClick={() => toggle(id)}
                                >
                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                        <Checkbox
                                            edge="start"
                                            checked={isChecked}
                                            disabled={isAlready}
                                            tabIndex={-1}
                                            disableRipple
                                        />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={`${item.reference || '—'} · ${item.revision || ''} · ${item.side || ''}`}
                                        secondary={isAlready
                                            ? 'Déjà dans la session'
                                            : (item.category || item.file_name || '')}
                                    />
                                    <Box sx={{ ml: 1 }}>
                                        <Chip label={item.status || 'DRAFT'} size="small" variant="outlined" />
                                    </Box>
                                </ListItemButton>
                            );
                        })}
                    </List>
                ) : null}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="inherit">Annuler</Button>
                <Button
                    onClick={handleConfirm}
                    variant="contained"
                    disabled={!selectedIds.length}
                >
                    Ajouter{selectedIds.length ? ` (${selectedIds.length})` : ''}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default BomPickerDialog;
