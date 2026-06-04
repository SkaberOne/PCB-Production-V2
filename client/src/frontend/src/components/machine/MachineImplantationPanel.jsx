import React from 'react';
import {
    Alert,
    Box,
    Chip,
    CircularProgress,
    Divider,
    Stack,
    TableContainer,
    Typography,
} from '@mui/material';
import { MachineAssignmentTable } from './MachinePnpTables';
import MachinePnpSlotStrip from './MachinePnpSlotStrip';
import { machineFrameSx, machineLaneSx } from '../../utils/machinePnp';

const FRONT_LANE_COLOR = '#38bdf8';
const BACK_LANE_COLOR = '#34d399';

function MachineLane({ title, slots, layout, laneColor, config }) {
    if (!slots.length) return null;
    return (
        <Box sx={machineLaneSx}>
            <Typography sx={{ fontSize: '0.65rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.75 }}>
                {title} · {slots.length} positions
            </Typography>
            <MachinePnpSlotStrip
                slots={slots}
                layout={layout}
                laneColor={laneColor}
                selectedSlotPosition={config.selectedMachineSlotPosition}
                machinePlanSlotMap={config.machinePlanSlotMap}
                machinePlanAssignmentMap={config.machinePlanAssignmentMap}
                visibleMachineAssignmentIndexSet={config.visibleMachineAssignmentIndexSet}
                visibleMachineAssignmentIndexes={config.visibleMachineAssignmentIndexes}
                machineProductionPlan={config.machineProductionPlan}
                onSelectSlot={config.handleSelectMachineSlot}
            />
        </Box>
    );
}

/**
 * Panneau « plan d'implantation » du dialogue de configuration machine :
 * synthèse, filtre par révision BOM, slot-strip avant/arrière, table d'affectation
 * et détail du slot sélectionné.
 */
function MachineImplantationPanel({ config }) {
    const {
        machineProductionPlanLoading,
        machineProductionPlan,
        machinePlanOverviewChips,
        selectedMachineBomRevisionId,
        selectedMachineBomRevision,
        selectedMachineBomAssignmentFilter,
        selectedMachineBomCommonAssignmentCount,
        selectedMachineBomInstallAssignmentCount,
        handleToggleMachineBomRevision,
        handleChangeMachineBomAssignmentFilter,
        machineTopView,
        frontSlotLayout,
        backSlotLayout,
        visibleMachineAssignments,
        selectedMachineSlotPosition,
        selectedMachineSlot,
        selectedMachineProduction,
        handleSelectMachineSlot,
    } = config;

    if (machineProductionPlanLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} sx={{ color: '#059669' }} />
            </Box>
        );
    }

    if (!machineProductionPlan) {
        return selectedMachineProduction ? (
            <Alert severity="info" variant="outlined">
                Valide l'ordre de fabrication pour calculer et afficher l'implantation feeders.
            </Alert>
        ) : null;
    }

    return (
        <Box sx={machineFrameSx}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                {machinePlanOverviewChips.map((chip) => (
                    <Chip
                        key={chip.label}
                        label={chip.label}
                        size="small"
                        sx={{ backgroundColor: 'rgba(255,255,255,0.04)', color: chip.color, border: '1px solid #27272a', fontSize: '0.68rem' }}
                    />
                ))}
            </Stack>

            {machineProductionPlan.ordered_boms?.length ? (
                <Box sx={{ mb: 1.5 }}>
                    <Typography sx={{ fontSize: '0.65rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.75 }}>
                        Filtrer l'implantation par BOM
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {machineProductionPlan.ordered_boms.map((bom) => {
                            const isActive = `${bom.bom_revision_id}` === selectedMachineBomRevisionId;
                            const label = bom.reference
                                ? `${bom.reference}${bom.revision ? ` · ${bom.revision}` : ''}`
                                : `BOM ${bom.bom_revision_id}`;
                            return (
                                <Chip
                                    key={bom.bom_revision_id}
                                    label={label}
                                    size="small"
                                    onClick={() => handleToggleMachineBomRevision(bom.bom_revision_id, true)}
                                    variant={isActive ? 'filled' : 'outlined'}
                                    color={isActive ? 'primary' : 'default'}
                                />
                            );
                        })}
                    </Stack>
                    {selectedMachineBomRevision ? (
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                            {[
                                { key: 'all', label: 'Tous' },
                                { key: 'common', label: `Communs (${selectedMachineBomCommonAssignmentCount})` },
                                { key: 'install', label: `Implantation (${selectedMachineBomInstallAssignmentCount})` },
                            ].map((option) => (
                                <Chip
                                    key={option.key}
                                    label={option.label}
                                    size="small"
                                    onClick={() => handleChangeMachineBomAssignmentFilter(option.key)}
                                    variant={selectedMachineBomAssignmentFilter === option.key ? 'filled' : 'outlined'}
                                    color={selectedMachineBomAssignmentFilter === option.key ? 'primary' : 'default'}
                                />
                            ))}
                        </Stack>
                    ) : null}
                </Box>
            ) : null}

            <Stack spacing={1.5}>
                <MachineLane title="Rampe avant" slots={machineTopView.frontSlots} layout={frontSlotLayout} laneColor={FRONT_LANE_COLOR} config={config} />
                <MachineLane title="Rampe arrière" slots={machineTopView.backSlots} layout={backSlotLayout} laneColor={BACK_LANE_COLOR} config={config} />
            </Stack>

            <Divider sx={{ borderColor: '#27272a', my: 2 }} />

            <TableContainer sx={{ maxHeight: 360 }}>
                <MachineAssignmentTable
                    assignments={visibleMachineAssignments}
                    selectedSlot={selectedMachineSlotPosition}
                    onSelectSlot={handleSelectMachineSlot}
                    selectedMachineBomPlannedBoardQuantity={null}
                    selectedMachineBomRevision={selectedMachineBomRevision}
                />
            </TableContainer>

            {selectedMachineSlot?.assignment ? (
                <Alert severity="info" variant="outlined" sx={{ mt: 1.5 }}>
                    Slot {selectedMachineSlot.assignment.slot_start}
                    {selectedMachineSlot.assignment.slot_end !== selectedMachineSlot.assignment.slot_start ? `-${selectedMachineSlot.assignment.slot_end}` : ''}
                    {' · '}{selectedMachineSlot.assignment.component_label}
                    {selectedMachineSlot.assignment.feeder_type ? ` · ${selectedMachineSlot.assignment.feeder_type}` : ''}
                </Alert>
            ) : null}
        </Box>
    );
}

export default MachineImplantationPanel;
