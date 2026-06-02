import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { getMachineAssignmentPalette, machineSlotCellSx } from '../../utils/machinePnp';

function MachinePnpSlotStrip({
    slots,
    layout,
    laneColor,
    selectedSlotPosition,
    machinePlanSlotMap,
    machinePlanAssignmentMap,
    visibleMachineAssignmentIndexSet,
    visibleMachineAssignmentIndexes,
    machineProductionPlan,
    onSelectSlot,
}) {
    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))`,
                gap: layout.gap,
                width: '100%',
            }}
        >
            {slots.map((slot) => {
                const slotPlanEntry = machinePlanSlotMap.get(slot) || null;
                const assignment = slotPlanEntry?.assignment_index
                    ? machinePlanAssignmentMap.get(slotPlanEntry.assignment_index) || null
                    : null;
                const isSelected = selectedSlotPosition === slot;
                const isAssigned = Boolean(assignment);
                const assignmentPalette = getMachineAssignmentPalette(assignment);
                const isVisibleInCurrentList = assignment
                    ? visibleMachineAssignmentIndexSet.has(assignment.assignment_index)
                    : true;
                const hasFocusedAssignmentSubset = isAssigned
                    && machineProductionPlan?.slot_assignments?.length
                    && visibleMachineAssignmentIndexes.length
                    && visibleMachineAssignmentIndexes.length < machineProductionPlan.slot_assignments.length;
                const slotTitle = assignment
                    ? `${assignment.component_label}${assignment.feeder_type ? ` · ${assignment.feeder_type}` : (assignment.feeder_size_mm ? ` · ${assignment.feeder_size_mm} mm` : '')}`
                    : `Emplacement ${slot}`;
                const previewSource = assignment
                    ? [assignment.component_label, assignment.component_reference]
                        .map((value) => String(value || '').trim())
                        .find((value) => value && !value.startsWith('LIB-'))
                    : '';
                const previewLabel = assignment
                    ? String(previewSource || '')
                        .slice(0, layout.fontSize === '0.43rem' ? 4 : 8)
                    : '';

                return (
                    <Tooltip key={`${laneColor}-${slot}`} title={slotTitle}>
                        <Box
                            onClick={() => onSelectSlot(slot)}
                            sx={{
                                ...machineSlotCellSx,
                                minWidth: 0,
                                height: layout.height,
                                fontSize: layout.fontSize,
                                borderRadius: layout.borderRadius,
                                cursor: 'pointer',
                                borderColor: isSelected
                                    ? '#facc15'
                                    : isAssigned
                                        ? assignmentPalette.borderColor
                                        : laneColor,
                                background: isAssigned
                                    ? assignmentPalette.slotBackground
                                    : undefined,
                                boxShadow: isSelected
                                    ? '0 0 0 1px rgba(250,204,21,0.35)'
                                    : isAssigned
                                        ? `0 0 0 1px ${assignmentPalette.accentGlow}`
                                        : 'none',
                                flexDirection: 'column',
                                gap: 0.1,
                                px: 0.15,
                                overflow: 'hidden',
                                opacity: hasFocusedAssignmentSubset && !isVisibleInCurrentList ? 0.35 : 1,
                            }}
                        >
                            <Typography sx={{ fontSize: layout.fontSize, lineHeight: 1, fontWeight: 700, color: '#f4f4f5' }}>
                                {slot}
                            </Typography>
                            {isAssigned && layout.height >= 20 ? (
                                <Typography
                                    sx={{
                                        fontSize: '0.45rem',
                                        lineHeight: 1,
                                        color: assignmentPalette.labelColor,
                                        whiteSpace: 'nowrap',
                                        textOverflow: 'ellipsis',
                                        overflow: 'hidden',
                                        maxWidth: '100%',
                                    }}
                                >
                                    {previewLabel || 'OK'}
                                </Typography>
                            ) : null}
                        </Box>
                    </Tooltip>
                );
            })}
        </Box>
    );
}

export default MachinePnpSlotStrip;
