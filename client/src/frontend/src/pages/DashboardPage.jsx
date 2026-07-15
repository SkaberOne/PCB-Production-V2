import React from 'react';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import PrecisionManufacturingRoundedIcon from '@mui/icons-material/PrecisionManufacturingRounded';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import { Alert, Grid, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import GuideBanner from '../components/common/GuideBanner';
import AssemblyModeDialog from '../components/dashboard/AssemblyModeDialog';
import CreateProductionDialog from '../components/dashboard/CreateProductionDialog';
import DashboardStatCards from '../components/dashboard/DashboardStatCards';
import DeleteProductionDialog from '../components/dashboard/DeleteProductionDialog';
import ProductionsTable from '../components/dashboard/ProductionsTable';
import ProductionSummaryCards from '../components/dashboard/ProductionSummaryCards';
import ReactivateProductionDialog from '../components/dashboard/ReactivateProductionDialog';
import RenameProductionDialog from '../components/dashboard/RenameProductionDialog';
import { useBomSession } from '../context/BomSessionContext';
import useDashboardProductionActions from '../hooks/useDashboardProductionActions';
import useDashboardProductions from '../hooks/useDashboardProductions';
import { getBomSessionStats } from '../utils/bomSession';

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
    const [searchQuery, setSearchQuery] = React.useState('');
    const [sortField, setSortField] = React.useState('updated_at');
    const [sortDir, setSortDir] = React.useState('desc');

    const {
        bomStats,
        productions,
        loading,
        refreshCooldown,
        feedback,
        setFeedback,
        actionLoadingId,
        setActionLoadingId,
        fetchProductionDetail,
        hydrateProductionSession,
        loadProductions,
        handleRefresh,
    } = useDashboardProductions({
        activeProduction,
        setActiveProduction,
        clearActiveProduction,
        activateProductionSession,
        setImportedBom,
        setSelectedBomEntries,
        updateImportWorkspace,
        clearCurrentBom,
    });

    const {
        createDialogOpen,
        setCreateDialogOpen,
        createName,
        setCreateName,
        createAssemblyMode,
        setCreateAssemblyMode,
        createDialogError,
        assemblyDialog,
        setAssemblyDialog,
        handleRequestAssemblyMode,
        handleCloseAssemblyDialog,
        handleConfirmAssemblyMode,
        deleteDialog,
        renameDialog,
        setRenameDialog,
        reactivationDialog,
        handleOpenCreateDialog,
        handleCreateProduction,
        handleRequestOpenProduction,
        handleRequestDeleteProduction,
        handleCloseDeleteDialog,
        handleRequestRenameProduction,
        handleCloseRenameDialog,
        handleConfirmRename,
        handleArchiveProduction,
        handleDuplicateProduction,
        handleCloseReactivationDialog,
        handleConfirmReactivation,
        handleDeleteProduction,
    } = useDashboardProductionActions({
        navigate,
        productions,
        activeProductionId: activeProduction?.id,
        activateProductionSession,
        clearActiveProduction,
        purgeProductionSession,
        fetchProductionDetail,
        hydrateProductionSession,
        loadProductions,
        setFeedback,
        setActionLoadingId,
    });

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

            <DashboardStatCards cards={statCards} />

            <Grid container spacing={3}>
                <Grid item xs={12} lg={8}>
                    <ProductionsTable
                        productions={productions}
                        filteredProductions={filteredProductions}
                        loading={loading}
                        refreshCooldown={refreshCooldown}
                        actionLoadingId={actionLoadingId}
                        searchQuery={searchQuery}
                        onSearchQueryChange={setSearchQuery}
                        sortField={sortField}
                        sortDir={sortDir}
                        onSortChange={handleSortChange}
                        onRefresh={handleRefresh}
                        onOpenCreateDialog={handleOpenCreateDialog}
                        activeProductionId={activeProduction?.id}
                        onRequestOpenProduction={handleRequestOpenProduction}
                        onRequestDeleteProduction={handleRequestDeleteProduction}
                        onRequestRenameProduction={handleRequestRenameProduction}
                        onRequestArchiveProduction={handleArchiveProduction}
                        onRequestDuplicateProduction={handleDuplicateProduction}
                        onRequestAssemblyMode={handleRequestAssemblyMode}
                    />
                </Grid>
                <Grid item xs={12} lg={4}>
                    <ProductionSummaryCards activeProductionId={activeProduction?.id} />
                </Grid>
            </Grid>

            <CreateProductionDialog
                open={createDialogOpen}
                name={createName}
                errorText={createDialogError}
                busy={actionLoadingId === 'create'}
                assemblyMode={createAssemblyMode}
                onAssemblyModeChange={setCreateAssemblyMode}
                onClose={() => setCreateDialogOpen(false)}
                onNameChange={setCreateName}
                onConfirm={handleCreateProduction}
            />

            <RenameProductionDialog
                open={renameDialog.open}
                name={renameDialog.name}
                busy={actionLoadingId === renameDialog.production?.id}
                onClose={handleCloseRenameDialog}
                onNameChange={(value) => setRenameDialog((prev) => ({ ...prev, name: value }))}
                onConfirm={handleConfirmRename}
            />

            <DeleteProductionDialog
                open={deleteDialog.open}
                production={deleteDialog.production}
                busy={actionLoadingId === deleteDialog.production?.id}
                onClose={handleCloseDeleteDialog}
                onConfirm={handleDeleteProduction}
            />

            <ReactivateProductionDialog
                open={reactivationDialog.open}
                production={reactivationDialog.production}
                onClose={handleCloseReactivationDialog}
                onConfirm={handleConfirmReactivation}
            />

            <AssemblyModeDialog
                open={assemblyDialog.open}
                production={assemblyDialog.production}
                mode={assemblyDialog.mode}
                busy={actionLoadingId === assemblyDialog.production?.id}
                onModeChange={(value) => setAssemblyDialog((prev) => ({ ...prev, mode: value }))}
                onClose={handleCloseAssemblyDialog}
                onConfirm={handleConfirmAssemblyMode}
            />
        </Stack>
    );
}

export default DashboardPage;
