import React from 'react';
import apiClient from '../api/client';
import { extractRequestError } from '../utils/machinePnp';

/**
 * Chargeurs (résumé machine, plan d'implantation) + contrôle du dialogue de config
 * (ouverture/fermeture, sélection de slot). Extrait de useMachineConfig pour rester
 * sous 300 lignes ; reçoit refs et setters du hook principal via `deps`. Les
 * handlers d'actions vivent dans useMachineConfigHandlers.
 */
export function useMachineConfigActions(deps) {
    const {
        mountedRef,
        latestPlanRef,
        syncingMachineProductionQuantitiesRef,
        setMachineSummary,
        setMachineSummaryLoading,
        setMachineConfigError,
        setMachineProductionPlan,
        setMachineProductionPlanLoading,
        setMachineConfigDialogOpen,
        setMachineConfigTarget,
        setSelectedProductionId,
        setSelectedMachineProductionPlanId,
        setSelectedMachineBomRevisionId,
        setSelectedMachineBomAssignmentFilter,
        setSelectedMachineSlotPosition,
    } = deps;

    // ── Loaders ───────────────────────────────────────────────────────────────

    const loadMachineSummary = React.useCallback(async (machineId) => {
        if (mountedRef.current) {
            setMachineSummaryLoading(true);
            setMachineConfigError('');
        }
        try {
            const response = await apiClient.get(`/marketplace/machines/${machineId}/summary`);
            if (!mountedRef.current) return null;
            setMachineSummary(response.data);
            return response.data;
        } catch (requestError) {
            if (mountedRef.current) {
                setMachineSummary(null);
                setMachineConfigError(extractRequestError(requestError, 'Impossible de charger le résumé de la machine.'));
            }
            return null;
        } finally {
            if (mountedRef.current) setMachineSummaryLoading(false);
        }
    }, [mountedRef, setMachineConfigError, setMachineSummary, setMachineSummaryLoading]);

    const loadMachineProductionPlan = React.useCallback(async (machineId, productionId) => {
        if (!machineId || !productionId) {
            if (mountedRef.current) setMachineProductionPlan(null);
            return null;
        }
        const requestId = (latestPlanRef.current += 1);
        if (mountedRef.current) setMachineProductionPlanLoading(true);
        try {
            const response = await apiClient.get(
                `/marketplace/machines/${machineId}/productions/${productionId}/feeder-plan`,
            );
            if (!mountedRef.current || requestId !== latestPlanRef.current) return null;
            setMachineProductionPlan(response.data || null);
            return response.data || null;
        } catch (requestError) {
            if (!mountedRef.current || requestId !== latestPlanRef.current) return null;
            setMachineProductionPlan(null);
            setMachineConfigError(extractRequestError(requestError, "Impossible de charger l'implantation feeders."));
            return null;
        } finally {
            if (mountedRef.current && requestId === latestPlanRef.current) setMachineProductionPlanLoading(false);
        }
    }, [latestPlanRef, mountedRef, setMachineConfigError, setMachineProductionPlan, setMachineProductionPlanLoading]);

    // ── Dialog open/close ─────────────────────────────────────────────────────

    const closeMachineConfigDialog = React.useCallback(() => {
        setMachineConfigDialogOpen(false);
        setMachineConfigTarget(null);
        setMachineSummary(null);
        setMachineProductionPlan(null);
        setMachineConfigError('');
        syncingMachineProductionQuantitiesRef.current = '';
        setSelectedProductionId('');
        setSelectedMachineProductionPlanId('');
        setSelectedMachineBomRevisionId('');
        setSelectedMachineBomAssignmentFilter('all');
        setSelectedMachineSlotPosition(null);
    }, [
        setMachineConfigDialogOpen, setMachineConfigError, setMachineConfigTarget, setMachineProductionPlan,
        setMachineSummary, setSelectedMachineBomAssignmentFilter, setSelectedMachineBomRevisionId,
        setSelectedMachineProductionPlanId, setSelectedMachineSlotPosition, setSelectedProductionId,
        syncingMachineProductionQuantitiesRef,
    ]);

    const openMachineConfigDialog = React.useCallback((machine) => {
        setMachineConfigTarget(machine);
        setMachineConfigDialogOpen(true);
        setMachineSummary(null);
        setMachineProductionPlan(null);
        syncingMachineProductionQuantitiesRef.current = '';
        setSelectedProductionId('');
        setSelectedMachineProductionPlanId('');
        setSelectedMachineBomRevisionId('');
        setSelectedMachineBomAssignmentFilter('all');
        setSelectedMachineSlotPosition(null);
        loadMachineSummary(machine.id);
    }, [
        loadMachineSummary, setMachineConfigDialogOpen, setMachineConfigTarget, setMachineProductionPlan,
        setMachineSummary, setSelectedMachineBomAssignmentFilter, setSelectedMachineBomRevisionId,
        setSelectedMachineProductionPlanId, setSelectedMachineSlotPosition, setSelectedProductionId,
        syncingMachineProductionQuantitiesRef,
    ]);

    const handleSelectMachineSlot = React.useCallback((slotPosition) => {
        setSelectedMachineSlotPosition(slotPosition);
    }, [setSelectedMachineSlotPosition]);

    return {
        loadMachineSummary,
        loadMachineProductionPlan,
        closeMachineConfigDialog,
        openMachineConfigDialog,
        handleSelectMachineSlot,
    };
}
