import React from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArchiveRoundedIcon from '@mui/icons-material/ArchiveRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DriveFileRenameOutlineRoundedIcon from '@mui/icons-material/DriveFileRenameOutlineRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import PrecisionManufacturingRoundedIcon from '@mui/icons-material/PrecisionManufacturingRounded';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    IconButton,
    InputAdornment,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    Skeleton,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import apiClient from '../api/client';
import { useNavigate } from 'react-router-dom';
import EmptyState from '../components/common/EmptyState';
import GuideBanner from '../components/common/GuideBanner';
import StatCard from '../components/dashboard/StatCard';
import { useBomSession } from '../context/BomSessionContext';
import { getBomSessionStats } from '../utils/bomSession';
import { compactTableContainerSx, compactTableSx } from '../utils/compactTable';
import { hydrateProductionWorkspace } from '../utils/productionWorkspace';

function buildSuggestedProductionName(productions = []) {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const existingNames = new Set(
        (Array.isArray(productions) ? productions : [])
            .map((production) => String(production?.name || '').trim().toLowerCase())
            .filter(Boolean),
    );

    for (let index = 1; index <= 999; index += 1) {
        const nextIndex = String(index).padStart(2, '0');
        const candidate = `prod${nextIndex} DATE:${month}/${year}`;
        if (!existingNames.has(candidate.toLowerCase())) {
            return candidate;
        }
    }

    return `production DATE:${month}/${year}`;
}

