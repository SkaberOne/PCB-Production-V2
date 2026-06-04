import React from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { getFeederSizePalette, machineSlotCellSx, slotEmptyPalette } from '../../utils/machinePnp';

// Au-delà de ce nombre de slots par rampe, la cellule est trop étroite pour un
// libellé : on n'affiche que le numéro + la couleur (taille feeder), le reste au survol.
const INLINE_REF_MAX_SLOTS = 24;

/**
 * Slot-strip d'une rampe de feeders (vue machine vue de dessus).
 * La couleur encode la TAILLE de feeder (8/12/16 mm) ; le numéro de position est
 * toujours visible ; la référence apparaît en clair sur les petites machines et
 * au survol partout. Le détail texte complet vit dans la table d'affectation.
 */
function MachinePnpSlotStrip({
    slots,
    layout,
    selectedSlotPosition,
    machinePlanSlotMap,
    machinePlanAssignmentMap,
    visibleMachineAssignmentIndexSet,
    visibleMachineAssignmentIndexes,
    machineProductionPlan,
    onSelectSlot,
}) {
    const showInlineRef = slots.length <= INLINE_REF_MAX_SLOTS;

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
                // Un gros feeder (>8 mm) occupe 2 positions : on n'affiche qu'UNE cellule
                // d'ancrage (à sa position de départ), élargie sur sa largeur réelle. Les
                // positions de continuation ne sont pas rendues (absorbées par l'ancrage).
                const slotWidth = assignment
                    ? Math.max(1, (Number(assignment.slot_end) || slot) - (Number(assignment.slot_start) || slot) + 1)
                    : 1;
                if (assignment && Number(assignment.slot_start) !== slot) {
                    return null;
                }
                const isAssigned = Boolean(assignment);
                const isSelected = selectedSlotPosition === slot;
                const palette = assignment ? getFeederSizePalette(assignment.feeder_size_mm) : slotEmptyPalette;

                const isVisibleInCurrentList = assignment
                    ? visibleMachineAssignmentIndexSet.has(assignment.assignment_index)
                    : true;
                const hasFocusedAssignmentSubset = isAssigned
                    && machineProductionPlan?.slot_assignments?.length
                    && visibleMachineAssignmentIndexes.length
                    && visibleMachineAssignmentIndexes.length < machineProductionPlan.slot_assignments.length;

                const feederLabel = assignment
                    ? (assignment.feeder_type || (assignment.feeder_size_mm ? `${assignment.feeder_size_mm} mm` : '—'))
                    : '';
                const refSource = assignment
                    ? [assignment.component_label, assignment.component_reference]
                        .map((value) => String(value || '').trim())
                        .find((value) => value && !value.startsWith('LIB-'))
                    : '';
                const slotTitle = assignment
                    ? `Slot ${slot} · ${assignment.component_label || refSource || '—'}`
                        + `${assignment.component_reference ? ` (${assignment.component_reference})` : ''}`
                        + `${feederLabel ? ` · feeder ${feederLabel}` : ''}`
                    : `Slot ${slot} · libre`;
                const refPreview = (showInlineRef && isAssigned)
                    ? String(refSource || '').slice(0, layout.fontSize === '0.43rem' ? 4 : 8)
                    : '';

                return (
                    <Tooltip key={`slot-${slot}`} title={slotTitle} arrow>
                        <Box
                            onClick={() => onSelectSlot(slot)}
                            role="button"
                            tabIndex={0}
                            aria-label={slotTitle}
                            aria-pressed={isSelected}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectSlot(slot); } }}
                            sx={{
                                ...machineSlotCellSx,
                                minWidth: 0,
                                gridColumn: slotWidth > 1 ? `span ${slotWidth}` : undefined,
                                height: layout.height,
                                fontSize: layout.fontSize,
                                borderRadius: layout.borderRadius,
                                cursor: 'pointer',
                                borderColor: isSelected ? '#facc15' : palette.borderColor,
                                background: isAssigned ? palette.slotBackground : undefined,
                                boxShadow: isSelected ? '0 0 0 2px rgba(250,204,21,0.45)' : 'none',
                                flexDirection: 'column',
                                gap: 0.1,
                                px: 0.15,
                                overflow: 'hidden',
                                opacity: hasFocusedAssignmentSubset && !isVisibleInCurrentList ? 0.3 : 1,
                                transition: 'opacity 0.12s ease',
                            }}
                        >
                            <Typography sx={{ fontSize: layout.fontSize, lineHeight: 1, fontWeight: 700, color: isAssigned ? palette.labelColor : '#52525b' }}>
                                {slot}
                            </Typography>
                            {refPreview ? (
                                <Typography
                                    sx={{
                                        fontSize: '0.45rem',
                                        lineHeight: 1,
                                        color: palette.labelColor,
                                        whiteSpace: 'nowrap',
                                        textOverflow: 'ellipsis',
                                        overflow: 'hidden',
                                        maxWidth: '100%',
                                    }}
                                >
                                    {refPreview}
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
