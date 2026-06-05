import React from 'react';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import {
    Box,
    Chip,
    IconButton,
    LinearProgress,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from '@mui/material';
import {
    compactCellSx,
    compactTableContainerSx,
    compactTableSx,
    compactWrapCellSx,
} from '../../utils/compactTable';
import {
    cartKindOptions,
    formatDate,
    formatDecimal,
    getComponentPrimaryLabel,
    getComponentSecondaryLabel,
    getMachineAssignmentDisplayQuantities,
    getMachineAssignmentPalette,
    getMachineAssignmentTypeLabel,
} from '../../utils/machinePnp';

const MachineTableRow = React.memo(function MachineTableRow({
    actionLoading,
    isSelected,
    machine,
    onDeleteMachine,
    onOpenConfig,
    onOpenContextMenu,
}) {
    return (
        <TableRow
            hover
            selected={isSelected}
            onClick={() => onOpenConfig(machine)}
            onContextMenu={(event) => onOpenContextMenu(event, machine)}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenConfig(machine); } }}
            sx={{ cursor: 'pointer' }}
        >
            <TableCell sx={compactWrapCellSx}>
                <Stack spacing={0.35}>
                    <Typography variant="body2" sx={{ color: '#f4f4f5', fontWeight: 600 }}>
                        {machine.name}
                    </Typography>
                    {machine.notes ? (
                        <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                            {machine.notes}
                        </Typography>
                    ) : null}
                </Stack>
            </TableCell>
            <TableCell sx={compactCellSx}>{machine.num_positions}</TableCell>
            <TableCell sx={compactCellSx}>{machine.assigned_feeder_types || 0}</TableCell>
            <TableCell sx={compactCellSx}>{machine.active_production_plans || 0}</TableCell>
            <TableCell sx={compactWrapCellSx}>{machine.description || 'Machine prete pour configuration.'}</TableCell>
            <TableCell>{formatDate(machine.created_at)}</TableCell>
            <TableCell>
                <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Configurer les feeders de la machine">
                        <IconButton
                            size="small"
                            color="primary"
                            aria-label={`Configurer les feeders de la machine ${machine.name}`}
                            onClick={(event) => {
                                event.stopPropagation();
                                onOpenConfig(machine);
                            }}
                        >
                            <TuneRoundedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Supprimer la machine">
                        <IconButton
                            size="small"
                            color="error"
                            aria-label={`Supprimer la machine ${machine.name}`}
                            onClick={(event) => {
                                event.stopPropagation();
                                onDeleteMachine(machine);
                            }}
                            disabled={actionLoading === `delete-machine-${machine.id}`}
                        >
                            <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </TableCell>
        </TableRow>
    );
});

