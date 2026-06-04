import React from 'react';
import {
    buildMachineTopView,
    getMachineSlotLayout,
    isCommonMachineAssignment,
    machineCommonAssignmentPalette,
    parsePositiveInteger,
} from '../utils/machinePnp';

/**
 * Sélecteurs/dérivations purs du plan d'implantation machine (maps, assignations
 * visibles, vue machine, sélection courante, listes disponibles). Extrait de
 * useMachineConfig pour le garder sous 300 lignes. Aucun effet, aucune mutation —
 * uniquement des useMemo dépendant de l'état passé en entrée.
 */
export function useMachineConfigSelectors({
    machineProductionPlan,
    machineSummary,
    machineConfigTarget,
    machineSummaryProductions,
    machineSummaryProductionsById,
    selectedMachineProductionPlanId,
    selectedMachineBomRevisionId,
    selectedMachineBomAssignmentFilter,
    selectedMachineSlotPosition,
    feeders,
    productions,
}) {
    // ── Plan maps ──────────────────────────────────────────────────────────────
    const machinePlanSlotMap = React.useMemo(
        () => new Map((machineProductionPlan?.slots || []).map((slot) => [slot.position, slot])),
        [machineProductionPlan],
    );
    const machinePlanAssignmentMap = React.useMemo(
        () => new Map((machineProductionPlan?.slot_assignments || []).map((a) => [a.assignment_index, a])),
        [machineProductionPlan],
    );
    const machinePlanOrderedBomMap = React.useMemo(
        () => new Map((machineProductionPlan?.ordered_boms || []).map((bom) => [bom.bom_revision_id, bom])),
        [machineProductionPlan],
    );
    const machinePlanAssignmentSummaryMap = React.useMemo(() => {
        if (!machineProductionPlan) return new Map();
        if (machineProductionPlan.bom_assignment_summaries?.length) {
            return new Map(
                machineProductionPlan.bom_assignment_summaries.map((s) => [s.bom_revision_id, s]),
            );
        }
        const fallbackMap = new Map();
        (machineProductionPlan.ordered_boms || []).forEach((bom) => {
            const assignmentIndexes = (machineProductionPlan.slot_assignments || [])
                .filter((a) => a.bom_revision_ids?.includes(bom.bom_revision_id))
                .map((a) => a.assignment_index);
            fallbackMap.set(bom.bom_revision_id, {
                bom_revision_id: bom.bom_revision_id,
                assignment_indexes: assignmentIndexes,
                assignment_count: assignmentIndexes.length,
            });
        });
        return fallbackMap;
    }, [machineProductionPlan]);

    const machineCommonAssignmentCount = React.useMemo(
        () => (machineProductionPlan?.slot_assignments || []).filter((a) => isCommonMachineAssignment(a)).length,
        [machineProductionPlan],
    );
    const machinePlanOverviewChips = React.useMemo(() => {
        if (!machineProductionPlan) return [];
        return [
            { label: `${machineProductionPlan.total_build_quantity || 0} carte(s) planifiee(s)`, color: '#86efac' },
            { label: `${machineProductionPlan.assigned_component_count || 0} composant(s) places`, color: '#38bdf8' },
            { label: `${machineProductionPlan.occupied_slot_count || 0}/${machineProductionPlan.machine_positions || 0} slots occupes`, color: '#94a3b8' },
            { label: `${machineCommonAssignmentCount || 0} commun(s)`, color: machineCommonAssignmentPalette.chipColor },
            { label: `${machineProductionPlan.unassigned_component_count || 0} non place(s)`, color: '#f97316' },
        ];
    }, [machineCommonAssignmentCount, machineProductionPlan]);

    // ── Vue machine ────────────────────────────────────────────────────────────
    const machineTopView = React.useMemo(
        () => buildMachineTopView(machineSummary?.num_positions || machineConfigTarget?.num_positions || 0),
        [machineSummary?.num_positions, machineConfigTarget?.num_positions],
    );
    const backSlotLayout = React.useMemo(
        () => getMachineSlotLayout(machineTopView.backSlots.length),
        [machineTopView.backSlots.length],
    );
    const frontSlotLayout = React.useMemo(
        () => getMachineSlotLayout(machineTopView.frontSlots.length),
        [machineTopView.frontSlots.length],
    );

    // ── Sélection courante ─────────────────────────────────────────────────────
    const selectedMachineProduction = React.useMemo(() => {
        if (!machineSummaryProductions.length) return null;
        const targetId = parsePositiveInteger(selectedMachineProductionPlanId);
        if (targetId === null) return machineSummaryProductions[0] || null;
        return machineSummaryProductionsById.get(targetId) || null;
    }, [machineSummaryProductions, machineSummaryProductionsById, selectedMachineProductionPlanId]);

    const selectedMachineBomRevision = React.useMemo(() => {
        if (!selectedMachineProduction?.bom_revisions?.length) return null;
        const targetId = parsePositiveInteger(selectedMachineBomRevisionId);
        if (targetId === null) return null;
        return selectedMachineProduction.bom_revisions.find((bom) => bom.bom_revision_id === targetId) || null;
    }, [selectedMachineBomRevisionId, selectedMachineProduction?.bom_revisions]);

    const selectedMachineSlot = React.useMemo(() => {
        if (!machineProductionPlan?.slots?.length || selectedMachineSlotPosition === null) return null;
        const selectedSlotEntry = machineProductionPlan.slots.find(
            (slot) => slot.position === selectedMachineSlotPosition,
        ) || null;
        if (!selectedSlotEntry?.assignment_index) return selectedSlotEntry;
        const assignment = machineProductionPlan.slot_assignments?.find(
            (item) => item.assignment_index === selectedSlotEntry.assignment_index,
        ) || null;
        return assignment ? { ...selectedSlotEntry, assignment } : selectedSlotEntry;
    }, [machineProductionPlan, selectedMachineSlotPosition]);

    const selectedMachineBomAssignmentSummary = React.useMemo(() => {
        if (!selectedMachineBomRevision) return null;
        return machinePlanAssignmentSummaryMap.get(selectedMachineBomRevision.bom_revision_id) || null;
    }, [machinePlanAssignmentSummaryMap, selectedMachineBomRevision]);

    // ── Assignations visibles ──────────────────────────────────────────────────
    const baseVisibleMachineAssignmentIndexes = React.useMemo(() => {
        if (!machineProductionPlan) return [];
        if (selectedMachineBomAssignmentSummary) {
            return selectedMachineBomAssignmentSummary.assignment_indexes || [];
        }
        if (machineProductionPlan.stable_assignment_indexes?.length) {
            return machineProductionPlan.stable_assignment_indexes;
        }
        return (machineProductionPlan.slot_assignments || [])
            .filter((a) => a.is_stable_between_boms)
            .map((a) => a.assignment_index);
    }, [machineProductionPlan, selectedMachineBomAssignmentSummary]);

    const baseVisibleMachineAssignments = React.useMemo(
        () => baseVisibleMachineAssignmentIndexes
            .map((idx) => machinePlanAssignmentMap.get(idx) || null)
            .filter(Boolean),
        [baseVisibleMachineAssignmentIndexes, machinePlanAssignmentMap],
    );

    const visibleMachineAssignments = React.useMemo(() => {
        if (!selectedMachineBomRevision) return baseVisibleMachineAssignments;
        if (selectedMachineBomAssignmentFilter === 'common') {
            return baseVisibleMachineAssignments.filter((a) => isCommonMachineAssignment(a));
        }
        if (selectedMachineBomAssignmentFilter === 'install') {
            return baseVisibleMachineAssignments.filter((a) => !isCommonMachineAssignment(a));
        }
        return baseVisibleMachineAssignments;
    }, [baseVisibleMachineAssignments, selectedMachineBomAssignmentFilter, selectedMachineBomRevision]);

    const visibleMachineAssignmentIndexes = React.useMemo(
        () => visibleMachineAssignments.map((a) => a.assignment_index),
        [visibleMachineAssignments],
    );
    const visibleMachineAssignmentIndexSet = React.useMemo(
        () => new Set(visibleMachineAssignmentIndexes),
        [visibleMachineAssignmentIndexes],
    );

    const machineAssignmentDisplayMode = React.useMemo(() => (
        selectedMachineBomRevision
            ? { totalColumnLabel: 'Qte totale BOM', perBoardColumnLabel: 'Qte / carte BOM' }
            : { totalColumnLabel: 'Qte totale prod.', perBoardColumnLabel: 'Qte / carte' }
    ), [selectedMachineBomRevision]);

    const selectedMachineBomCommonAssignmentCount = React.useMemo(
        () => baseVisibleMachineAssignments.filter((a) => isCommonMachineAssignment(a)).length,
        [baseVisibleMachineAssignments],
    );
    const selectedMachineBomInstallAssignmentCount = React.useMemo(
        () => baseVisibleMachineAssignments.filter((a) => !isCommonMachineAssignment(a)).length,
        [baseVisibleMachineAssignments],
    );

    // ── Listes disponibles ─────────────────────────────────────────────────────
    const availableFeedersForMachine = React.useMemo(() => {
        const assignedFeederIds = new Set((machineSummary?.feeders || []).map((f) => f.id));
        return feeders.filter((f) => !assignedFeederIds.has(f.id));
    }, [feeders, machineSummary]);

    const availableProductionsForMachine = React.useMemo(() => {
        const currentMachineId = machineSummary?.id || machineConfigTarget?.id || null;
        return productions.filter((p) => p.machine_id !== currentMachineId);
    }, [machineConfigTarget?.id, machineSummary?.id, productions]);

    return {
        machinePlanSlotMap,
        machinePlanAssignmentMap,
        machinePlanOrderedBomMap,
        machinePlanAssignmentSummaryMap,
        machineCommonAssignmentCount,
        machinePlanOverviewChips,
        machineTopView,
        backSlotLayout,
        frontSlotLayout,
        selectedMachineProduction,
        selectedMachineBomRevision,
        selectedMachineSlot,
        selectedMachineBomAssignmentSummary,
        baseVisibleMachineAssignments,
        visibleMachineAssignments,
        visibleMachineAssignmentIndexes,
        visibleMachineAssignmentIndexSet,
        machineAssignmentDisplayMode,
        selectedMachineBomCommonAssignmentCount,
        selectedMachineBomInstallAssignmentCount,
        availableFeedersForMachine,
        availableProductionsForMachine,
    };
}
