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
                        <MachineImplantationPanel config={config} />
                        <FeederMountPanel config={config} />
                    </Stack>
                )}
            </DialogContent>

            <DialogActions>
                <Button onClick={closeMachineConfigDialog}>Fermer</Button>
            </DialogActions>
        </Dialog>
    );
}

export default MachineConfigDialog;
