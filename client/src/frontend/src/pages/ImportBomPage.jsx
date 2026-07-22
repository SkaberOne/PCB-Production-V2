import React from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ClearRoundedIcon from '@mui/icons-material/ClearRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DriveFileRenameOutlineRoundedIcon from '@mui/icons-material/DriveFileRenameOutlineRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
    Alert,
    Button,
    Card,
    CardContent,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControl,
    Grid,
    IconButton,
    InputLabel,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    Select,
    Skeleton,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import apiClient from '../api/client';
import { useNavigate } from 'react-router-dom';
import BomImport from '../components/BomImport';
import BomLibraryCard from '../components/import/BomLibraryCard';
import CaoFolderImport from '../components/import/CaoFolderImport';
import GuideBanner from '../components/common/GuideBanner';
import PageHeader from '../components/common/PageHeader';
import { useBomSession } from '../context/BomSessionContext';
import { hasPersistableImportSelection, persistImportWorkspaceBeforeReview } from '../utils/importReview';
import { normalizeBomWorkspaceEntry } from '../utils/bomWorkspace';
import { hydrateProductionWorkspace } from '../utils/productionWorkspace';

function buildSuggestedProductionName(count = 0) {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const nextIndex = String(count + 1).padStart(2, '0');
    return `prod${nextIndex}_${year}-${month}`;
}

/** Hook léger pour centraliser loading/message/type */
function useAsyncState() {
    const [state, setState] = React.useState({ loading: false, message: '', type: 'info' });

    const setLoading = React.useCallback(() => setState({ loading: true, message: '', type: 'info' }), []);
    const setSuccess = React.useCallback((message) => setState({ loading: false, message, type: 'success' }), []);
    const setError = React.useCallback((message) => setState({ loading: false, message, type: 'error' }), []);
    const clear = React.useCallback(() => setState({ loading: false, message: '', type: 'info' }), []);

    return { state, setLoading, setSuccess, setError, clear };
}

