import React from 'react';
import apiClient from '../api/client';
import { buildReferenceRevisionKey } from '../utils/bomWorkspace';
import { extractRequestError, parsePositiveInteger } from '../utils/machinePnp';
import { useMachineConfigSelectors } from './useMachineConfigSelectors';
import { useMachineConfigActions } from './useMachineConfigActions';
import { useMachineConfigHandlers } from './useMachineConfigHandlers';
import { useMachineConfigEffects } from './useMachineConfigEffects';

/**
 * Orchestre le dialogue de configuration machine : état (résumé machine, plan
 * d'implantation, sélections), synchronisation des quantités depuis la session
 * (verrou anti-boucle conservé ici), et assemblage des sous-hooks :
 *  - useMachineConfigActions  : loaders + contrôle du dialogue + handlers d'actions
 *  - useMachineConfigEffects   : effets de sélection/réinitialisation
 *  - useMachineConfigSelectors : dérivations (maps, assignations visibles, vue)
 *
 * @param {object} opts  - activeProduction, bomWorkspace (BomSessionContext) ;
 *   feeders, productions, setFeedback, setActionLoading, actionLoading,
 *   loadWorkspace (useWorkspaceData).
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
    // ── State ──────────────────────────────────────────────────────────────────
    const [machineConfigDialogOpen, setMachineConfigDialogOpen] = React.useState(false);
    const [machineConfigTarget, setMachineConfigTarget] = React.useState(null);
    const [machineSummary, setMachineSummary] = React.useState(null);
    const [machineSummaryLoading, setMachineSummaryLoading] = React.useState(false);
    const [machineConfigError, setMachineConfigError] = React.useState('');
    const [machineProductionPlan, setMachineProductionPlan] = React.useState(null);
    const [machineProductionPlanLoading, setMachineProductionPlanLoading] = React.useState(false);
    const [selectedMachineProductionPlanId, setSelectedMachineProductionPlanId] = React.useState('');
    const [selectedMachineBomRevisionId, setSelectedMachineBomRevisionId] = React.useState('');
    const [selectedMachineBomAssignmentFilter, setSelectedMachineBomAssignmentFilter] = React.useState('all');
    const [selectedMachineSlotPosition, setSelectedMachineSlotPosition] = React.useState(null);
    const [selectedFeederId, setSelectedFeederId] = React.useState('');
    const [selectedProductionId, setSelectedProductionId] = React.useState('');

    // ── Refs (garde de montage + jeton « dernière requête gagne » + idempotence) ─
    const syncingMachineProductionQuantitiesRef = React.useRef('');
    const mountedRef = React.useRef(true);
    const latestPlanRef = React.useRef(0);
    React.useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
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

    // ── Actions (loaders + contrôle dialogue + handlers) ─────────────────────
    const actions = useMachineConfigActions({
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
    });
    const { loadMachineSummary, loadMachineProductionPlan } = actions;

    const handlers = useMachineConfigHandlers({
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
    });

    // ── Auto-sync BOM quantities from session (verrou anti-boucle, gardé ici) ──
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

    // Ref stable vers la dernière version de la fonction de sync (verrou anti-boucle 1).
    const syncMachineProductionQuantitiesFnRef = React.useRef(syncMachineProductionQuantitiesFromSession);
    React.useEffect(() => {
        syncMachineProductionQuantitiesFnRef.current = syncMachineProductionQuantitiesFromSession;
    }, [syncMachineProductionQuantitiesFromSession]);

    // Signature de contenu des quantités de session (verrou anti-boucle 2).
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
        syncMachineProductionQuantitiesFnRef.current(targetProduction);
    }, [
        machineConfigDialogOpen,
        machineSummaryProductions,
        machineSummaryProductionsById,
        selectedMachineProductionPlanId,
        sessionQuantitySignature,
    ]);

    // ── Effets de sélection / réinitialisation ───────────────────────────────
    useMachineConfigEffects({
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
    });

    // ── Sélecteurs / dérivations ─────────────────────────────────────────────
    const selectors = useMachineConfigSelectors({
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
    });

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
        // Plan (état)
        machineProductionPlan,
        setMachineProductionPlan,
        machineProductionPlanLoading,
        // Selection (état)
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
        // Dérivations (maps, sélection, assignations visibles, vue, listes)
        ...selectors,
        // Loaders + contrôle dialogue
        ...actions,
        // Handlers d'actions
        ...handlers,
    };
}
