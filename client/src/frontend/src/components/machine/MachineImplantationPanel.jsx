import React from 'react';
import {
    Alert,
    Box,
    Chip,
    CircularProgress,
    Divider,
    Stack,
    TableContainer,
    Tooltip,
    Typography,
} from '@mui/material';
import { MachineAssignmentTable } from './MachinePnpTables';
import MachinePnpSlotStrip from './MachinePnpSlotStrip';
import {
    PLACEMENT_GROUP_LEGEND,
    getPlacementGroupPalette,
    machineFrameSx,
    machineLaneSx,
    slotEmptyPalette,
} from '../../utils/machinePnp';

function MachineLane({ title, slots, layout, config, onEditComponent }) {
    if (!slots.length) return null;
    return (
        <Box sx={machineLaneSx}>
            <Typography sx={{ fontSize: '0.62rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.6 }}>
                {title} · {slots.length} positions
            </Typography>
            <MachinePnpSlotStrip
                slots={slots}
                layout={layout}
                selectedSlotPosition={config.selectedMachineSlotPosition}
                machinePlanSlotMap={config.machinePlanSlotMap}
                machinePlanAssignmentMap={config.machinePlanAssignmentMap}
                visibleMachineAssignmentIndexSet={config.visibleMachineAssignmentIndexSet}
                visibleMachineAssignmentIndexes={config.visibleMachineAssignmentIndexes}
                machineProductionPlan={config.machineProductionPlan}
                onSelectSlot={config.handleSelectMachineSlot}
                onEditComponent={onEditComponent}
            />
        </Box>
    );
}

/**
 * Tête PnP : rangée de N nozzles (carrés côte à côte) au centre de la machine,
 * au-dessus du PCB. Le nombre vient de la config machine. Affichage simple ;
 * la config par position et la validation de portée arriveront via le menu nozzles.
 * Masquée si aucun nozzle n'est configuré.
 */
function NozzleHead({ count, layout = [], redPositions = [] }) {
    const nozzleCount = Math.max(0, Number(count) || 0);
    if (!nozzleCount) return null;

    const redSet = new Set((redPositions || []).map(Number));

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.4 }}>
            <Typography sx={{ fontSize: '0.55rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#71717a', fontWeight: 700 }}>
                Tête · {nozzleCount} nozzle{nozzleCount > 1 ? 's' : ''}
                {redSet.size ? ` · ${redSet.size} hors portée` : ''}
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="center" useFlexGap>
                {Array.from({ length: nozzleCount }, (_value, index) => index + 1).map((position) => {
                    const nozzleType = layout && layout[position - 1] ? layout[position - 1] : null;
                    const isRed = redSet.has(position);
                    return (
                        <Tooltip
                            key={`nozzle-${position}`}
                            title={`Position ${position}${nozzleType ? ` · type ${nozzleType}` : ''}${isRed ? ' · hors portée d’un feeder à servir' : ''}`}
                            arrow
                        >
                            <Box
                                sx={{
                                    minWidth: 26,
                                    height: 24,
                                    px: 0.4,
                                    borderRadius: 1,
                                    border: `1px solid ${isRed ? '#ef4444' : '#6d28d9'}`,
                                    backgroundColor: isRed ? 'rgba(239,68,68,0.18)' : 'rgba(167,139,250,0.18)',
                                    color: isRed ? '#fca5a5' : '#ddd6fe',
                                    boxShadow: isRed ? '0 0 0 2px rgba(239,68,68,0.35)' : 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.58rem',
                                    fontWeight: 700,
                                }}
                            >
                                {nozzleType ?? position}
                            </Box>
                        </Tooltip>
                    );
                })}
            </Stack>
        </Box>
    );
}