function ImportBomPage() {
    const navigate = useNavigate();
    const {
        currentBom,
        importWorkspace,
        activeProduction,
        activateProductionSession,
        setImportedBom,
        setSelectedBomEntries,
        setActiveProduction,
        updateImportWorkspace,
        clearCurrentBom,
        clearActiveProduction,
        purgeProductionSession,
        flushCurrentSessionPersistence: flushSessionPersistence,
    } = useBomSession();

    const reviewAsync = useAsyncState();
    const productionAsync = useAsyncState();

    const [productions, setProductions] = React.useState([]);
    // true dès le départ — le chargement est immédiat, évite le flash MUI "out-of-range value"
    const [productionsLoading, setProductionsLoading] = React.useState(true);
    const [selectedProductionId, setSelectedProductionId] = React.useState('');
    const [newProductionName, setNewProductionName] = React.useState('');
    const [clearConfirmOpen, setClearConfirmOpen] = React.useState(false);
    // Dialog de confirmation quand on remplace une production déjà active
    const [replaceConfirmOpen, setReplaceConfirmOpen] = React.useState(false);
    const pendingLoadIdRef = React.useRef(null);

    // Menu d'actions sur la production active (switch / renommer / supprimer)
    const [menuAnchor, setMenuAnchor] = React.useState(null);
    const [renameDialogOpen, setRenameDialogOpen] = React.useState(false);
    const [renameValue, setRenameValue] = React.useState('');
    const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);

    // AbortController pour éviter les race conditions sur loadProductions
    const loadProductionsAbortRef = React.useRef(null);
    // AbortController pour annuler la persistance batch si l'utilisateur navigue pendant la sauvegarde
    const persistAbortRef = React.useRef(null);

    const hasImportedBom = React.useMemo(
        () => hasPersistableImportSelection({ currentBom, importWorkspace }),
        [currentBom, importWorkspace],
    );

    // Désactive "Charger" si la production sélectionnée est déjà active
    const isSelectedAlreadyActive = selectedProductionId
        && activeProduction?.id
        && String(activeProduction.id) === selectedProductionId;

    // Refs stables extraites pour les dépendances useCallback (évite les re-créations inutiles)
    const productionSetError = productionAsync.setError;
    const productionSetLoading = productionAsync.setLoading;
    const productionSetSuccess = productionAsync.setSuccess;

    const loadProductions = React.useCallback(async () => {
        // Annule la requête en vol si elle existe encore
        loadProductionsAbortRef.current?.abort();
        const controller = new AbortController();
        loadProductionsAbortRef.current = controller;

        setProductionsLoading(true);
        try {
            const response = await apiClient.get(`/marketplace/productions`, {
                signal: controller.signal,
            });
            const items = response.data?.items || [];
            setProductions(items);
        } catch (requestError) {
            // Ne pas afficher d'erreur si la requête a été annulée (AbortError)
            if (requestError.name === 'CanceledError' || requestError.code === 'ERR_CANCELED') {
                return;
            }
            productionSetError(
                requestError.response?.data?.detail || requestError.message || 'Erreur lors du chargement des productions',
            );
        } finally {
            setProductionsLoading(false);
        }
    }, [productionSetError]);

    // Cleanup : annuler toutes les requêtes en vol au démontage du composant
    React.useEffect(() => {
        return () => {
            loadProductionsAbortRef.current?.abort();
            persistAbortRef.current?.abort();
        };
    }, []);

    React.useEffect(() => {
        loadProductions();
    }, [loadProductions]);

    React.useEffect(() => {
        setSelectedProductionId(activeProduction?.id ? String(activeProduction.id) : '');
    }, [activeProduction?.id]);

    // Initialise le nom suggéré uniquement quand la liste change (pas à chaque frappe)
    React.useEffect(() => {
        setNewProductionName((current) => {
            if (!current.trim()) {
                return buildSuggestedProductionName(productions.length);
            }
            return current;
        });
    }, [productions.length]);

    // Auto-dismiss des messages success après 4 s
    // Dépendances granulaires — évite que l'objet recréé annule le timer à chaque render
    const productionClear = productionAsync.clear;
    const productionMessage = productionAsync.state.message;
    const productionType = productionAsync.state.type;
    React.useEffect(() => {
        if (productionType === 'success' && productionMessage) {
            const timer = setTimeout(() => productionClear(), 4000);
            return () => clearTimeout(timer);
        }
    }, [productionType, productionMessage, productionClear]);

    const reviewClear = reviewAsync.clear;
    const reviewMessage = reviewAsync.state.message;
    const reviewType = reviewAsync.state.type;
    React.useEffect(() => {
        if (reviewType === 'success' && reviewMessage) {
            const timer = setTimeout(() => reviewClear(), 4000);
            return () => clearTimeout(timer);
        }
    }, [reviewType, reviewMessage, reviewClear]);

    const handleCreateProduction = async () => {
        const normalizedName = newProductionName.trim();
        if (!normalizedName) {
            productionAsync.setError('Le nom de production est obligatoire.');
            return;
        }

        // Validation doublon côté client
        const duplicate = productions.find(
            (p) => p.name.trim().toLowerCase() === normalizedName.toLowerCase(),
        );
        if (duplicate) {
            productionAsync.setError(`Une production nommée "${duplicate.name}" existe déjà.`);
            return;
        }

        productionAsync.setLoading();
        try {
            const response = await apiClient.post(`/marketplace/productions`, {
                name: normalizedName,
            });
            activateProductionSession(response.data);
            setSelectedProductionId(String(response.data.id));
            setNewProductionName('');
            await loadProductions();
            productionAsync.setSuccess(`Production "${response.data.name}" créée et chargée.`);
        } catch (requestError) {
            productionAsync.setError(
                requestError.response?.data?.detail || requestError.message || 'Erreur lors de la création de la production',
            );
        }
    };

    /** Effectue le chargement effectif de la production (après confirmation si nécessaire) */
    const doLoadProduction = React.useCallback(async (productionId) => {
        productionSetLoading();
        try {
            const response = await apiClient.patch(`/marketplace/productions/${productionId}`, {
                status: 'ACTIVE',
            });
            await hydrateProductionWorkspace({
                productionDetail: response.data,
                activateProductionSession,
                setSelectedBomEntries,
                setImportedBom,
                updateImportWorkspace,
                clearCurrentBom,
            });
            await loadProductions();
            productionSetSuccess(`Production "${response.data.name}" chargée.`);
        } catch (requestError) {
            productionSetError(
                requestError.response?.data?.detail || requestError.message || 'Erreur lors du chargement de la production',
            );
        }
    }, [activateProductionSession, clearCurrentBom, loadProductions, productionSetError, productionSetLoading, productionSetSuccess, setImportedBom, setSelectedBomEntries, updateImportWorkspace]);

    const handleLoadProduction = () => {
        if (!selectedProductionId) {
            clearActiveProduction();
            productionAsync.setError('Aucune production sélectionnée.');
            return;
        }

        // Si une autre production est déjà active, demander confirmation avant de remplacer
        if (activeProduction?.id && String(activeProduction.id) !== selectedProductionId) {
            pendingLoadIdRef.current = selectedProductionId;
            setReplaceConfirmOpen(true);
            return;
        }

        doLoadProduction(selectedProductionId);
    };

    const handleConfirmReplaceProduction = () => {
        setReplaceConfirmOpen(false);
        const idToLoad = pendingLoadIdRef.current;
        pendingLoadIdRef.current = null;
        if (idToLoad) {
            doLoadProduction(idToLoad);
        }
    };

    const handleCancelReplaceProduction = () => {
        setReplaceConfirmOpen(false);
        pendingLoadIdRef.current = null;
    };

    const handleClearProduction = () => {
        clearActiveProduction();
        setSelectedProductionId('');
        setClearConfirmOpen(false);
        productionAsync.setSuccess('Production active retirée de la session.');
    };

    // Switch immédiat depuis le menu déroulant : charge la production choisie,
    // en demandant confirmation si une autre production est déjà active.
    const handleSwitchProduction = (event) => {
        const nextId = String(event.target.value || '');
        if (!nextId || nextId === selectedProductionId) {
            return;
        }

        if (activeProduction?.id && String(activeProduction.id) !== nextId) {
            pendingLoadIdRef.current = nextId;
            setReplaceConfirmOpen(true);
            return;
        }

        setSelectedProductionId(nextId);
        doLoadProduction(nextId);
    };

    const handleOpenMenu = (event) => setMenuAnchor(event.currentTarget);
    const handleCloseMenu = () => setMenuAnchor(null);

    const handleOpenRenameDialog = () => {
        setMenuAnchor(null);
        setRenameValue(activeProduction?.name || '');
        setRenameDialogOpen(true);
    };

    const handleCloseRenameDialog = () => {
        setRenameDialogOpen(false);
        setRenameValue('');
    };

    const handleConfirmRename = async () => {
        const trimmed = renameValue.trim();
        if (!trimmed || !activeProduction?.id) {
            return;
        }

        // Validation doublon côté client (en excluant la production courante)
        const duplicate = productions.find(
            (p) => String(p.id) !== String(activeProduction.id)
                && p.name.trim().toLowerCase() === trimmed.toLowerCase(),
        );
        if (duplicate) {
            productionAsync.setError(`Une production nommée "${duplicate.name}" existe déjà.`);
            return;
        }

        productionAsync.setLoading();
        try {
            const response = await apiClient.patch(`/marketplace/productions/${activeProduction.id}`, {
                name: trimmed,
            });
            setActiveProduction(response.data);
            setRenameDialogOpen(false);
            setRenameValue('');
            await loadProductions();
            productionAsync.setSuccess(`Production renommée en « ${trimmed} ».`);
        } catch (requestError) {
            productionAsync.setError(
                requestError.response?.data?.detail || requestError.message || 'Erreur lors du renommage de la production',
            );
        }
    };

    const handleOpenDeleteConfirm = () => {
        setMenuAnchor(null);
        setDeleteConfirmOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!activeProduction?.id) {
            return;
        }

        const deletedId = activeProduction.id;
        const deletedName = activeProduction.name;

        productionAsync.setLoading();
        try {
            await apiClient.delete(`/marketplace/productions/${deletedId}`);
            purgeProductionSession(deletedId);
            setSelectedProductionId('');
            setDeleteConfirmOpen(false);
            await loadProductions();
            productionAsync.setSuccess(`Production « ${deletedName} » supprimée.`);
        } catch (requestError) {
            productionAsync.setError(
                requestError.response?.data?.detail || requestError.message || 'Erreur lors de la suppression de la production',
            );
        }
    };

    const handleContinueReview = async () => {
        if (!hasImportedBom) {
            return;
        }

        // Annule une persistance précédente encore en vol (double-clic ou navigation rapide)
        persistAbortRef.current?.abort();
        const persistController = new AbortController();
        persistAbortRef.current = persistController;

        reviewAsync.setLoading();

        try {
            const persistedBom = await persistImportWorkspaceBeforeReview({
                importWorkspace,
                currentBom,
                setImportedBom,
                signal: persistController.signal,
            });

            const successfulBatchEntries = (Array.isArray(importWorkspace?.batchResults) ? importWorkspace.batchResults : [])
                .filter((entry) => entry?.success && entry?.bom_revision_id)
                .map((entry) => normalizeBomWorkspaceEntry(entry));

            const nextSelection = successfulBatchEntries.length
                ? successfulBatchEntries
                : (persistedBom?.bomRevisionId || persistedBom?.bom_revision_id
                    ? [normalizeBomWorkspaceEntry(persistedBom)]
                    : (currentBom?.bomRevisionId ? [normalizeBomWorkspaceEntry(currentBom)] : []));

            if (!nextSelection.length) {
                throw new Error('Aucune BOM valide à sauvegarder avant la revue.');
            }

            setSelectedBomEntries(nextSelection);

            if (activeProduction?.id) {
                const attachResponse = await apiClient.post(
                    `/marketplace/productions/${activeProduction.id}/bom-revisions`,
                    {
                        bom_revision_ids: Array.from(new Set(nextSelection.map((entry) => entry.bom_revision_id))).filter(Boolean),
                    },
                    { signal: persistController.signal },
                );
                setActiveProduction(attachResponse.data);
            }

            // Flush synchrone du localStorage avant de naviguer
            // (évite la perte de données si requestIdleCallback ne s'exécute pas à temps)
            flushSessionPersistence?.();

            reviewAsync.clear();
            navigate('/bom');
        } catch (requestError) {
            // Ne pas afficher d'erreur si la persistance a été annulée volontairement
            if (requestError.code === 'ERR_CANCELED' || requestError.name === 'CanceledError') {
                reviewAsync.clear();
                return;
            }
            reviewAsync.setError(
                requestError.response?.data?.detail || requestError.message || 'Erreur lors de la sauvegarde avant revue',
            );
        }
    };

    const handleOpenSettings = () => {
        navigate('/parametre');
    };

    // Production en attente de remplacement (pour le dialog)
    const pendingProductionName = React.useMemo(() => {
        const prod = productions.find((p) => String(p.id) === pendingLoadIdRef.current);
        return prod?.name || pendingLoadIdRef.current || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [replaceConfirmOpen, productions]);

    // Valeur du Select : '' tant que la production active n'est pas dans la liste
    // chargée (évite le warning MUI "out-of-range value").
    const productionSelectValue = productions.some((p) => String(p.id) === selectedProductionId)
        ? selectedProductionId
        : '';

    return (
        <Stack spacing={3}>
            <PageHeader
                eyebrow="Flux principal"
                title="Import et pré-traitement BOM"
            />

            {reviewAsync.state.message ? (
                <Alert severity={reviewAsync.state.type} onClose={reviewAsync.clear}>
                    {reviewAsync.state.message}
                </Alert>
            ) : null}

            {productionAsync.state.message ? (
                <Alert severity={productionAsync.state.type} onClose={productionAsync.clear}>
                    {productionAsync.state.message}
                </Alert>
            ) : null}

            {!activeProduction && (
                <GuideBanner
                    message="Aucune production chargée — sélectionnez une production existante depuis le Dashboard ou créez-en une nouvelle ci-dessous."
                    ctaLabel="Retour Dashboard"
                    ctaPath="/dashboard"
                    storageKey="import_no_production"
                />
            )}

            <Card sx={{ backgroundColor: '#18181b', border: '1px solid #27272a' }}>
                <CardContent>
                    <Stack spacing={2.5}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                            <Typography variant="h6" sx={{ color: '#f4f4f5', fontWeight: 600 }}>
                                {activeProduction ? 'Production active' : 'Aucune production active'}
                            </Typography>
                            {activeProduction && (
                                <Tooltip title="Actions sur la production">
                                    <IconButton
                                        size="small"
                                        aria-label="Actions sur la production active"
                                        onClick={handleOpenMenu}
                                        sx={{ color: '#a1a1aa', '&:hover': { color: '#f4f4f5' } }}
                                    >
                                        <MoreVertRoundedIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            )}
                        </Stack>

                        <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                            {activeProduction
                                ? 'Change de production active, renomme-la ou supprime-la. La création se fait depuis la page Production.'
                                : 'Sélectionne une production existante pour la charger. La création se fait depuis la page Production.'}
                        </Typography>

                        <FormControl
                            size="small"
                            fullWidth
                            disabled={productionsLoading || productions.length === 0}
                        >
                            <InputLabel id="switch-production-label">Production</InputLabel>
                            <Select
                                labelId="switch-production-label"
                                label="Production"
                                value={productionSelectValue}
                                onChange={handleSwitchProduction}
                                displayEmpty
                                startAdornment={(
                                    <SwapHorizRoundedIcon sx={{ color: '#52525b', mr: 1, fontSize: 18 }} />
                                )}
                            >
                                {productions.length === 0 && (
                                    <MenuItem value="" disabled>
                                        {productionsLoading ? 'Chargement…' : 'Aucune production disponible'}
                                    </MenuItem>
                                )}
                                {productions.map((production) => (
                                    <MenuItem key={production.id} value={String(production.id)}>
                                        {production.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Stack>
                </CardContent>
            </Card>

            <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleCloseMenu}>
                <MenuItem onClick={handleOpenRenameDialog}>
                    <ListItemIcon>
                        <DriveFileRenameOutlineRoundedIcon fontSize="small" sx={{ color: '#a1a1aa' }} />
                    </ListItemIcon>
                    <ListItemText>Renommer</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleOpenDeleteConfirm}>
                    <ListItemIcon>
                        <DeleteOutlineRoundedIcon fontSize="small" sx={{ color: '#f87171' }} />
                    </ListItemIcon>
                    <ListItemText sx={{ '& .MuiTypography-root': { color: '#f87171' } }}>Supprimer</ListItemText>
                </MenuItem>
            </Menu>

            <Dialog open={replaceConfirmOpen} onClose={handleCancelReplaceProduction}>
                <DialogTitle>Changer de production active ?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        La production active va être remplacée par « {pendingProductionName} ». Le travail en cours non sauvegardé sera perdu.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCancelReplaceProduction}>Annuler</Button>
                    <Button variant="contained" onClick={handleConfirmReplaceProduction}>
                        Charger
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={renameDialogOpen} onClose={handleCloseRenameDialog} fullWidth maxWidth="xs">
                <DialogTitle>Renommer la production</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Nom de la production"
                        fullWidth
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                handleConfirmRename();
                            }
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseRenameDialog}>Annuler</Button>
                    <Button
                        variant="contained"
                        onClick={handleConfirmRename}
                        disabled={!renameValue.trim() || productionAsync.state.loading}
                    >
                        Renommer
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
                <DialogTitle>Supprimer la production ?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        La production « {activeProduction?.name} » sera définitivement supprimée. Cette action est irréversible.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteConfirmOpen(false)}>Annuler</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={handleConfirmDelete}
                        disabled={productionAsync.state.loading}
                    >
                        Supprimer
                    </Button>
                </DialogActions>
            </Dialog>

            <BomLibraryCard />

            <CaoFolderImport />

            <BomImport />
        </Stack>
    );
}

export default ImportBomPage;
