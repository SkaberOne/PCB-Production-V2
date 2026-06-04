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

const PANEL_SX = { backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 2, p: 2 };
const LABEL_SX = { fontSize: '0.7rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 };

/** Affecter une production disponible à la machine. */
export function ProductionAssignPanel({ config }) {
    const {
        selectedProductionId,
        setSelectedProductionId,
        availableProductionsForMachine,
        handleAssignProductionToMachine,
        actionLoading,
    } = config;
    const busy = Boolean(actionLoading);

    return (
        <Box sx={PANEL_SX}>
            <Typography sx={LABEL_SX}>Affecter une production à cette machine</Typography>
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
                        <MenuItem key={production.id} value={`${production.id}`}>{production.name}</MenuItem>
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
    );
}

/** Production sélectionnée : statut, validation, détachement, séquence réordonnable. */
export function ProductionSequencePanel({ config }) {
    const {
        machineSummaryProductions,
        selectedMachineProductionPlanId,
        setSelectedMachineProductionPlanId,
        selectedMachineProduction,
        handleValidateMachineProductionPlan,
        handleRefreshMachineProductionPlan,
        handleDetachProductionFromMachine,
        handleMoveProductionBom,
        actionLoading,
    } = config;

    if (machineSummaryProductions.length === 0) {
        return (
            <Alert severity="info" variant="outlined">
                Aucune production affectée à cette machine pour le moment.
            </Alert>
        );
    }

    const busy = Boolean(actionLoading);
    const validated = Boolean(selectedMachineProduction?.manufacturing_order_validated_at);
    const revisions = selectedMachineProduction?.bom_revisions || [];

    return (
        <Box sx={PANEL_SX}>
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
                        <MenuItem key={production.id} value={`${production.id}`}>{production.name}</MenuItem>
                    ))}
                </TextField>
                {validated ? (
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
                            disabled={busy || !revisions.length}
                            sx={{ backgroundColor: '#059669', '&:hover': { backgroundColor: '#047857' } }}
                        >
                            Valider l'ordre
                        </Button>
                        {validated ? (
                            <Tooltip title="Recalculer l'implantation">
                                <span>
                                    <IconButton size="small" onClick={() => handleRefreshMachineProductionPlan(selectedMachineProduction)} disabled={busy} sx={{ color: '#a1a1aa' }}>
                                        <RefreshRoundedIcon fontSize="small" />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        ) : null}
                        <Tooltip title="Détacher cette production de la machine">
                            <span>
                                <IconButton size="small" onClick={() => handleDetachProductionFromMachine(selectedMachineProduction.id)} disabled={busy} sx={{ color: '#71717a', '&:hover': { color: '#ef4444' } }}>
                                    <LinkOffRoundedIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </>
                ) : null}
            </Stack>

            {revisions.length ? (
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
                            {revisions.map((bom, index) => (
                                <TableRow key={bom.bom_revision_id} sx={{ '& td': { borderColor: '#27272a', py: 0.5 } }}>
                                    <TableCell sx={{ color: '#52525b', fontSize: '0.75rem' }}>{bom.sequence_order ?? index + 1}</TableCell>
                                    <TableCell sx={{ color: '#f4f4f5', fontSize: '0.8rem' }}>{bom.reference}</TableCell>
                                    <TableCell sx={{ color: '#a1a1aa', fontSize: '0.75rem' }}>{bom.revision}</TableCell>
                                    <TableCell align="right" sx={{ color: '#a1a1aa', fontSize: '0.75rem' }}>{bom.quantity_to_produce ?? 1}</TableCell>
                                    <TableCell align="right">
                                        <IconButton size="small" aria-label="Monter" disabled={busy || index === 0} onClick={() => handleMoveProductionBom(selectedMachineProduction, bom.bom_revision_id, 'up')} sx={{ color: '#52525b' }}>
                                            <ArrowUpwardRoundedIcon sx={{ fontSize: 15 }} />
                                        </IconButton>
                                        <IconButton size="small" aria-label="Descendre" disabled={busy || index === revisions.length - 1} onClick={() => handleMoveProductionBom(selectedMachineProduction, bom.bom_revision_id, 'down')} sx={{ color: '#52525b' }}>
                                            <ArrowDownwardRoundedIcon sx={{ fontSize: 15 }} />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            ) : (
                <Typography sx={{ fontSize: '0.8rem', color: '#52525b' }}>Aucune BOM dans cette production.</Typography>
            )}
        </Box>
    );
}

/** Types de feeders montés sur la machine + ajout. */
export function FeederMountPanel({ config }) {
    const {
        machineSummary,
        handleRemoveFeederFromMachine,
        availableFeedersForMachine,
        selectedFeederId,
        setSelectedFeederId,
        handleAssignFeederToMachine,
        actionLoading,
    } = config;
    const busy = Boolean(actionLoading);
    const assignedFeeders = machineSummary?.feeders || [];

    return (
        <Box sx={PANEL_SX}>
            <Typography sx={LABEL_SX}>Types de feeders montés ({assignedFeeders.length})</Typography>
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
    );
}
