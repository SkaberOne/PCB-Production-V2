import React from 'react';
import apiClient from '../api/client';
import { buildReferenceRevisionKey } from '../utils/bomWorkspace';
import {
    buildMachineTopView,
    extractRequestError,
    getMachineSlotLayout,
    isCommonMachineAssignment,
    machineCommonAssignmentPalette,
    parsePositiveInteger,
} from '../utils/machinePnp';

/**
 * Manages the machine config dialog: machineSummary, production plan, slot
 * selection, BOM revision filtering, and all machine-config-related handlers.
 *
 * @param {object} opts
 * @param {object|null} opts.activeProduction   - From BomSessionContext
 * @param {object|null} opts.bomWorkspace       - From BomSessionContext
 * @param {Array}       opts.feeders            - From useWorkspaceData
 * @param {Array}       opts.productions        - From useWorkspaceData
 * @param {Function}    opts.setFeedback
 * @param {Function}    opts.setActionLoading
 * @param {string}      opts.actionLoading
 * @param {Function}    opts.loadWorkspace
 */
export function useMachineConfig({
    activeProduction,
    bomWorkspace,
    feeders,
    productions,
    setFeedback,
    setActionLoading,
    actionLoading,
    loadWorkspace,
}) {
    // Dialog open/target
    const [machineConfigDialogOpen, setMachineConfigDialogOpen] = React.useState(false);
    const [machineConfigTarget, setMachineConfigTarget] = React.useState(null);

    // Machine summary
    const [machineSummary, setMachineSummary] = React.useState(null);
    const [machineSummaryLoading, setMachineSummaryLoading] = React.useState(false);
    const [machineConfigError, setMachineConfigError] = React.useState('');

    // Production plan
    const [machineProductionPlan, setMachineProductionPlan] = React.useState(null);
    const [machineProductionPlanLoading, setMachineProductionPlanLoading] = React.useState(false);

    // Selection state
    const [selectedMachineProductionPlanId, setSelectedMachineProductionPlanId] = React.useState('');
    const [selectedMachineBomRevisionId, setSelectedMachineBomRevisionId] = React.useState('');
    const [selectedMachineBomAssignmentFilter, setSelectedMachineBomAssignmentFilter] = React.useState('all');
    const [selectedMachineSlotPosition, setSelectedMachineSlotPosition] = React.useState(null);

    // Feeder / production assignment selectors (inside config dialog)
    const [selectedFeederId, setSelectedFeederId] = React.useState('');
    const [selectedProductionId, setSelectedProductionId] = React.useState('');

    const syncingMachineProductionQuantitiesRef = React.useRef('');

    // Garde de montage + jeton « dernière requête gagne » pour le plan (la
    // sélection de production peut changer plus vite que la réponse réseau).
    const mountedRef = React.useRef(true);
    const latestPlanRef = React.useRef(0);
    React.useEffect(() => () => { mountedRef.current = false; }, []);

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
    }, []);

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
    }, []);

    // ── Derived: summary productions ─────────────────────────────────────────

    const machineSummaryProductions = React.useMemo(
        () => (Array.isArray(machineSummary?.productions) ? machineSummary.productions : []),
        [machineSummary?.productions],
    );
    const machineSummaryProductionsById = React.useMemo(
        () => new Map(machineSummaryProductions.map((p) => [p.id, p])),
        [machineSummaryProductions],
    );

    // ── Auto-sync BOM quantities from session ────────────────────────────────

    const syncMachineProductionQuantitiesFromSession = React.useCallback(async (production) => {
        if (!machineConfigDialogOpen || !machineSummary?.id || !production?.id
            || activeProduction?.id !== production.id) {
            return false;
        }
        const quantityEntries = bomWorkspace?.quantitiesByReference || {};
        const quantityItems = (production.bom_revisions || [])
            .map((bom) => {
                const quantityKey = buildReferenceRevisionKey(bom.reference, bom.revision);
                const sessionQuantity = Number(quantityEntries[quantityKey]?.quantityToProduce || 0);
                const persistedQuantity = Number(bom.quantity_to_produce || 1);
                if (!Number.isFinite(sessionQuantity) || sessionQuantity < 1
                    || sessionQuantity === persistedQuantity) {
                    return null;
                }
                return { bom_revision_id: bom.bom_revision_id, quantity_to_produce: sessionQuantity };
            })
            .filter(Boolean);

        if (!quantityItems.length) return false;

        const syncSignature = `${production.id}:${quantityItems.map((item) => `${item.bom_revision_id}:${item.quantity_to_produce}`).join('|')}`;
        if (syncingMachineProductionQuantitiesRef.current === syncSignature) return false;
        syncingMachineProductionQuantitiesRef.current = syncSignature;

        try {
            const response = await apiClient.patch(
                `/marketplace/productions/${production.id}/bom-quantities`,
                { items: quantityItems },
            );
            const updatedProduction = response.data || null;
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
                if (updatedProduction.has_validated_order) {
                    await loadMachineProductionPlan(machineSummary.id, updatedProduction.id);
                }
            }
            return true;
        } catch (requestError) {
            // Réinitialiser la signature uniquement en cas d'erreur, pour autoriser
            // une nouvelle tentative. En cas de succès on CONSERVE la signature :
            // c'est la garde d'idempotence qui empêche le renvoi en boucle du même
            // payload (cause historique de la boucle infinie).
            syncingMachineProductionQuantitiesRef.current = '';
            setMachineConfigError(extractRequestError(requestError, 'Impossible de synchroniser les quantites BOM avec la production.'));
            return false;
        }
    }, [
        activeProduction?.id,
        bomWorkspace?.quantitiesByReference,
        loadMachineProductionPlan,
        machineConfigDialogOpen,
        machineSummary?.id,
    ]);

    // ── useEffects ────────────────────────────────────────────────────────────

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
    }, [machineConfigDialogOpen, machineSummaryProductions, machineSummaryProductionsById, selectedMachineProductionPlanId]);

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
        loadMachineProductionPlan(machineId, productionId);
    }, [
        loadMachineProductionPlan,
        machineConfigDialogOpen,
        machineConfigTarget?.id,
        machineSummary?.id,
        machineSummaryProductionsById,
        selectedMachineProductionPlanId,
    ]);

    // Reset BOM revision filter when production changes
    React.useEffect(() => {
        setSelectedMachineBomRevisionId('');
        setSelectedMachineBomAssignmentFilter('all');
        setSelectedMachineSlotPosition(null);
    }, [selectedMachineProductionPlanId]);

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
    }, [machineProductionPlan, selectedMachineSlotPosition]);

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
    }, [machineSummaryProductionsById, selectedMachineBomRevisionId, selectedMachineProductionPlanId]);

    // Reset assignment filter when BOM revision deselected
    React.useEffect(() => {
        if (!selectedMachineBomRevisionId) {
            setSelectedMachineBomAssignmentFilter('all');
        }
    }, [selectedMachineBomRevisionId]);

    // Ref stable vers la dernière version de la fonction de sync. Évite que
    // l'effet ci-dessous se redéclenche à CHAQUE render uniquement parce que
    // l'identité du callback a changé (il dépend de bomWorkspace.quantitiesByReference,
    // recréé à chaque render). C'est l'un des deux verrous anti-boucle infinie.
    const syncMachineProductionQuantitiesRef = React.useRef(syncMachineProductionQuantitiesFromSession);
    React.useEffect(() => {
        syncMachineProductionQuantitiesRef.current = syncMachineProductionQuantitiesFromSession;
    }, [syncMachineProductionQuantitiesFromSession]);

    // Signature de contenu des quantités de session pour la production ciblée.
    // L'effet de sync ne se redéclenche que lorsque les quantités changent
    // RÉELLEMENT, et non à chaque render — second verrou anti-boucle infinie.
    const sessionQuantitySignature = React.useMemo(() => {
        if (!machineConfigDialogOpen || !machineSummaryProductions.length) return '';
        const targetId = parsePositiveInteger(selectedMachineProductionPlanId);
        const targetProduction = targetId === null
            ? machineSummaryProductions[0] || null
            : machineSummaryProductionsById.get(targetId) || null;
        if (!targetProduction?.bom_revisions?.length) return '';
        const quantityEntries = bomWorkspace?.quantitiesByReference || {};
        return targetProduction.bom_revisions
            .map((bom) => {
                const quantityKey = buildReferenceRevisionKey(bom.reference, bom.revision);
                return `${bom.bom_revision_id}:${Number(quantityEntries[quantityKey]?.quantityToProduce || 0)}`;
            })
            .join('|');
    }, [
        bomWorkspace?.quantitiesByReference,
        machineConfigDialogOpen,
        machineSummaryProductions,
        machineSummaryProductionsById,
        selectedMachineProductionPlanId,
    ]);

    // Sync BOM quantities from session into production (idempotent, signature-gated)
    React.useEffect(() => {
        if (!machineConfigDialogOpen || !machineSummaryProductions.length) return;
        const targetId = parsePositiveInteger(selectedMachineProductionPlanId);
        const targetProduction = targetId === null
            ? machineSummaryProductions[0] || null
            : machineSummaryProductionsById.get(targetId) || null;
        if (!targetProduction) return;
        syncMachineProductionQuantitiesRef.current(targetProduction);
    }, [
        machineConfigDialogOpen,
        machineSummaryProductions,
        machineSummaryProductionsById,
        selectedMachineProductionPlanId,
        sessionQuantitySignature,
    ]);

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
    }, []);

    /**
     * Open the machine config dialog for a given machine.
     * Note: caller is responsible for closing any context menu beforehand.
     */
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
    }, [loadMachineSummary]);

    const handleSelectMachineSlot = React.useCallback((slotPosition) => {
        setSelectedMachineSlotPosition(slotPosition);
    }, []);

    // ── Machine config CRUD ───────────────────────────────────────────────────

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
    }, [loadMachineSummary, loadWorkspace, machineSummary?.id, selectedFeederId, setActionLoading, setFeedback]);

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
    }, [loadMachineSummary, loadWorkspace, machineSummary?.id, setActionLoading, setFeedback]);

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
    }, [loadMachineSummary, loadWorkspace, machineSummary?.id, productions, selectedProductionId, setActionLoading, setFeedback]);

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
    }, [loadMachineSummary, loadWorkspace, machineSummary?.id, selectedMachineProductionPlanId, setActionLoading, setFeedback]);

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
    }, [loadMachineSummary, machineSummary?.id, setActionLoading, setFeedback]);

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
    }, [loadMachineSummary, machineSummary?.id, setActionLoading, setFeedback]);

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
    }, [loadMachineProductionPlan, machineSummary?.id, setActionLoading, setFeedback]);

    const handleToggleMachineBomRevision = React.useCallback((bomRevisionId, hasPlan) => {
        if (!hasPlan) return;
        setSelectedMachineSlotPosition(null);
        setSelectedMachineBomAssignmentFilter('all');
        setSelectedMachineBomRevisionId((current) => (
            current === `${bomRevisionId}` ? '' : `${bomRevisionId}`
        ));
    }, []);

    const handleChangeMachineBomAssignmentFilter = React.useCallback((nextFilter) => {
        setSelectedMachineSlotPosition(null);
        setSelectedMachineBomAssignmentFilter(nextFilter);
    }, []);

    // ── Derived: plan maps ────────────────────────────────────────────────────

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

    // ── Derived: machine visual ───────────────────────────────────────────────

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

    // ── Derived: current selection ────────────────────────────────────────────

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

    const availableFeedersForMachine = React.useMemo(() => {
        const assignedFeederIds = new Set((machineSummary?.feeders || []).map((f) => f.id));
        return feeders.filter((f) => !assignedFeederIds.has(f.id));
    }, [feeders, machineSummary]);

    const availableProductionsForMachine = React.useMemo(() => {
        const currentMachineId = machineSummary?.id || machineConfigTarget?.id || null;
        return productions.filter((p) => p.machine_id !== currentMachineId);
    }, [machineConfigTarget?.id, machineSummary?.id, productions]);

    return {
        // Open state
        machineConfigDialogOpen,
        machineConfigTarget,
        // Summary
        machineSummary,
        setMachineSummary,
        machineSummaryLoading,
        machineSummaryProductions,
        machineSummaryProductionsById,
        machineConfigError,
        setMachineConfigError,
        // Plan
        machineProductionPlan,
        setMachineProductionPlan,
        machineProductionPlanLoading,
        machinePlanSlotMap,
        machinePlanAssignmentMap,
        machinePlanOrderedBomMap,
        machinePlanAssignmentSummaryMap,
        machineCommonAssignmentCount,
        machinePlanOverviewChips,
        // Selection
        selectedMachineProductionPlanId,
        setSelectedMachineProductionPlanId,
        selectedMachineBomRevisionId,
        setSelectedMachineBomRevisionId,
        selectedMachineBomAssignmentFilter,
        selectedMachineSlotPosition,
        setSelectedMachineSlotPosition,
        selectedFeederId,
        setSelectedFeederId,
        selectedProductionId,
        setSelectedProductionId,
        // Derived selection
        selectedMachineProduction,
        selectedMachineBomRevision,
        selectedMachineSlot,
        selectedMachineBomAssignmentSummary,
        // Visible assignments
        baseVisibleMachineAssignments,
        visibleMachineAssignments,
        visibleMachineAssignmentIndexes,
        visibleMachineAssignmentIndexSet,
        machineAssignmentDisplayMode,
        selectedMachineBomCommonAssignmentCount,
        selectedMachineBomInstallAssignmentCount,
        // Machine visual
        machineTopView,
        backSlotLayout,
        frontSlotLayout,
        // Available lists
        availableFeedersForMachine,
        availableProductionsForMachine,
        // Functions
        loadMachineSummary,
        loadMachineProductionPlan,
        closeMachineConfigDialog,
        openMachineConfigDialog,
        handleSelectMachineSlot,
        handleAssignFeederToMachine,
        handleRemoveFeederFromMachine,
        handleAssignProductionToMachine,
        handleDetachProductionFromMachine,
        handleMoveProductionBom,
        handleValidateMachineProductionPlan,
        handleRefreshMachineProductionPlan,
        handleToggleMachineBomRevision,
        handleChangeMachineBomAssignmentFilter,
    };
}
