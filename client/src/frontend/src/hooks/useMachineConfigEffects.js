import React from 'react';
import { parsePositiveInteger } from '../utils/machinePnp';

/**
 * Effets de sélection/réinitialisation de la config machine (auto-sélection de
 * production, chargement du plan, resets de filtres/slot/révision BOM). Extrait de
 * useMachineConfig pour le garder sous 300 lignes. NB : le verrou anti-boucle de
 * synchronisation des quantités reste volontairement dans le hook principal.
 */
export function useMachineConfigEffects(deps) {
    const {
        machineConfigDialogOpen,
        machineConfigTarget,
        machineSummary,
        machineSummaryProductions,
        machineSummaryProductionsById,
        selectedMachineProductionPlanId,
        selectedMachineBomRevisionId,
        selectedMachineSlotPosition,
        machineProductionPlan,
        loadMachineProductionPlan,
        setSelectedMachineProductionPlanId,
        setMachineProductionPlan,
        setSelectedMachineSlotPosition,
        setSelectedMachineBomRevisionId,
        setSelectedMachineBomAssignmentFilter,
    } = deps;

    // Auto-select first production when summary loads
    React.useEffect(() => {
        if (!machineConfigDialogOpen) return;
        if (!machineSummaryProductions.length) {
            setSelectedMachineProductionPlanId('');
            setMachineProductionPlan(null);
            setSelectedMachineSlotPosition(null);
            return;
        }
        const currentSelection = parsePositiveInteger(selectedMachineProductionPlanId);
        const selectionStillValid = currentSelection !== null
            && machineSummaryProductionsById.has(currentSelection);
        if (!selectionStillValid) {
            setSelectedMachineProductionPlanId(`${machineSummaryProductions[0].id}`);
        }
    }, [
        machineConfigDialogOpen, machineSummaryProductions, machineSummaryProductionsById,
        selectedMachineProductionPlanId, setMachineProductionPlan, setSelectedMachineProductionPlanId,
        setSelectedMachineSlotPosition,
    ]);

    // Load feeder plan when production selection changes
    React.useEffect(() => {
        const machineId = machineSummary?.id || machineConfigTarget?.id || null;
        const productionId = parsePositiveInteger(selectedMachineProductionPlanId);
        if (!machineConfigDialogOpen || !machineId || productionId === null) {
            setMachineProductionPlan(null);
            setSelectedMachineSlotPosition(null);
            return;
        }
        const production = machineSummaryProductionsById.get(productionId) || null;
        if (!production?.manufacturing_order_validated_at) {
            setMachineProductionPlan(null);
            setSelectedMachineSlotPosition(null);
            return;
        }
        loadMachineProductionPlan(machineId, productionId, selectedMachineBomRevisionId || null);
    }, [
        loadMachineProductionPlan, machineConfigDialogOpen, machineConfigTarget?.id, machineSummary?.id,
        machineSummaryProductionsById, selectedMachineProductionPlanId, selectedMachineBomRevisionId,
        setMachineProductionPlan, setSelectedMachineSlotPosition,
    ]);

    // Reset BOM revision filter when production changes
    React.useEffect(() => {
        setSelectedMachineBomRevisionId('');
        setSelectedMachineBomAssignmentFilter('all');
        setSelectedMachineSlotPosition(null);
    }, [
        selectedMachineProductionPlanId, setSelectedMachineBomAssignmentFilter,
        setSelectedMachineBomRevisionId, setSelectedMachineSlotPosition,
    ]);

    // Deselect slot if it no longer exists in the plan
    React.useEffect(() => {
        if (!machineProductionPlan?.slot_assignments?.length) {
            setSelectedMachineSlotPosition(null);
            return;
        }
        if (selectedMachineSlotPosition === null) return;
        const slotStillExists = machineProductionPlan.slots?.some(
            (slot) => slot.position === selectedMachineSlotPosition,
        );
        if (!slotStillExists) setSelectedMachineSlotPosition(null);
    }, [machineProductionPlan, selectedMachineSlotPosition, setSelectedMachineSlotPosition]);

    // Validate selected BOM revision is still part of current production
    React.useEffect(() => {
        if (!selectedMachineBomRevisionId) return;
        const currentProductionId = parsePositiveInteger(selectedMachineProductionPlanId);
        const currentProduction = currentProductionId === null
            ? null
            : machineSummaryProductionsById.get(currentProductionId) || null;
        const bomRevisionIds = new Set(
            (currentProduction?.bom_revisions || []).map((bom) => bom.bom_revision_id),
        );
        const currentBomRevisionId = parsePositiveInteger(selectedMachineBomRevisionId);
        if (currentBomRevisionId === null || !bomRevisionIds.has(currentBomRevisionId)) {
            setSelectedMachineBomRevisionId('');
        }
    }, [
        machineSummaryProductionsById, selectedMachineBomRevisionId, selectedMachineProductionPlanId,
        setSelectedMachineBomRevisionId,
    ]);

    // Reset assignment filter when BOM revision deselected
    React.useEffect(() => {
        if (!selectedMachineBomRevisionId) {
            setSelectedMachineBomAssignmentFilter('all');
        }
    }, [selectedMachineBomRevisionId, setSelectedMachineBomAssignmentFilter]);
}
