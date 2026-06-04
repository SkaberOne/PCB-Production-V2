import React from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    MenuItem,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { MachineAssignmentTable } from './MachinePnpTables';
import MachinePnpSlotStrip from './MachinePnpSlotStrip';
import { machineFrameSx, machineLaneSx } from '../../utils/machinePnp';

const PANEL_SX = { backgroundColor: '#18181b', border: '1px solid #27272a' };
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
 * Dialogue de configuration machine — plan d'implantation feeders.
 *
 * Assemble le hook useMachineConfig (passé via `config`) avec le slot-strip visuel
 * et la table d'affectation. Couvre : affectation/détachement de production,
 * réordonnancement de la séquence BOM, validation/dévalidation de l'ordre de
 * fabrication, calcul + visualisation de l'implantation feeders, affectation et
 * retrait de types de feeders sur la machine.
 */
function MachineConfigDialog({ config }) {
    const {
        machineConfigDialogOpen,
        machineConfigTarget,
        machineSummary,
        machineSummaryLoading,
        machineSummaryProductions,
        machineConfigError,
        setMachineConfigError,
        machineProductionPlan,
        machineProductionPlanLoading,
        machinePlanOverviewChips,
        selectedMachineProductionPlanId,
        setSelectedMachineProductionPlanId,
        selectedMachineProduction,
        selectedMachineBomRevision,
        selectedMachineSlot,
        visibleMachineAssignments,
        selectedMachineSlotPosition,
        machineTopView,
        frontSlotLayout,
        backSlotLayout,
        availableFeedersForMachine,
        availableProductionsForMachine,
        selectedFeederId,
        setSelectedFeederId,
        selectedProductionId,
        setSelectedProductionId,
        actionLoading,
        closeMachineConfigDialog,
        handleSelectMachineSlot,
        handleAssignFeederToMachine,
        handleRemoveFeederFromMachine,
        handleAssignProductionToMachine,
        handleDetachProductionFromMachine,
        handleMoveProductionBom,
        handleValidateMachineProductionPlan,
        handleRefreshMachineProductionPlan,
    } = config;

    const machineName = machineSummary?.name || machineConfigTarget?.name || 'Machine';
    const assignedFeeders = machineSummary?.feeders || [];
    const selectedProductionValidated = Boolean(selectedMachineProduction?.manufacturing_order_validated_at);
    const busy = Boolean(actionLoading);

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

                        {/* ── Affecter une production ───────────────────────────── */}
                        <Box sx={{ ...PANEL_SX, borderRadius: 2, p: 2 }}>
                            <Typography sx={{ fontSize: '0.7rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}>
                                Affecter une production à cette machine
                            </Typography>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <TextField
                                    select
                                    size="small"
                                    label="Production disponible"
                                    value={selectedProductionId}
                                    onChange={(event) => setSelectedProductionId(event.target.value)}
                                    sx={{ minWidth: 280 }}
                                    disabled={!availableProductionsForMachine.length}
                                >
                                    <MenuItem value=""><em>Sélectionner…</em></MenuItem>
                                    {availableProductionsForMachine.map((production) => (
                                        <MenuItem key={production.id} value={`${production.id}`}>
                                            {production.name}
                                        </MenuItem>
                                    ))}
                                </TextField>
                                <Button
                                    variant="contained"
                                    startIcon={<AddRoundedIcon />}
                                    onClick={handleAssignProductionToMachine}
                                    disabled={busy || !selectedProductionId}
                                    sx={{ backgroundColor: '#059669', '&:hover': { backgroundColor: '#047857' } }}
                                >
                                    Affecter
                                </Button>
                            </Stack>
                        </Box>

                        {/* ── Productions affectées ─────────────────────────────── */}
                        {machineSummaryProductions.length === 0 ? (
                            <Alert severity="info" variant="outlined">
                                Aucune production affectée à cette machine pour le moment.
                            </Alert>
                        ) : (
                            <Box sx={{ ...PANEL_SX, borderRadius: 2, p: 2 }}>
                                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                                    <TextField
                                        select
                                        size="small"
                                        label="Production"
                                        value={selectedMachineProductionPlanId || (machineSummaryProductions[0] ? `${machineSummaryProductions[0].id}` : '')}
                                        onChange={(event) => setSelectedMachineProductionPlanId(event.target.value)}
                                        sx={{ minWidth: 260 }}
                                    >
                                        {machineSummaryProductions.map((production) => (
                                            <MenuItem key={production.id} value={`${production.id}`}>
                                                {production.name}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                    {selectedProductionValidated ? (
                                        <Chip
                                            icon={<CheckCircleRoundedIcon sx={{ fontSize: '0.9rem !important' }} />}
                                            label="Ordre validé"
                                            size="small"
                                            sx={{ backgroundColor: 'rgba(5,150,105,0.12)', color: '#10b981', border: '1px solid rgba(5,150,105,0.25)' }}
                                        />
                                    ) : (
                                        <Chip label="Ordre non validé" size="small" sx={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }} />
                                    )}
                                    {selectedMachineProduction ? (
                                        <>
                                            <Button
                                                variant="contained"
                                                size="small"
                                                startIcon={<CheckCircleRoundedIcon />}
                                                onClick={() => handleValidateMachineProductionPlan(selectedMachineProduction)}
                                                disabled={busy || !selectedMachineProduction.bom_revisions?.length}
                                                sx={{ backgroundColor: '#059669', '&:hover': { backgroundColor: '#047857' } }}
                                            >
                                                Valider l'ordre
                                            </Button>
                                            {selectedProductionValidated ? (
                                                <Tooltip title="Recalculer l'implantation">
                                                    <span>
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleRefreshMachineProductionPlan(selectedMachineProduction)}
                                                            disabled={busy}
                                                            sx={{ color: '#a1a1aa' }}
                                                        >
                                                            <RefreshRoundedIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            ) : null}
                                            <Tooltip title="Détacher cette production de la machine">
                                                <span>
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleDetachProductionFromMachine(selectedMachineProduction.id)}
                                                        disabled={busy}
                                                        sx={{ color: '#71717a', '&:hover': { color: '#ef4444' } }}
                                                    >
                                                        <LinkOffRoundedIcon fontSize="small" />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                        </>
                                    ) : null}
                                </Stack>

                                {/* Séquence de fabrication réordonnable */}
                                {selectedMachineProduction?.bom_revisions?.length ? (
                                    <TableContainer>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow sx={{ '& th': { borderColor: '#27272a', color: '#71717a', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', py: 0.5 } }}>
                                                    <TableCell sx={{ width: 48 }}>Ordre</TableCell>
                                                    <TableCell>Référence</TableCell>
                                                    <TableCell>Révision</TableCell>
                                                    <TableCell align="right">Qté</TableCell>
                                                    <TableCell sx={{ width: 90 }} align="right">Déplacer</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {selectedMachineProduction.bom_revisions.map((bom, index) => (
                                                    <TableRow key={bom.bom_revision_id} sx={{ '& td': { borderColor: '#27272a', py: 0.5 } }}>
                                                        <TableCell sx={{ color: '#52525b', fontSize: '0.75rem' }}>{bom.sequence_order ?? index + 1}</TableCell>
                                                        <TableCell sx={{ color: '#f4f4f5', fontSize: '0.8rem' }}>{bom.reference}</TableCell>
                                                        <TableCell sx={{ color: '#a1a1aa', fontSize: '0.75rem' }}>{bom.revision}</TableCell>
                                                        <TableCell align="right" sx={{ color: '#a1a1aa', fontSize: '0.75rem' }}>{bom.quantity_to_produce ?? 1}</TableCell>
                                                        <TableCell align="right">
                                                            <IconButton
                                                                size="small"
                                                                aria-label="Monter"
                                                                disabled={busy || index === 0}
                                                                onClick={() => handleMoveProductionBom(selectedMachineProduction, bom.bom_revision_id, 'up')}
                                                                sx={{ color: '#52525b' }}
                                                            >
                                                                <ArrowUpwardRoundedIcon sx={{ fontSize: 15 }} />
                                                            </IconButton>
                                                            <IconButton
                                                                size="small"
                                                                aria-label="Descendre"
                                                                disabled={busy || index === selectedMachineProduction.bom_revisions.length - 1}
                                                                onClick={() => handleMoveProductionBom(selectedMachineProduction, bom.bom_revision_id, 'down')}
                                                                sx={{ color: '#52525b' }}
                                                            >
                                                                <ArrowDownwardRoundedIcon sx={{ fontSize: 15 }} />
                                                            </IconButton>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                ) : (
                                    <Typography sx={{ fontSize: '0.8rem', color: '#52525b' }}>
                                        Aucune BOM dans cette production.
                                    </Typography>
                                )}
                            </Box>
                        )}

                        {/* ── Plan d'implantation ───────────────────────────────── */}
                        {machineProductionPlanLoading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                <CircularProgress size={24} sx={{ color: '#059669' }} />
                            </Box>
                        ) : machineProductionPlan ? (
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
                        ) : selectedMachineProduction ? (
                            <Alert severity="info" variant="outlined">
                                Valide l'ordre de fabrication pour calculer et afficher l'implantation feeders.
                            </Alert>
                        ) : null}

                        {/* ── Types de feeders de la machine ────────────────────── */}
                        <Box sx={{ ...PANEL_SX, borderRadius: 2, p: 2 }}>
                            <Typography sx={{ fontSize: '0.7rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}>
                                Types de feeders montés ({assignedFeeders.length})
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                                {assignedFeeders.length === 0 ? (
                                    <Typography sx={{ fontSize: '0.8rem', color: '#52525b' }}>Aucun type de feeder monté.</Typography>
                                ) : assignedFeeders.map((feeder) => (
                                    <Chip
                                        key={feeder.id}
                                        label={`${feeder.size_mm} mm`}
                                        onDelete={() => handleRemoveFeederFromMachine(feeder.id)}
                                        deleteIcon={<DeleteOutlineRoundedIcon />}
                                        size="small"
                                        sx={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#d4d4d8', border: '1px solid #27272a' }}
                                    />
                                ))}
                            </Stack>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <TextField
                                    select
                                    size="small"
                                    label="Ajouter un type de feeder"
                                    value={selectedFeederId}
                                    onChange={(event) => setSelectedFeederId(event.target.value)}
                                    sx={{ minWidth: 240 }}
                                    disabled={!availableFeedersForMachine.length}
                                >
                                    <MenuItem value=""><em>Sélectionner…</em></MenuItem>
                                    {availableFeedersForMachine.map((feeder) => (
                                        <MenuItem key={feeder.id} value={`${feeder.id}`}>
                                            {feeder.size_mm} mm{feeder.description ? ` · ${feeder.description}` : ''}
                                        </MenuItem>
                                    ))}
                                </TextField>
                                <Button
                                    variant="outlined"
                                    startIcon={<AddRoundedIcon />}
                                    onClick={handleAssignFeederToMachine}
                                    disabled={busy || !selectedFeederId}
                                >
                                    Monter
                                </Button>
                            </Stack>
                        </Box>
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