function formatProductionDate(rawDate) {
    if (!rawDate) {
        return '--';
    }

    const parsedDate = new Date(rawDate);
    if (Number.isNaN(parsedDate.getTime())) {
        return rawDate;
    }

    return parsedDate.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function buildProductionTooltip(production) {
    if (!production) {
        return '';
    }

    const bomRevisions = Array.isArray(production.bomRevisions)
        ? production.bomRevisions
        : (Array.isArray(production.bom_revisions) ? production.bom_revisions : []);

    if (bomRevisions.length) {
        return bomRevisions
            .map((bomRevision) => {
                const reference = bomRevision.reference || 'BOM';
                const revision = bomRevision.revision || '';
                const side = bomRevision.side || '';
                return `${reference} ${revision} ${side}`.trim();
            })
            .join('\n');
    }

    const linkedReferences = Array.isArray(production.linkedReferences)
        ? production.linkedReferences
        : (Array.isArray(production.linked_references) ? production.linked_references : []);

    if (linkedReferences.length) {
        return linkedReferences.join('\n');
    }

    return "Aucune BOM rattachée pour le moment.";
}

function getProductionStatusUi(status) {
    switch (String(status || 'DRAFT').toUpperCase()) {
    case 'ACTIVE':
        return {
            label: 'Active',
            color: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
        };
    case 'COMPLETED':
        return {
            label: 'Terminée',
            color: '#3b82f6',
            backgroundColor: 'rgba(59,130,246, 0.12)',
        };
    case 'ARCHIVED':
        return {
            label: 'Archivée',
            color: '#a1a1aa',
            backgroundColor: 'rgba(161, 161, 170, 0.12)',
        };
    case 'DRAFT':
    default:
        return {
            label: 'Brouillon',
            color: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
        };
    }
}

function requiresReactivationConfirmation(status) {
    return ['ARCHIVED', 'COMPLETED'].includes(String(status || '').toUpperCase());
}

function buildMergedActiveProduction(currentProduction, summary) {
    if (!currentProduction) {
        return summary;
    }

    return {
        ...summary,
        linked_references: Array.isArray(summary?.linked_references)
            ? summary.linked_references
            : currentProduction.linkedReferences,
        bom_revisions: Array.isArray(summary?.bom_revisions)
            ? summary.bom_revisions
            : currentProduction.bomRevisions,
    };
}

const DashboardProductionRow = React.memo(function DashboardProductionRow({
    production,
    isSessionActive,
    isBusy,
    onRequestOpenProduction,
    onRequestDeleteProduction,
    onRequestRenameProduction,
    onRequestArchiveProduction,
    onRequestDuplicateProduction,
}) {
    const [menuAnchor, setMenuAnchor] = React.useState(null);
    const statusUi = React.useMemo(
        () => getProductionStatusUi(production.status),
        [production.status],
    );
    const tooltipContent = React.useMemo(
        () => buildProductionTooltip(production),
        [production],
    );
    const handleOpen = React.useCallback(() => {
        onRequestOpenProduction(production);
    }, [onRequestOpenProduction, production]);
    const handleDelete = React.useCallback(() => {
        setMenuAnchor(null);
        onRequestDeleteProduction(production);
    }, [onRequestDeleteProduction, production]);
    const handleRename = React.useCallback(() => {
        setMenuAnchor(null);
        onRequestRenameProduction(production);
    }, [onRequestRenameProduction, production]);
    const handleArchive = React.useCallback(() => {
        setMenuAnchor(null);
        onRequestArchiveProduction(production);
    }, [onRequestArchiveProduction, production]);
    const handleDuplicate = React.useCallback(() => {
        setMenuAnchor(null);
        onRequestDuplicateProduction(production);
    }, [onRequestDuplicateProduction, production]);

    const isArchived = String(production.status || '').toUpperCase() === 'ARCHIVED';

    return (
        <TableRow
            hover
            sx={{
                backgroundColor: isSessionActive ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                opacity: isArchived ? 0.6 : 1,
                '&:hover': {
                    backgroundColor: isSessionActive
                        ? 'rgba(16, 185, 129, 0.12)'
                        : 'rgba(255, 255, 255, 0.02)',
                    opacity: 1,
                },
            }}
        >
            <TableCell sx={{ color: '#f4f4f5', borderColor: '#27272a' }}>
                <Stack spacing={0.6}>
                    <Tooltip
                        title={(
                            <Box sx={{ whiteSpace: 'pre-line' }}>
                                {tooltipContent}
                            </Box>
                        )}
                        arrow
                        placement="top-start"
                    >
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 600,
                                width: 'fit-content',
                                maxWidth: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {production.name}
                        </Typography>
                    </Tooltip>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip
                            label={statusUi.label}
                            size="small"
                            variant="outlined"
                            sx={{
                                borderColor: statusUi.color,
                                color: statusUi.color,
                                backgroundColor: statusUi.backgroundColor,
                            }}
                        />
                        {isSessionActive ? (
                            <Chip
                                label="Session"
                                size="small"
                                sx={{ backgroundColor: 'rgba(5,150,105,0.16)', color: '#10b981' }}
                            />
                        ) : null}
                    </Stack>
                </Stack>
            </TableCell>
            <TableCell sx={{ color: '#d4d4d8', borderColor: '#27272a' }}>
                {production.bom_count ?? 0}
            </TableCell>
            <TableCell sx={{ color: '#a1a1aa', borderColor: '#27272a' }}>
                {formatProductionDate(production.updated_at)}
            </TableCell>
            <TableCell sx={{ borderColor: '#27272a' }}>
                <Stack direction="row" spacing={0.5} alignItems="center">
                    <Tooltip title={production.status === 'ACTIVE' ? 'Ouvrir la production' : 'Activer et ouvrir'}>
                        <span>
                            <IconButton
                                size="small"
                                aria-label={production.status === 'ACTIVE'
                                    ? `Ouvrir la production ${production.name}`
                                    : `Activer et ouvrir la production ${production.name}`}
                                onClick={handleOpen}
                                disabled={isBusy}
                                sx={{
                                    border: '1px solid #3f3f46',
                                    color: '#f4f4f5',
                                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' },
                                }}
                            >
                                <OpenInNewRoundedIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Plus d'actions">
                        <span>
                            <IconButton
                                size="small"
                                onClick={(e) => setMenuAnchor(e.currentTarget)}
                                disabled={isBusy}
                                sx={{
                                    border: '1px solid #3f3f46',
                                    color: '#a1a1aa',
                                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' },
                                }}
                            >
                                <MoreVertRoundedIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Menu
                        anchorEl={menuAnchor}
                        open={Boolean(menuAnchor)}
                        onClose={() => setMenuAnchor(null)}
                        PaperProps={{ sx: { backgroundColor: '#18181b', border: '1px solid #27272a', minWidth: 180 } }}
                    >
                        <MenuItem onClick={handleRename}>
                            <ListItemIcon><DriveFileRenameOutlineRoundedIcon fontSize="small" sx={{ color: '#a1a1aa' }} /></ListItemIcon>
                            <ListItemText>Renommer</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={handleDuplicate}>
                            <ListItemIcon><ContentCopyRoundedIcon fontSize="small" sx={{ color: '#a1a1aa' }} /></ListItemIcon>
                            <ListItemText>Dupliquer</ListItemText>
                        </MenuItem>
                        {!isArchived && (
                            <MenuItem onClick={handleArchive}>
                                <ListItemIcon><ArchiveRoundedIcon fontSize="small" sx={{ color: '#f59e0b' }} /></ListItemIcon>
                                <ListItemText sx={{ color: '#f59e0b' }}>Archiver</ListItemText>
                            </MenuItem>
                        )}
                        <MenuItem onClick={handleDelete}>
                            <ListItemIcon><DeleteOutlineRoundedIcon fontSize="small" sx={{ color: '#f87171' }} /></ListItemIcon>
                            <ListItemText sx={{ color: '#f87171' }}>Supprimer</ListItemText>
                        </MenuItem>
                    </Menu>
                </Stack>
            </TableCell>
        </TableRow>
    );
});

function DashboardPage() {
    const navigate = useNavigate();
    const {
        activeProduction,
        currentBom,
        activateProductionSession,
        setActiveProduction,
        setImportedBom,
        setSelectedBomEntries,
        updateImportWorkspace,
        clearCurrentBom,
        clearActiveProduction,
        purgeProductionSession,
    } = useBomSession();
    const sessionStats = getBomSessionStats(currentBom);
    // Ref to read activeProduction inside callbacks without adding it to deps (breaks infinite loop)
    const activeProductionRef = React.useRef(activeProduction);
    React.useEffect(() => { activeProductionRef.current = activeProduction; }, [activeProduction]);
    const [bomStats, setBomStats] = React.useState(null);
    const [productions, setProductions] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [refreshCooldown, setRefreshCooldown] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [sortField, setSortField] = React.useState('updated_at');
    const [sortDir, setSortDir] = React.useState('desc');
    const [feedback, setFeedback] = React.useState({ type: 'info', message: '' });
    const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
    const [createName, setCreateName] = React.useState('');
    const [createDialogError, setCreateDialogError] = React.useState('');
    const [deleteDialog, setDeleteDialog] = React.useState({ open: false, production: null });
    const [renameDialog, setRenameDialog] = React.useState({ open: false, production: null, name: '' });
    const [reactivationDialog, setReactivationDialog] = React.useState({ open: false, production: null });
    const [actionLoadingId, setActionLoadingId] = React.useState(null);

    const fetchProductionDetail = React.useCallback(async (productionId) => {
        const response = await apiClient.get(`/marketplace/productions/${productionId}`);
        return response.data;
    }, []);

    const hydrateProductionSession = React.useCallback(async (productionDetail) => {
        await hydrateProductionWorkspace({
            productionDetail,
            activateProductionSession,
            setSelectedBomEntries,
            setImportedBom,
            updateImportWorkspace,
            clearCurrentBom,
        });
    }, [
        activateProductionSession,
        clearCurrentBom,
        setImportedBom,
        setSelectedBomEntries,
        updateImportWorkspace,
    ]);

    const syncProductionSession = React.useCallback(async (items) => {
        const activeProduction = activeProductionRef.current;
        const safeItems = Array.isArray(items) ? items : [];
        const currentProductionSummary = activeProduction?.id
            ? safeItems.find((production) => production.id === activeProduction.id) || null
            : null;

        if (currentProductionSummary && activeProduction) {
            setActiveProduction(buildMergedActiveProduction(activeProduction, currentProductionSummary));
            return;
        }

        const activeServerProduction = safeItems.find((production) => production.status === 'ACTIVE') || null;
        if (!activeServerProduction) {
            if (activeProduction) {
                clearActiveProduction();
            }
            return;
        }

        const productionDetail = await fetchProductionDetail(activeServerProduction.id);
        await hydrateProductionSession(productionDetail);
    }, [
        // activeProduction removed — read via ref to break the infinite loop
        clearActiveProduction,
        fetchProductionDetail,
        hydrateProductionSession,
        setActiveProduction,
    ]);

    const loadProductions = React.useCallback(async ({ preserveFeedback = false } = {}) => {
        setLoading(true);
        try {
            const response = await apiClient.get(`/marketplace/productions`);
            const items = response.data?.items || [];
            setProductions(items);
            await syncProductionSession(items);
            if (!preserveFeedback) {
                setFeedback({ type: 'info', message: '' });
            }
        } catch (requestError) {
            setFeedback({
                type: 'error',
                message: requestError.response?.data?.detail || requestError.message || 'Erreur lors du chargement des productions',
            });
        } finally {
            setLoading(false);
        }
    }, [syncProductionSession]);

    React.useEffect(() => {
        loadProductions();
    }, [loadProductions]);

    // Fetch BOM stats whenever the active production changes (A8)
    React.useEffect(() => {
        if (!activeProduction?.id) {
            setBomStats(null);
            return;
        }
        apiClient
            .get(`/reports/bom-stats?production_id=${activeProduction.id}`)
            .then((res) => setBomStats(res.data))
            .catch(() => setBomStats(null));
    }, [activeProduction?.id]);

    const handleRefresh = React.useCallback(() => {
        if (refreshCooldown) return;
        setRefreshCooldown(true);
        loadProductions();
        setTimeout(() => setRefreshCooldown(false), 1500);
    }, [loadProductions, refreshCooldown]);

    const handleOpenCreateDialog = React.useCallback(() => {
        setCreateDialogError('');
        setCreateName(buildSuggestedProductionName(productions));
        setCreateDialogOpen(true);
    }, [productions]);

    const statCards = [
        {
            label: 'Production chargée',
            value: activeProduction?.name || '--',
            hint: activeProduction
                ? `${activeProduction.bomCount || 0} BOM liée(s)`
                : 'Sélectionne une production pour travailler par lot.',
            icon: PrecisionManufacturingRoundedIcon,
            color: '#059669',
            onClick: activeProduction ? () => navigate('/bom') : null,
        },
        {
            label: 'Productions créées',
            value: productions.length,
            hint: 'Nombre total de productions actuellement enregistrées.',
            icon: StorageRoundedIcon,
            color: '#10b981',
            onClick: null,
        },
        {
            label: 'Points à vérifier',
            value: currentBom
                ? sessionStats.reviewCount
                : (bomStats ? bomStats.items_to_verify : '--'),
            hint: 'Lignes sans empreinte PnP ou type composant à confirmer. Cliquer pour filtrer.',
            icon: WarningRoundedIcon,
            color: '#f59e0b',
            onClick: (currentBom || bomStats) && activeProduction
                ? () => navigate('/bom?filter=to_verify')
                : null,
        },
        {
            label: 'Empreintes PnP',
            value: currentBom
                ? sessionStats.mappedFootprintsCount
                : (bomStats ? bomStats.items_with_footprint_pnp : '--'),
            hint: 'Nombre de lignes ayant déjà une empreinte PnP renseignée. Cliquer pour filtrer.',
            icon: CheckCircleRoundedIcon,
            color: '#34d399',
            onClick: (currentBom || bomStats) && activeProduction
                ? () => navigate('/bom?filter=has_footprint')
                : null,
        },
    ];
    const activeProductionTooltip = buildProductionTooltip(activeProduction);

    const handleSortChange = React.useCallback((field) => {
        setSortField((current) => {
            if (current === field) {
                setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                return field;
            }
            setSortDir('asc');
            return field;
        });
    }, []);

    const filteredProductions = React.useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        let list = q
            ? productions.filter((p) => (p.name || '').toLowerCase().includes(q))
            : [...productions];

        list.sort((a, b) => {
            // Archived always floats to bottom (regardless of sort field)
            const aArchived = String(a.status || '').toUpperCase() === 'ARCHIVED' ? 1 : 0;
            const bArchived = String(b.status || '').toUpperCase() === 'ARCHIVED' ? 1 : 0;
            if (aArchived !== bArchived) return aArchived - bArchived;

            let av, bv;
            if (sortField === 'bom_count') {
                av = a.bom_count ?? 0;
                bv = b.bom_count ?? 0;
            } else if (sortField === 'name') {
                av = (a.name || '').toLowerCase();
                bv = (b.name || '').toLowerCase();
            } else {
                av = a.updated_at || '';
                bv = b.updated_at || '';
            }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return list;
    }, [productions, searchQuery, sortField, sortDir]);

    const handleCreateProduction = async () => {
        const normalizedName = createName.trim();
        if (!normalizedName) {
            setCreateDialogError('Le nom de production est obligatoire.');
            return;
        }

        setActionLoadingId('create');
        setCreateDialogError('');
        try {
            const response = await apiClient.post(`/marketplace/productions`, {
                name: normalizedName,
            });
            activateProductionSession(response.data);
            setCreateDialogOpen(false);
            setCreateName('');
            setFeedback({
                type: 'success',
                message: `Production « ${response.data.name} » créée et chargée.`,
            });
            await loadProductions({ preserveFeedback: true });
            navigate('/import-bom');
        } catch (requestError) {
            const errorMessage = requestError.response?.data?.detail || requestError.message || "Erreur lors de la création de la production";
            setCreateDialogError(errorMessage);
            setFeedback({
                type: 'error',
                message: errorMessage,
            });
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleOpenProduction = React.useCallback(async (production) => {
        setActionLoadingId(production.id);
        try {
            const normalizedStatus = String(production?.status || '').toUpperCase();
            const productionDetail = normalizedStatus === 'ACTIVE'
                ? await fetchProductionDetail(production.id)
                : (
                    await apiClient.patch(`/marketplace/productions/${production.id}`, {
                        status: 'ACTIVE',
                    })
                ).data;

            await hydrateProductionSession(productionDetail);
            setFeedback({
                type: 'success',
                message: normalizedStatus === 'ACTIVE'
                    ? `Production « ${productionDetail.name} » chargée.`
                    : `Production « ${productionDetail.name} » activée et chargée.`,
            });
            await loadProductions({ preserveFeedback: true });

            if (productionDetail.bom_revisions?.length) {
                navigate('/bom');
            } else {
                navigate('/import-bom');
            }
        } catch (requestError) {
            setFeedback({
                type: 'error',
                message: requestError.response?.data?.detail || requestError.message || "Impossible d'ouvrir cette production",
            });
        } finally {
            setActionLoadingId(null);
        }
    }, [fetchProductionDetail, hydrateProductionSession, loadProductions, navigate]);

    const handleRequestOpenProduction = React.useCallback((production) => {
        if (requiresReactivationConfirmation(production?.status)) {
            setReactivationDialog({ open: true, production });
            return;
        }

        handleOpenProduction(production);
    }, [handleOpenProduction]);
    const handleRequestDeleteProduction = React.useCallback((production) => {
        setDeleteDialog({ open: true, production });
    }, []);
    const handleCloseDeleteDialog = React.useCallback(() => {
        setDeleteDialog({ open: false, production: null });
    }, []);

    const handleRequestRenameProduction = React.useCallback((production) => {
        setRenameDialog({ open: true, production, name: production.name || '' });
    }, []);
    const handleCloseRenameDialog = React.useCallback(() => {
        setRenameDialog({ open: false, production: null, name: '' });
    }, []);
    const handleConfirmRename = async () => {
        const { production, name } = renameDialog;
        if (!production) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        setActionLoadingId(production.id);
        try {
            await apiClient.patch(`/marketplace/productions/${production.id}`, { name: trimmed });
            setRenameDialog({ open: false, production: null, name: '' });
            setFeedback({ type: 'success', message: `Production renommée en « ${trimmed} ».` });
            await loadProductions({ preserveFeedback: true });
        } catch (requestError) {
            setFeedback({ type: 'error', message: requestError.response?.data?.detail || 'Erreur lors du renommage' });
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleArchiveProduction = React.useCallback(async (production) => {
        setActionLoadingId(production.id);
        try {
            await apiClient.patch(`/marketplace/productions/${production.id}`, { status: 'ARCHIVED' });
            if (activeProduction?.id === production.id) {
                clearActiveProduction();
            }
            setFeedback({ type: 'success', message: `Production « ${production.name} » archivée.` });
            await loadProductions({ preserveFeedback: true });
        } catch (requestError) {
            setFeedback({ type: 'error', message: requestError.response?.data?.detail || "Erreur lors de l'archivage" });
        } finally {
            setActionLoadingId(null);
        }
    }, [activeProduction?.id, clearActiveProduction, loadProductions]);

    const handleDuplicateProduction = React.useCallback(async (production) => {
        setActionLoadingId(production.id);
        try {
            await apiClient.post(`/marketplace/productions/${production.id}/duplicate`);
            setFeedback({ type: 'success', message: `Production « ${production.name} » dupliquée.` });
            await loadProductions({ preserveFeedback: true });
        } catch (requestError) {
            setFeedback({ type: 'error', message: requestError.response?.data?.detail || 'Erreur lors de la duplication' });
        } finally {
            setActionLoadingId(null);
        }
    }, [loadProductions]);
    const handleCloseReactivationDialog = React.useCallback(() => {
        setReactivationDialog({ open: false, production: null });
    }, []);

    const handleConfirmReactivation = React.useCallback(() => {
        const targetProduction = reactivationDialog.production;
        setReactivationDialog({ open: false, production: null });
        if (targetProduction) {
            handleOpenProduction(targetProduction);
        }
    }, [handleOpenProduction, reactivationDialog.production]);

    const handleDeleteProduction = async () => {
        if (!deleteDialog.production) {
            return;
        }

        setActionLoadingId(deleteDialog.production.id);
        try {
            await apiClient.delete(`/marketplace/productions/${deleteDialog.production.id}`);
            purgeProductionSession(deleteDialog.production.id);
            setDeleteDialog({ open: false, production: null });
            setFeedback({
                type: 'success',
                message: 'Production supprimée avec succès.',
            });
            await loadProductions({ preserveFeedback: true });
        } catch (requestError) {
            setFeedback({
                type: 'error',
                message: requestError.response?.data?.detail || requestError.message || 'Erreur lors de la suppression de la production',
            });
        } finally {
            setActionLoadingId(null);
        }
    };

    return (
        <Stack spacing={4}>
            {feedback.message ? <Alert severity={feedback.type}>{feedback.message}</Alert> : null}

            {!loading && !productions.length && (
                <GuideBanner
                    message="Aucune production trouvée. Créez votre première production pour démarrer le flux PCB."
                    ctaLabel="Nouvelle production"
                    onCta={handleOpenCreateDialog}
                    storageKey="dashboard_empty"
                />
            )}
            {!loading && activeProduction && !currentBom && (
                <GuideBanner
                    message={`Production « ${activeProduction.name} » active — importez une BOM pour alimenter la revue.`}
                    ctaLabel="Import BOM"
                    ctaPath="/import-bom"
                    storageKey="dashboard_no_bom"
                />
            )}

            <Grid container spacing={3}>
                {statCards.map((card) => (
                    <Grid item xs={12} sm={6} lg={3} key={card.label}>
                        <StatCard {...card} onClick={card.onClick || undefined} />
                    </Grid>
                ))}
            </Grid>

            <Grid container spacing={3}>
                <Grid item xs={12} lg={8}>
                    <Card sx={{ backgroundColor: '#18181b', border: '1px solid #27272a' }}>
                        <CardContent>
                            <Stack
                                direction={{ xs: 'column', md: 'row' }}
                                spacing={2}
                                justifyContent="space-between"
                                alignItems={{ xs: 'flex-start', md: 'flex-start' }}
                                sx={{ mb: 3 }}
                            >
                                <Box>
                                    <Typography variant="h6" sx={{ mb: 1, color: '#f4f4f5', fontWeight: 600 }}>
                                        Productions créées
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: '#a1a1aa', maxWidth: 680 }}>
                                        Charge une production pour reprendre le travail dans BOM ou continue l&apos;import de nouvelles BOM dans la même production.
                                    </Typography>
                                </Box>
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                    <TextField
                                        size="small"
                                        placeholder="Rechercher une production..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <SearchRoundedIcon fontSize="small" sx={{ color: '#71717a' }} />
                                                </InputAdornment>
                                            ),
                                        }}
                                        sx={{ minWidth: 220 }}
                                    />
                                    <Button
                                        variant="outlined"
                                        startIcon={<RefreshRoundedIcon />}
                                        onClick={handleRefresh}
                                        disabled={loading || actionLoadingId !== null || refreshCooldown}
                                    >
                                        {refreshCooldown ? 'Actualisation...' : 'Actualiser'}
                                    </Button>
                                    <Button
                                        variant="contained"
                                        startIcon={<AddRoundedIcon />}
                                        onClick={handleOpenCreateDialog}
                                        disabled={actionLoadingId !== null}
                                    >
                                        Nouvelle production
                                    </Button>
                                </Stack>
                            </Stack>

                            <TableContainer sx={compactTableContainerSx}>
                                <Table sx={compactTableSx}>
                                    <TableHead sx={{ backgroundColor: 'background.default' }}>
                                        <TableRow>
                                            <TableCell sx={{ width: '42%' }}>
                                                <TableSortLabel
                                                    active={sortField === 'name'}
                                                    direction={sortField === 'name' ? sortDir : 'asc'}
                                                    onClick={() => handleSortChange('name')}
                                                    sx={{ color: '#a1a1aa', '&.Mui-active': { color: '#10b981' }, '& .MuiTableSortLabel-icon': { color: '#10b981 !important' } }}
                                                >
                                                    PRODUCTION
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell sx={{ width: '16%' }}>
                                                <TableSortLabel
                                                    active={sortField === 'bom_count'}
                                                    direction={sortField === 'bom_count' ? sortDir : 'asc'}
                                                    onClick={() => handleSortChange('bom_count')}
                                                    sx={{ color: '#a1a1aa', '&.Mui-active': { color: '#10b981' }, '& .MuiTableSortLabel-icon': { color: '#10b981 !important' } }}
                                                >
                                                    BOM LIÉES
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell sx={{ width: '22%' }}>
                                                <TableSortLabel
                                                    active={sortField === 'updated_at'}
                                                    direction={sortField === 'updated_at' ? sortDir : 'desc'}
                                                    onClick={() => handleSortChange('updated_at')}
                                                    sx={{ color: '#a1a1aa', '&.Mui-active': { color: '#10b981' }, '& .MuiTableSortLabel-icon': { color: '#10b981 !important' } }}
                                                >
                                                    DERNIÈRE MÀJ
                                                </TableSortLabel>
                                            </TableCell>
                                            <TableCell sx={{ width: '20%' }}>ACTIONS</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {loading && !productions.length ? (
                                            [0, 1, 2].map((i) => (
                                                <TableRow key={i}>
                                                    <TableCell sx={{ borderColor: '#27272a' }}>
                                                        <Stack spacing={0.75}>
                                                            <Skeleton variant="text" width="55%" height={18} sx={{ bgcolor: '#27272a' }} />
                                                            <Skeleton variant="rounded" width={72} height={20} sx={{ bgcolor: '#27272a' }} />
                                                        </Stack>
                                                    </TableCell>
                                                    <TableCell sx={{ borderColor: '#27272a' }}>
                                                        <Skeleton variant="text" width={24} height={18} sx={{ bgcolor: '#27272a' }} />
                                                    </TableCell>
                                                    <TableCell sx={{ borderColor: '#27272a' }}><Skeleton variant="text" width={80} height={18} sx={{ bgcolor: '#27272a' }} /></TableCell>
                                                    <TableCell sx={{ borderColor: '#27272a' }}><Skeleton variant="rounded" width={60} height={24} sx={{ bgcolor: '#27272a' }} /></TableCell>
                                                </TableRow>
                                            ))
                                        ) : filteredProductions.map((prod) => (
                                            <DashboardProductionRow
                                                key={prod.id}
                                                production={prod}
                                                isSessionActive={activeProduction?.id === prod.id}
                                                isBusy={actionLoadingId === prod.id}
                                                onRequestOpenProduction={handleRequestOpenProduction}
                                                onRequestDeleteProduction={handleRequestDeleteProduction}
                                                onRequestRenameProduction={handleRequestRenameProduction}
                                                onRequestArchiveProduction={handleArchiveProduction}
                                                onRequestDuplicateProduction={handleDuplicateProduction}
                                            />
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Dialog
                open={createDialogOpen}
                onClose={() => setCreateDialogOpen(false)}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>Nouvelle production</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        margin="dense"
                        label="Nom de la production"
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleCreateProduction();
                            }
                        }}
                        error={Boolean(createDialogError)}
                        helperText={createDialogError || ' '}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setCreateDialogOpen(false)}
                        disabled={actionLoadingId === 'create'}
                    >
                        Annuler
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleCreateProduction}
                        disabled={actionLoadingId === 'create' || !createName.trim()}
                    >
                        {actionLoadingId === 'create' ? 'Création...' : 'Créer'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={renameDialog.open}
                onClose={handleCloseRenameDialog}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>Renommer la production</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        margin="dense"
                        label="Nouveau nom"
                        value={renameDialog.name}
                        onChange={(e) => setRenameDialog((prev) => ({ ...prev, name: e.target.value }))}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleConfirmRename();
                            }
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={handleCloseRenameDialog}
                        disabled={actionLoadingId === renameDialog.production?.id}
                    >
                        Annuler
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleConfirmRename}
                        disabled={
                            actionLoadingId === renameDialog.production?.id
                            || !renameDialog.name.trim()
                        }
                    >
                        Renommer
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={deleteDialog.open}
                onClose={handleCloseDeleteDialog}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>Supprimer la production</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        Êtes-vous sûr de vouloir supprimer définitivement la production
                        {' '}
                        <strong>{deleteDialog.production?.name}</strong>
                        {' '}
                        ? Cette action est irréversible.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={handleCloseDeleteDialog}
                        disabled={actionLoadingId === deleteDialog.production?.id}
                    >
                        Annuler
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleDeleteProduction}
                        disabled={actionLoadingId === deleteDialog.production?.id}
                    >
                        {actionLoadingId === deleteDialog.production?.id ? 'Suppression...' : 'Supprimer'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={reactivationDialog.open}
                onClose={handleCloseReactivationDialog}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>Réactiver la production</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        La production
                        {' '}
                        <strong>{reactivationDialog.production?.name}</strong>
                        {' '}
                        est
                        {' '}
                        {String(reactivationDialog.production?.status || '').toUpperCase() === 'COMPLETED'
                            ? 'terminée'
                            : 'archivée'}
                        . Voulez-vous la réactiver et la charger ?
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseReactivationDialog}>Annuler</Button>
                    <Button variant="contained" onClick={handleConfirmReactivation}>
                        Réactiver et ouvrir
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}

export default DashboardPage;
