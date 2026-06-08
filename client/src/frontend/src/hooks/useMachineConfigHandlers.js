import React from 'react';
import apiClient from '../api/client';
import { extractRequestError, parsePositiveInteger } from '../utils/machinePnp';

/**
 * Handlers d'actions de la config machine (affecter/retirer feeder, affecter/
 * détacher production, réordonner la séquence, valider/recalculer le plan, filtres
 * BOM). Extrait de useMachineConfig pour rester sous 300 lignes ; reçoit les
 * loaders, l'état et les setters via `deps`.
 */
export function useMachineConfigHandlers(deps) {
    const {
        machineSummary,
        selectedFeederId,
        selectedProductionId,
        productions,
        selectedMachineProductionPlanId,
        loadMachineSummary,
        loadMachineProductionPlan,
        loadWorkspace,
        setActionLoading,
        setFeedback,
        setMachineConfigError,
        setMachineSummary,
        setMachineProductionPlan,
        setSelectedProductionId,
        setSelectedMachineProductionPlanId,
        setSelectedMachineSlotPosition,
        setSelectedMachineBomRevisionId,
        setSelectedMachineBomAssignmentFilter,
        setSelectedFeederId,
    } = deps;

    const handleAssignFeederToMachine = React.useCallback(async () => {
        if (!machineSummary?.id) return;
        const feederId = parsePositiveInteger(selectedFeederId);
        if (feederId === null) {
            setMachineConfigError('Sélectionne un type de feeder à affecter.');
            return;
        }
        setActionLoading(`assign-feeder-${machineSummary.id}-${feederId}`);
        setMachineConfigError('');
        try {
            await apiClient.post(`/marketplace/machines/${machineSummary.id}/feeder-types/${feederId}`);
            setFeedback({ type: 'success', message: 'Type de feeder affecté à la machine.' });
            setSelectedFeederId('');
            await Promise.all([loadWorkspace(), loadMachineSummary(machineSummary.id)]);
        } catch (requestError) {
            setMachineConfigError(extractRequestError(requestError, "Erreur lors de l'affectation du feeder."));
        } finally {
            setActionLoading('');
        }
    }, [loadMachineSummary, loadWorkspace, machineSummary?.id, selectedFeederId, setActionLoading, setFeedback, setMachineConfigError, setSelectedFeederId]);

    const handleRemoveFeederFromMachine = React.useCallback(async (feederId) => {
        if (!machineSummary?.id) return;
        setActionLoading(`remove-feeder-${machineSummary.id}-${feederId}`);
        setMachineConfigError('');
        try {
            await apiClient.delete(`/marketplace/machines/${machineSummary.id}/feeder-types/${feederId}`);
            setFeedback({ type: 'success', message: 'Type de feeder retiré de la machine.' });
            await Promise.all([loadWorkspace(), loadMachineSummary(machineSummary.id)]);
        } catch (requestError) {
            setMachineConfigError(extractRequestError(requestError, 'Erreur lors du retrait du feeder.'));
        } finally {
            setActionLoading('');
        }
    }, [loadMachineSummary, loadWorkspace, machineSummary?.id, setActionLoading, setFeedback, setMachineConfigError]);

    const handleAssignProductionToMachine = React.useCallback(async () => {
        if (!machineSummary?.id) return;
        const productionId = parsePositiveInteger(selectedProductionId);
        if (productionId === null) {
            setMachineConfigError('Selectionne une production a affecter.');
            return;
        }
        const selectedProduction = productions.find((p) => p.id === productionId);
        setActionLoading(`assign-production-${machineSummary.id}-${productionId}`);
        setMachineConfigError('');
        try {
            await apiClient.patch(`/marketplace/productions/${productionId}`, { machine_id: machineSummary.id });
            setFeedback({
                type: 'success',
                message: selectedProduction?.machine_id && selectedProduction.machine_id !== machineSummary.id
                    ? 'Production reaffectee a cette machine.'
                    : 'Production affectee a cette machine.',
            });
            setSelectedProductionId('');
            await loadWorkspace();
            await loadMachineSummary(machineSummary.id);
            setSelectedMachineProductionPlanId(`${productionId}`);
            setMachineProductionPlan(null);
            setSelectedMachineSlotPosition(null);
        } catch (requestError) {
            setMachineConfigError(extractRequestError(requestError, "Erreur lors de l'affectation de la production."));
        } finally {
            setActionLoading('');
        }
    }, [loadMachineSummary, loadWorkspace, machineSummary?.id, productions, selectedProductionId, setActionLoading, setFeedback, setMachineConfigError, setMachineProductionPlan, setSelectedMachineProductionPlanId, setSelectedMachineSlotPosition, setSelectedProductionId]);

    const handleDetachProductionFromMachine = React.useCallback(async (productionId) => {
        if (!machineSummary?.id) return;
        setActionLoading(`detach-production-${machineSummary.id}-${productionId}`);
        setMachineConfigError('');
        try {
            await apiClient.patch(`/marketplace/productions/${productionId}`, { machine_id: null });
            setFeedback({ type: 'success', message: 'Production retiree de la machine.' });
            await loadWorkspace();
            await loadMachineSummary(machineSummary.id);
            if (parsePositiveInteger(selectedMachineProductionPlanId) === productionId) {
                setSelectedMachineProductionPlanId('');
                setMachineProductionPlan(null);
                setSelectedMachineSlotPosition(null);
            }
        } catch (requestError) {
            setMachineConfigError(extractRequestError(requestError, 'Erreur lors du retrait de la production.'));
        } finally {
            setActionLoading('');
        }
    }, [loadMachineSummary, loadWorkspace, machineSummary?.id, selectedMachineProductionPlanId, setActionLoading, setFeedback, setMachineConfigError, setMachineProductionPlan, setSelectedMachineProductionPlanId, setSelectedMachineSlotPosition]);

    const handleMoveProductionBom = React.useCallback(async (production, bomRevisionId, direction) => {
        if (!machineSummary?.id || !production?.bom_revisions?.length) return;
        const currentOrder = production.bom_revisions.map((item) => item.bom_revision_id);
        const currentIndex = currentOrder.indexOf(bomRevisionId);
        if (currentIndex === -1) return;
        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= currentOrder.length) return;
        const nextOrder = [...currentOrder];
        const [movedRevisionId] = nextOrder.splice(currentIndex, 1);
        nextOrder.splice(targetIndex, 0, movedRevisionId);

        setActionLoading(`reorder-production-${production.id}`);
        setMachineConfigError('');
        try {
            const response = await apiClient.patch(
                `/marketplace/machines/${machineSummary.id}/productions/${production.id}/bom-order`,
                { bom_revision_ids: nextOrder },
            );
            const updatedProduction = response.data?.production || null;
            if (updatedProduction) {
                setMachineSummary((current) => {
                    if (!current) return current;
                    return {
                        ...current,
                        productions: (current.productions || []).map((item) => (
                            item.id === updatedProduction.id ? updatedProduction : item
                        )),
                    };
                });
            } else {
                await loadMachineSummary(machineSummary.id);
            }
            setMachineProductionPlan(null);
            setSelectedMachineSlotPosition(null);
            setFeedback({
                type: 'success',
                message: "Ordre de fabrication mis a jour. Valide ensuite pour calculer l'implantation.",
            });
        } catch (requestError) {
            setMachineConfigError(extractRequestError(requestError, "Erreur lors de la mise a jour de l'ordre BOM."));
        } finally {
            setActionLoading('');
        }
    }, [loadMachineSummary, machineSummary?.id, setActionLoading, setFeedback, setMachineConfigError, setMachineProductionPlan, setMachineSummary, setSelectedMachineSlotPosition]);

    const handleValidateMachineProductionPlan = React.useCallback(async (selectedMachineProduction) => {
        if (!machineSummary?.id || !selectedMachineProduction) return;
        setActionLoading(`validate-production-plan-${selectedMachineProduction.id}`);
        setMachineConfigError('');
        try {
            const response = await apiClient.post(
                `/marketplace/machines/${machineSummary.id}/productions/${selectedMachineProduction.id}/validate-order`,
            );
            const updatedProduction = response.data?.production || null;
            const computedPlan = response.data?.plan || null;
            if (updatedProduction) {
                setMachineSummary((current) => {
                    if (!current) return current;
                    return {
                        ...current,
                        productions: (current.productions || []).map((item) => (
                            item.id === updatedProduction.id ? updatedProduction : item
                        )),
                    };
                });
            } else {
                await loadMachineSummary(machineSummary.id);
            }
            setMachineProductionPlan(computedPlan);
            setSelectedMachineSlotPosition(null);
            setFeedback({ type: 'success', message: response.data?.message || 'Ordre valide et implantation calculee.' });
        } catch (requestError) {
            setMachineConfigError(extractRequestError(requestError, "Erreur lors de la validation de l'ordre de fabrication."));
        } finally {
            setActionLoading('');
        }
    }, [loadMachineSummary, machineSummary?.id, setActionLoading, setFeedback, setMachineConfigError, setMachineProductionPlan, setMachineSummary, setSelectedMachineSlotPosition]);

    const handleRefreshMachineProductionPlan = React.useCallback(async (selectedMachineProduction) => {
        if (!machineSummary?.id || !selectedMachineProduction) return;
        setActionLoading(`refresh-production-plan-${selectedMachineProduction.id}`);
        setMachineConfigError('');
        try {
            const plan = await loadMachineProductionPlan(machineSummary.id, selectedMachineProduction.id);
            if (plan) {
                setSelectedMachineSlotPosition((current) => {
                    if (current === null) return null;
                    const slotStillExists = plan.slots?.some((slot) => slot.position === current);
                    return slotStillExists ? current : null;
                });
                setFeedback({ type: 'success', message: 'Implantation feeders reactualisee.' });
            }
        } finally {
            setActionLoading('');
        }
    }, [loadMachineProductionPlan, machineSummary?.id, setActionLoading, setFeedback, setMachineConfigError, setSelectedMachineSlotPosition]);

    const handleToggleMachineBomRevision = React.useCallback((bomRevisionId, hasPlan) => {
        if (!hasPlan) return;
        setSelectedMachineSlotPosition(null);
        setSelectedMachineBomAssignmentFilter('all');
        setSelectedMachineBomRevisionId((current) => (
            current === `${bomRevisionId}` ? '' : `${bomRevisionId}`
        ));
    }, [setSelectedMachineBomAssignmentFilter, setSelectedMachineBomRevisionId, setSelectedMachineSlotPosition]);

    const handleChangeMachineBomAssignmentFilter = React.useCallback((nextFilter) => {
        setSelectedMachineSlotPosition(null);
        setSelectedMachineBomAssignmentFilter(nextFilter);
    }, [setSelectedMachineBomAssignmentFilter, setSelectedMachineSlotPosition]);

    const handleExportPnpConfig = React.useCallback(async (selectedMachineProduction, bomRevisionId = null) => {
        if (!machineSummary?.id || !selectedMachineProduction) return;
        setActionLoading(`export-pnp-${selectedMachineProduction.id}`);
        setMachineConfigError('');
        try {
            const params = {};
            if (bomRevisionId) params.bom_revision_id = bomRevisionId;
            const response = await apiClient.get(
                `/marketplace/machines/${machineSummary.id}/productions/${selectedMachineProduction.id}/export`,
                { params, responseType: 'blob' },
            );
            const contentDisposition = response.headers?.['content-disposition'] || '';
            const fileNameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i);
            const fileName = decodeURIComponent(
                fileNameMatch?.[1] || fileNameMatch?.[2] || `${selectedMachineProduction.name || 'production'}_pnp.csv`,
            );
            const downloadUrl = window.URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);
            setFeedback({ type: 'success', message: `Export PnP généré : ${fileName}.` });
        } catch (requestError) {
            setMachineConfigError(extractRequestError(requestError, "Erreur lors de l'export PnP."));
        } finally {
            setActionLoading('');
        }
    }, [machineSummary?.id, setActionLoading, setFeedback, setMachineConfigError]);

    return {
        handleAssignFeederToMachine,
        handleRemoveFeederFromMachine,
        handleAssignProductionToMachine,
        handleDetachProductionFromMachine,
        handleMoveProductionBom,
        handleValidateMachineProductionPlan,
        handleRefreshMachineProductionPlan,
        handleToggleMachineBomRevision,
        handleChangeMachineBomAssignmentFilter,
        handleExportPnpConfig,
    };
}
