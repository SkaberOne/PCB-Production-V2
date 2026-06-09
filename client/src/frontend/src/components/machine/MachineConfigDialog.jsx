import React from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    Typography,
} from '@mui/material';
import { ProductionAssignPanel, ProductionSequencePanel, FeederMountPanel } from './MachineConfigPanels';
import MachineImplantationPanel from './MachineImplantationPanel';
import ManualPlacementPanel from './ManualPlacementPanel';
import ComponentQuickEditPanel from './ComponentQuickEditPanel';

/**
 * Dialogue de configuration machine — plan d'implantation feeders.
 *
 * Coquille d'orchestration : consomme le hook useMachineConfig (via `config`) et
 * assemble les panneaux (affectation production, séquence, implantation, feeders).
 * Couvre affectation/détachement, réordonnancement séquence, validation/dévalidation
 * d'OF, calcul + visualisation de l'implantation, montage/retrait de feeders.
 */
function MachineConfigDialog({ config }) {
    const {
        machineConfigDialogOpen,
        machineConfigTarget,
        machineSummary,
        machineSummaryLoading,
        machineConfigError,
        setMachineConfigError,
        closeMachineConfigDialog,
    } = config;

    const machineName = machineSummary?.name || machineConfigTarget?.name || 'Machine';

    // Édition rapide d'un composant (depuis une ligne du plan ou la section « à compléter »).
    const [editComponentId, setEditComponentId] = React.useState(null);
    // Slot épinglé courant du composant en cours d'édition (pour préremplir le champ).
    const editAssignment = (config.machineProductionPlan?.slot_assignments || [])
        .find((a) => a.component_id === editComponentId);
    const editPinnedSlot = editAssignment?.is_pinned ? editAssignment.pinned_slot : null;
    // Composant actuellement forcé en pose à la main ?
    const editForcedManual = (config.machineProductionPlan?.manual_placement_components || [])
        .some((m) => m.component_id === editComponentId && m.forced_manual);
    const handleComponentSaved = React.useCallback(async () => {
        const plan = config.machineProductionPlan;
        if (plan && typeof config.loadMachineProductionPlan === 'function') {
            await config.loadMachineProductionPlan(
                plan.machine_id,
                plan.production_id,
                config.selectedMachineBomRevisionId || null,
            );
        }
    }, [config]);

    return (
        <Dialog open={machineConfigDialogOpen} onClose={closeMachineConfigDialog} maxWidth="lg" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <span>Configuration · {machineName}</span>
                {machineSummary ? (
                    <Typography component="span" sx={{ fontSize: '0.8rem', color: '#71717a' }}>
                        {machineSummary.num_positions} positions · {machineSummary.assigned_productions ?? 0} production(s)
                    </Typography>
                ) : null}
            </DialogTitle>

            <DialogContent dividers>
                {machineConfigError ? (
                    <Alert severity="error" onClose={() => setMachineConfigError('')} sx={{ mb: 2 }}>
                        {machineConfigError}
                    </Alert>
                ) : null}

                {machineSummaryLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                        <CircularProgress size={28} sx={{ color: '#059669' }} />
                    </Box>
                ) : (
                    <Stack spacing={2.5}>
                        <ProductionAssignPanel config={config} />
                        <ProductionSequencePanel config={config} />
                        <MachineImplantationPanel config={config} onEditComponent={setEditComponentId} />
                        <ManualPlacementPanel config={config} onEditComponent={setEditComponentId} />
                        <FeederMountPanel config={config} />
                    </Stack>
                )}
            </DialogContent>

            <DialogActions>
                <Button onClick={closeMachineConfigDialog}>Fermer</Button>
            </DialogActions>

            <ComponentQuickEditPanel
                open={editComponentId != null}
                componentId={editComponentId}
                onClose={() => setEditComponentId(null)}
                onSaved={handleComponentSaved}
                machineId={config.machineProductionPlan?.machine_id ?? null}
                productionId={config.machineProductionPlan?.production_id ?? null}
                pinnedSlot={editPinnedSlot}
                forcedManual={editForcedManual}
                onPlanUpdated={config.setMachineProductionPlan}
            />
        </Dialog>
    );
}

export default MachineConfigDialog;