/** Convoyeur PCB central — la carte défile entre les deux rampes de feeders. */
function ConveyorBand() {
    return (
        <Box
            sx={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
                py: 0.75,
                borderRadius: 1.5,
                border: '1px dashed #2a2a31',
                backgroundColor: 'rgba(255,255,255,0.015)',
            }}
        >
            <Typography sx={{ position: 'absolute', left: 8, top: 4, fontSize: '0.55rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#52525b' }}>
                Convoyeur PCB
            </Typography>
            <Typography sx={{ color: '#52525b', fontSize: '0.9rem' }}>→</Typography>
            <Box sx={{ px: 1.5, py: 0.4, borderRadius: 1, border: '1px solid #3b6d11', backgroundColor: 'rgba(99,153,34,0.18)', color: '#bbf7d0', fontSize: '0.6rem', fontWeight: 600 }}>
                Carte en cours
            </Box>
            <Typography sx={{ color: '#52525b', fontSize: '0.9rem' }}>→</Typography>
        </Box>
    );
}

/** Légende : couleur des slots par groupe de placement (fixe / mobile). */
function FeederSizeLegend() {
    const items = PLACEMENT_GROUP_LEGEND.map((group) => {
        const palette = getPlacementGroupPalette(group.key);
        return { key: group.key, label: group.label, borderColor: palette.borderColor, background: palette.slotBackground };
    });
    items.push({ key: 'libre', label: 'Libre', borderColor: slotEmptyPalette.borderColor, background: 'transparent' });

    return (
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            {items.map((item) => (
                <Stack key={item.key} direction="row" spacing={0.5} alignItems="center">
                    <Box sx={{ width: 12, height: 12, borderRadius: 0.5, border: `1px solid ${item.borderColor}`, backgroundColor: item.background }} />
                    <Typography sx={{ fontSize: '0.65rem', color: '#a1a1aa' }}>{item.label}</Typography>
                </Stack>
            ))}
        </Stack>
    );
}

/**
 * Panneau « plan d'implantation » : synthèse, filtre par révision BOM, vue machine
 * vue de dessus (rampe arrière → convoyeur PCB → rampe avant) colorée par groupe
 * de placement (fixe / mobile), table d'affectation et détail du slot sélectionné.
 */
function MachineImplantationPanel({ config, onEditComponent }) {
    const {
        machineProductionPlanLoading,
        machineProductionPlan,
        machinePlanOverviewChips,
        selectedMachineBomRevision,
        machineTopView,
        frontSlotLayout,
        backSlotLayout,
        visibleMachineAssignments,
        selectedMachineSlotPosition,
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

            {/* Sélection de la face : via le tableau de séquence de production (au-dessus). */}

            {/* Vue machine vue de dessus : rampe arrière → convoyeur PCB → rampe avant */}
            <Stack spacing={0.75}>
                <MachineLane title="Rampe arrière" slots={machineTopView.backSlots} layout={backSlotLayout} config={config} onEditComponent={onEditComponent} />
                <NozzleHead
                    count={machineProductionPlan?.num_nozzles || config.machineNumNozzles}
                    layout={machineProductionPlan?.nozzle_layout}
                    redPositions={machineProductionPlan?.nozzle_red_positions}
                />
                <ConveyorBand />
                <MachineLane title="Rampe avant" slots={machineTopView.frontSlots} layout={frontSlotLayout} config={config} onEditComponent={onEditComponent} />
            </Stack>
            <FeederSizeLegend />

            <Divider sx={{ borderColor: '#27272a', my: 2 }} />

            <TableContainer sx={{ maxHeight: 360 }}>
                <MachineAssignmentTable
                    assignments={visibleMachineAssignments}
                    productionId={config.machineProductionPlan?.production_id ?? null}
                    selectedSlot={selectedMachineSlotPosition}
                    onSelectSlot={handleSelectMachineSlot}
                    onEditComponent={onEditComponent}
                    selectedMachineBomPlannedBoardQuantity={null}
                    selectedMachineBomRevision={selectedMachineBomRevision}
                />
            </TableContainer>

        </Box>
    );
}

export default MachineImplantationPanel;
