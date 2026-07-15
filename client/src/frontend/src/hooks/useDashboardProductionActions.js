import React from 'react';
import apiClient from '../api/client';

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

function requiresReactivationConfirmation(status) {
    return ['ARCHIVED', 'COMPLETED'].includes(String(status || '').toUpperCase());
}

function useDashboardProductionActions({
    navigate,
    productions,
    activeProductionId,
    activateProductionSession,
    clearActiveProduction,
    purgeProductionSession,
    fetchProductionDetail,
    hydrateProductionSession,
    loadProductions,
    setFeedback,
    setActionLoadingId,
}) {
    const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
    const [createName, setCreateName] = React.useState('');
    const [createAssemblyMode, setCreateAssemblyMode] = React.useState('PNP');
    const [createDialogError, setCreateDialogError] = React.useState('');
    const [deleteDialog, setDeleteDialog] = React.useState({ open: false, production: null });
    const [renameDialog, setRenameDialog] = React.useState({ open: false, production: null, name: '' });
    const [reactivationDialog, setReactivationDialog] = React.useState({ open: false, production: null });
    const [assemblyDialog, setAssemblyDialog] = React.useState({ open: false, production: null, mode: 'PNP' });

    const handleRequestAssemblyMode = React.useCallback((production) => {
        setAssemblyDialog({
            open: true,
            production,
            mode: String(production?.assembly_mode || 'PNP').toUpperCase(),
        });
    }, []);

    const handleCloseAssemblyDialog = React.useCallback(() => {
        setAssemblyDialog({ open: false, production: null, mode: 'PNP' });
    }, []);

    const handleConfirmAssemblyMode = React.useCallback(async () => {
        const production = assemblyDialog.production;
        if (!production) return;
        setActionLoadingId(production.id);
        try {
            await apiClient.patch(`/marketplace/productions/${production.id}`, {
                assembly_mode: assemblyDialog.mode,
            });
            setAssemblyDialog({ open: false, production: null, mode: 'PNP' });
            setFeedback({
                type: 'success',
                message: `Mode d'assemblage de « ${production.name} » mis à jour.`,
            });
            await loadProductions({ preserveFeedback: true });
        } catch (requestError) {
            setFeedback({
                type: 'error',
                message: requestError.response?.data?.detail || 'Échec du changement de mode.',
            });
        } finally {
            setActionLoadingId(null);
        }
    }, [assemblyDialog, loadProductions, setFeedback, setActionLoadingId]);

    const handleOpenCreateDialog = React.useCallback(() => {
        setCreateDialogError('');
        setCreateName(buildSuggestedProductionName(productions));
        setCreateAssemblyMode('PNP');
        setCreateDialogOpen(true);
    }, [productions]);

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
                assembly_mode: createAssemblyMode,
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
    }, [fetchProductionDetail, hydrateProductionSession, loadProductions, navigate, setActionLoadingId, setFeedback]);

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
            const payload = { name: trimmed };
            // Concurrence optimiste opt-in (ADR 0013 extension B) : on transmet la
            // version lue pour détecter un renommage concurrent par un autre poste.
            if (production.version != null) payload.version = production.version;
            await apiClient.patch(`/marketplace/productions/${production.id}`, payload);
            setRenameDialog({ open: false, production: null, name: '' });
            setFeedback({ type: 'success', message: `Production renommée en « ${trimmed} ».` });
            await loadProductions({ preserveFeedback: true });
        } catch (requestError) {
            const detail = requestError.response?.data?.detail;
            if (requestError.response?.status === 409) {
                setRenameDialog({ open: false, production: null, name: '' });
                setFeedback({
                    type: 'error',
                    message: (detail && detail.message)
                        || 'Cette production a été modifiée par un autre poste. La liste a été rafraîchie.',
                });
                await loadProductions({ preserveFeedback: true });
            } else {
                setFeedback({
                    type: 'error',
                    message: (typeof detail === 'string' ? detail : detail?.message) || 'Erreur lors du renommage',
                });
            }
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleArchiveProduction = React.useCallback(async (production) => {
        setActionLoadingId(production.id);
        try {
            await apiClient.patch(`/marketplace/productions/${production.id}`, { status: 'ARCHIVED' });
            if (activeProductionId === production.id) {
                clearActiveProduction();
            }
            setFeedback({ type: 'success', message: `Production « ${production.name} » archivée.` });
            await loadProductions({ preserveFeedback: true });
        } catch (requestError) {
            setFeedback({ type: 'error', message: requestError.response?.data?.detail || "Erreur lors de l'archivage" });
        } finally {
            setActionLoadingId(null);
        }
    }, [activeProductionId, clearActiveProduction, loadProductions, setActionLoadingId, setFeedback]);

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
    }, [loadProductions, setActionLoadingId, setFeedback]);
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

    return {
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
    };
}

export default useDashboardProductionActions;