export const MachineTable = React.memo(function MachineTable({
    actionLoading,
    machines,
    onDeleteMachine,
    onOpenConfig,
    onOpenContextMenu,
    selectedMachineId,
}) {
    return (
        <TableContainer sx={compactTableContainerSx}>
            <Table sx={compactTableSx}>
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ width: '22%' }}>Nom</TableCell>
                        <TableCell sx={{ width: '10%' }}>Positions</TableCell>
                        <TableCell sx={{ width: '10%' }}>Feeders</TableCell>
                        <TableCell sx={{ width: '10%' }}>Plans</TableCell>
                        <TableCell sx={{ width: '28%' }}>Description</TableCell>
                        <TableCell sx={{ width: '12%' }}>Creee le</TableCell>
                        <TableCell sx={{ width: '8%' }}>Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {machines.map((machine) => (
                        <MachineTableRow
                            key={machine.id}
                            actionLoading={actionLoading}
                            isSelected={selectedMachineId === machine.id}
                            machine={machine}
                            onDeleteMachine={onDeleteMachine}
                            onOpenConfig={onOpenConfig}
                            onOpenContextMenu={onOpenContextMenu}
                        />
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
});

const FixedFeederTableRow = React.memo(function FixedFeederTableRow({
    actionLoading,
    onEditFixedFeeder,
    onRemoveFixedFeeder,
    row,
}) {
    const primaryLabel = getComponentPrimaryLabel(row);
    const secondaryLabel = getComponentSecondaryLabel(row);

    return (
        <TableRow hover>
            <TableCell sx={compactWrapCellSx}>
                <Stack spacing={0.35}>
                    <Typography variant="body2" sx={{ color: '#f4f4f5', fontWeight: 600 }}>
                        {primaryLabel}
                    </Typography>
                    {secondaryLabel ? (
                        <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                            {secondaryLabel}
                        </Typography>
                    ) : null}
                </Stack>
            </TableCell>
            <TableCell sx={compactWrapCellSx}>{row.footprint_pnp || '--'}</TableCell>
            <TableCell>{row.feeder_type || (row.feeder_size_mm ? `${row.feeder_size_mm} mm` : '--')}</TableCell>
            <TableCell>{row.bom_reference_count || 0}</TableCell>
            <TableCell>{formatDecimal(row.average_board_quantity || 0)}</TableCell>
            <TableCell sx={{ ...compactCellSx, minWidth: 190 }}>
                <Stack spacing={0.35}>
                    <Typography variant="body2" noWrap title={row.fixed_cart_name || ''} sx={{ color: '#f4f4f5' }}>
                        {row.fixed_cart_name || '--'}
                    </Typography>
                    {row.fixed_cart_kind ? (
                        <Chip
                            size="small"
                            variant="outlined"
                            label={cartKindOptions.find((opt) => opt.value === row.fixed_cart_kind)?.label || row.fixed_cart_kind}
                            sx={{ width: 'fit-content' }}
                        />
                    ) : null}
                </Stack>
            </TableCell>
            <TableCell>
                <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Modifier ce feeder fixe">
                        <IconButton
                            size="small"
                            color="primary"
                            aria-label={`Modifier le feeder fixe ${primaryLabel}`}
                            onClick={() => onEditFixedFeeder(row)}
                        >
                            <EditRoundedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Retirer ce feeder fixe">
                        <IconButton
                            size="small"
                            color="error"
                            aria-label={`Retirer le feeder fixe ${primaryLabel}`}
                            onClick={() => onRemoveFixedFeeder(row.component_id)}
                            disabled={actionLoading === `remove-fixed-feeder-${row.component_id}`}
                        >
                            <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </TableCell>
        </TableRow>
    );
});

export const FixedFeederTable = React.memo(function FixedFeederTable({
    actionLoading,
    onEditFixedFeeder,
    onRemoveFixedFeeder,
    rows,
}) {
    return (
        <TableContainer sx={compactTableContainerSx}>
            <Table sx={compactTableSx}>
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ width: '23%' }}>Composant</TableCell>
                        <TableCell sx={{ width: '15%' }}>Footprint PnP</TableCell>
                        <TableCell sx={{ width: '11%' }}>Taille feeder</TableCell>
                        <TableCell sx={{ width: '10%' }}>BOM communs</TableCell>
                        <TableCell sx={{ width: '13%' }}>Qte moyenne/carte</TableCell>
                        <TableCell sx={{ width: '20%' }}>Chariot fixe</TableCell>
                        <TableCell sx={{ width: '8%' }}>Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map((row) => (
                        <FixedFeederTableRow
                            key={row.component_id}
                            actionLoading={actionLoading}
                            onEditFixedFeeder={onEditFixedFeeder}
                            onRemoveFixedFeeder={onRemoveFixedFeeder}
                            row={row}
                        />
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
});

const CartTableRow = React.memo(function CartTableRow({
    actionLoading,
    cart,
    onDeleteCart,
    onEditCart,
}) {
    const usedPercent = cart.capacity_positions > 0
        ? Math.min(100, Math.round(((cart.used_positions || 0) / cart.capacity_positions) * 100))
        : 0;
    const progressColor = usedPercent >= 90 ? '#f97316' : usedPercent >= 70 ? '#f59e0b' : '#10b981';

    return (
        <TableRow hover>
            <TableCell>
                <Stack spacing={0.35}>
                    <Typography variant="body2" sx={{ color: '#f4f4f5', fontWeight: 600 }}>
                        {cart.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                        {cart.fixed_component_count || 0} composant(s) fixe(s)
                    </Typography>
                </Stack>
            </TableCell>
            <TableCell>
                {/* #11 — label lisible via cartKindOptions */}
                <Chip
                    size="small"
                    label={cartKindOptions.find((opt) => opt.value === cart.kind)?.label || cart.kind}
                    variant="outlined"
                />
            </TableCell>
            <TableCell>
                {cart.kind === 'COMMON' ? 'Composant commun' : (cart.target_category || '--')}
            </TableCell>
            <TableCell>
                {/* #12 — barre de progression capacité */}
                <Stack spacing={0.5}>
                    <Typography variant="body2" sx={{ color: '#f4f4f5' }}>
                        {cart.used_positions || 0} / {cart.capacity_positions}
                    </Typography>
                    <Box sx={{ width: 80 }}>
                        <LinearProgress
                            variant="determinate"
                            value={usedPercent}
                            sx={{
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: 'rgba(255,255,255,0.08)',
                                '& .MuiLinearProgress-bar': { backgroundColor: progressColor, borderRadius: 3 },
                            }}
                        />
                    </Box>
                    <Typography variant="caption" sx={{ color: '#71717a' }}>
                        {cart.remaining_positions || 0} restant(s)
                    </Typography>
                </Stack>
            </TableCell>
            <TableCell>
                <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Modifier ce chariot">
                        <IconButton
                            size="small"
                            color="primary"
                            aria-label={`Modifier le chariot ${cart.name}`}
                            onClick={() => onEditCart(cart)}
                            disabled={actionLoading === `update-cart-${cart.id}`}
                        >
                            <EditRoundedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Supprimer ce chariot">
                        <IconButton
                            size="small"
                            color="error"
                            aria-label={`Supprimer le chariot ${cart.name}`}
                            onClick={() => onDeleteCart(cart)}
                            disabled={actionLoading === `delete-cart-${cart.id}`}
                        >
                            <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </TableCell>
        </TableRow>
    );
});

export const CartTable = React.memo(function CartTable({
    actionLoading,
    carts,
    onDeleteCart,
    onEditCart,
}) {
    return (
        <TableContainer sx={compactTableContainerSx}>
            <Table sx={compactTableSx}>
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ width: '22%' }}>Nom</TableCell>
                        <TableCell sx={{ width: '16%' }}>Type</TableCell>
                        <TableCell sx={{ width: '16%' }}>Catégorie cible</TableCell>
                        <TableCell sx={{ width: '22%' }}>Capacité utilisée</TableCell>
                        <TableCell sx={{ width: '10%' }}>Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {carts.map((cart) => (
                        <CartTableRow
                            key={cart.id}
                            actionLoading={actionLoading}
                            cart={cart}
                            onDeleteCart={onDeleteCart}
                            onEditCart={onEditCart}
                        />
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
});

const MachineAssignmentTableRow = React.memo(function MachineAssignmentTableRow({
    assignment,
    isSelected,
    onSelectSlot,
    selectedMachineBomPlannedBoardQuantity,
    selectedMachineBomRevision,
}) {
    const assignmentPalette = getMachineAssignmentPalette(assignment);
    const quantityDisplay = getMachineAssignmentDisplayQuantities(
        assignment,
        selectedMachineBomRevision,
        selectedMachineBomPlannedBoardQuantity,
    );

    return (
        <TableRow
            hover
            selected={isSelected}
            onClick={() => onSelectSlot(assignment.slot_start)}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectSlot(assignment.slot_start); } }}
            sx={{
                cursor: 'pointer',
                backgroundColor: assignmentPalette.rowBackground,
                '&:hover': {
                    backgroundColor: assignmentPalette.rowHoverBackground,
                },
                '& td': {
                    borderBottomColor: assignmentPalette.rowBorder,
                },
            }}
        >
            <TableCell sx={compactCellSx}>
                {assignment.slot_start}
                {assignment.slot_end !== assignment.slot_start ? ' (2 pos.)' : ''}
            </TableCell>
            <TableCell sx={compactWrapCellSx}>{assignment.component_label}</TableCell>
            <TableCell sx={compactCellSx}>{assignment.footprint_pnp || '--'}</TableCell>
            <TableCell sx={compactCellSx}>
                {assignment.feeder_type || (assignment.feeder_size_mm ? `${assignment.feeder_size_mm} mm` : '--')}
            </TableCell>
            <TableCell sx={compactCellSx}>
                <Chip
                    size="small"
                    label={getMachineAssignmentTypeLabel(assignment)}
                    sx={{
                        backgroundColor: assignmentPalette.chipBackground,
                        color: assignmentPalette.chipColor,
                        border: `1px solid ${assignmentPalette.chipBorder}`,
                    }}
                />
            </TableCell>
            <TableCell sx={compactCellSx}>{assignment.bom_presence_count || 0}</TableCell>
            <TableCell sx={compactCellSx}>
                <Stack spacing={0.15}>
                    <Typography variant="body2" sx={{ color: '#bbf7d0', fontWeight: 700 }}>
                        {formatDecimal(quantityDisplay.totalQuantity || 0)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#86efac' }}>
                        {quantityDisplay.totalHelperLabel}
                    </Typography>
                </Stack>
            </TableCell>
            <TableCell sx={compactCellSx}>
                <Stack spacing={0.15}>
                    <Typography variant="body2" sx={{ color: '#bae6fd', fontWeight: 700 }}>
                        {formatDecimal(quantityDisplay.perBoardQuantity || 0)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#7dd3fc' }}>
                        {quantityDisplay.perBoardHelperLabel}
                    </Typography>
                </Stack>
            </TableCell>
        </TableRow>
    );
});

export const MachineAssignmentTable = React.memo(function MachineAssignmentTable({
    assignments,
    selectedSlot,
    onSelectSlot,
    selectedMachineBomPlannedBoardQuantity,
    selectedMachineBomRevision,
}) {
    return (
        <Table size="small" stickyHeader>
            <TableHead>
                <TableRow>
                    <TableCell>Slot</TableCell>
                    <TableCell>Composant</TableCell>
                    <TableCell>Footprint</TableCell>
                    <TableCell>Feeder</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>BOM</TableCell>
                    <TableCell>Qté totale</TableCell>
                    <TableCell>Qté/carte</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {(assignments || []).map((assignment) => (
                    <MachineAssignmentTableRow
                        key={assignment.slot_start}
                        assignment={assignment}
                        isSelected={selectedSlot === assignment.slot_start}
                        onSelectSlot={onSelectSlot}
                        selectedMachineBomPlannedBoardQuantity={selectedMachineBomPlannedBoardQuantity}
                        selectedMachineBomRevision={selectedMachineBomRevision}
                    />
                ))}
            </TableBody>
        </Table>
    );
});
