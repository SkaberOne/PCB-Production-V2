import React from 'react';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import apiClient from '../../api/client';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import PushPinRoundedIcon from '@mui/icons-material/PushPinRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import {
    Box,
    Checkbox,
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
    TableSortLabel,
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
            <TableCell sx={compactWrapCellSx}>
                {(machine.production_names && machine.production_names.length) ? (
                    <Stack spacing={0.25}>
                        {machine.production_names.map((name) => (
                            <Typography key={name} variant="caption" sx={{ color: '#bbf7d0', lineHeight: 1.25 }}>
                                {name}
                            </Typography>
                        ))}
                    </Stack>
                ) : (
                    <Typography variant="caption" sx={{ color: '#71717a' }}>—</Typography>
                )}
            </TableCell>
            <TableCell sx={compactCellSx}>
                <ExportFormatChip machine={machine} />
            </TableCell>
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
                    <Tooltip title="Plus d'actions (modifier, exporter)">
                        <IconButton
                            size="small"
                            aria-label={`Menu d'actions de la machine ${machine.name}`}
                            onClick={(event) => {
                                event.stopPropagation();
                                onOpenContextMenu(event, machine);
                            }}
                            sx={{ color: '#a1a1aa' }}
                        >
                            <MoreVertRoundedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </TableCell>
        </TableRow>
    );
});

/** Pastille du format d'export configuré pour la machine. */
const ExportFormatChip = React.memo(function ExportFormatChip({ machine }) {
    const fmt = machine.export_format;
    if (fmt === 'TXT') {
        return (
            <Chip
                size="small"
                label="TXT · XY"
                sx={{ backgroundColor: 'rgba(167,139,250,0.12)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.3)' }}
            />
        );
    }
    if (fmt === 'CSV') {
        const count = Array.isArray(machine.export_columns) ? machine.export_columns.length : 10;
        return (
            <Chip
                size="small"
                label={`CSV · ${count} col.`}
                sx={{ backgroundColor: 'rgba(56,189,248,0.12)', color: '#7dd3fc', border: '1px solid rgba(56,189,248,0.3)' }}
            />
        );
    }
    return (
        <Chip
            size="small"
            label="non défini"
            sx={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#71717a', border: '1px solid #27272a' }}
        />
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
                        <TableCell sx={{ width: '18%' }}>Nom</TableCell>
                        <TableCell sx={{ width: '8%' }}>Positions</TableCell>
                        <TableCell sx={{ width: '8%' }}>Feeders</TableCell>
                        <TableCell sx={{ width: '16%' }}>Productions</TableCell>
                        <TableCell sx={{ width: '12%' }}>Format export</TableCell>
                        <TableCell sx={{ width: '16%' }}>Description</TableCell>
                        <TableCell sx={{ width: '12%' }}>Creee le</TableCell>
                        <TableCell sx={{ width: '10%' }}>Actions</TableCell>
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

// Conditionnement (007) : formes physiques non nulles (« 🎞️ 2500 · sachet 300 »).
const COND_LABELS_PNP = { reel: '🎞️', bag: 'sachet', tube: 'tube' };
function formatConditionnementPnp(cond) {
    if (!cond) return '—';
    const parts = ['reel', 'bag', 'tube']
        .filter((f) => Number(cond[f]) > 0)
        .map((f) => `${COND_LABELS_PNP[f]} ${Number(cond[f]).toLocaleString('fr-FR')}`);
    return parts.length ? parts.join(' · ') : '—';
}

const MachineAssignmentTableRow = React.memo(function MachineAssignmentTableRow({
    assignment,
    isSelected,
    onSelectSlot,
    onEditComponent,
    selectedMachineBomPlannedBoardQuantity,
    selectedMachineBomRevision,
    installedInfo,
    canToggleInstalled,
    onToggleInstalled,
}) {
    const assignmentPalette = getMachineAssignmentPalette(assignment);
    const quantityDisplay = getMachineAssignmentDisplayQuantities(
        assignment,
        selectedMachineBomRevision,
        selectedMachineBomPlannedBoardQuantity,
    );

    // Clic sur une ligne : sélectionne le slot ET ouvre l'édition du composant.
    const handleActivate = () => {
        onSelectSlot(assignment.slot_start);
        if (onEditComponent && assignment.component_id != null) {
            onEditComponent(assignment.component_id);
        }
    };

    return (
        <TableRow
            hover
            selected={isSelected}
            onClick={handleActivate}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleActivate(); } }}
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
            <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                {(() => {
                    const checked = !!installedInfo?.is_installed;
                    const tip = checked && installedInfo?.installed_by
                        ? `Installé par ${installedInfo.installed_by}${installedInfo.installed_at ? ` le ${new Date(installedInfo.installed_at).toLocaleString('fr-FR')}` : ''}`
                        : 'Marquer installé (posé sur la PnP)';
                    return (
                        <Tooltip title={tip}>
                            <span>
                                <Checkbox
                                    size="small"
                                    checked={checked}
                                    disabled={!canToggleInstalled || assignment.component_id == null}
                                    onChange={(e) => onToggleInstalled(assignment, e.target.checked)}
                                    inputProps={{ 'aria-label': 'installé' }}
                                />
                            </span>
                        </Tooltip>
                    );
                })()}
            </TableCell>
            <TableCell sx={compactCellSx}>
                <Stack direction="row" spacing={0.4} alignItems="center">
                    {assignment.is_pinned ? (
                        <Tooltip title={`Épinglé au slot ${assignment.pinned_slot ?? assignment.slot_start}`}>
                            <PushPinRoundedIcon sx={{ fontSize: 13, color: '#a78bfa' }} />
                        </Tooltip>
                    ) : null}
                    <span>
                        {assignment.slot_start}
                        {assignment.slot_end !== assignment.slot_start ? ' (2 pos.)' : ''}
                    </span>
                </Stack>
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
            <TableCell sx={compactCellSx}>
                <Typography variant="caption" sx={{ color: '#a1a1aa', whiteSpace: 'nowrap' }}>
                    {formatConditionnementPnp(assignment.conditionnement)}
                </Typography>
            </TableCell>
        </TableRow>
    );
});

// Colonnes triables du tableau d'implantation. `get` = valeur de tri ; `numeric`
// distingue tri numérique (slot, feeder mm, BOM, quantités) du tri alpha.
const ASSIGNMENT_SORT_COLUMNS = [
    { key: 'slot', label: 'Slot', numeric: true, get: (a) => a.slot_start ?? 0 },
    { key: 'component', label: 'Composant', numeric: false, get: (a) => a.component_label || '' },
    { key: 'footprint', label: 'Footprint', numeric: false, get: (a) => a.footprint_pnp || '' },
    { key: 'feeder', label: 'Feeder', numeric: true, get: (a) => (a.feeder_size_mm ?? -1) },
    { key: 'type', label: 'Type', numeric: false, get: (a) => getMachineAssignmentTypeLabel(a) || '' },
    { key: 'bom', label: 'BOM', numeric: true, get: (a) => a.bom_presence_count || 0 },
    { key: 'total', label: 'Qté totale', numeric: true, get: (a) => a.total_board_quantity || 0 },
    { key: 'perBoard', label: 'Qté/carte', numeric: true, get: (a) => a.average_board_quantity || 0 },
];

export const MachineAssignmentTable = React.memo(function MachineAssignmentTable({
    assignments,
    selectedSlot,
    onSelectSlot,
    onEditComponent,
    selectedMachineBomPlannedBoardQuantity,
    selectedMachineBomRevision,
    productionId,
}) {
    const [sortBy, setSortBy] = React.useState('slot');
    const [sortDir, setSortDir] = React.useState('asc');
    // Overlay optimiste de l'état « installé » par composant (007).
    const [installedOverlay, setInstalledOverlay] = React.useState({});
    const installedFor = React.useCallback((assignment) => {
        const cid = assignment.component_id;
        if (cid != null && installedOverlay[cid] !== undefined) return installedOverlay[cid];
        return assignment.progress || null;
    }, [installedOverlay]);
    const toggleInstalled = React.useCallback(async (assignment, checked) => {
        const cid = assignment.component_id;
        if (cid == null || !productionId) return;
        setInstalledOverlay((m) => ({ ...m, [cid]: { is_installed: checked, installed_by: null, installed_at: null } }));
        try {
            const res = await apiClient.put(
                `/marketplace/productions/${productionId}/component-progress/${cid}`,
                { installed: checked },
            );
            setInstalledOverlay((m) => ({ ...m, [cid]: {
                is_installed: res.data.is_installed,
                installed_by: res.data.installed_by,
                installed_at: res.data.installed_at,
            } }));
        } catch (err) {
            setInstalledOverlay((m) => ({ ...m, [cid]: { is_installed: !checked, installed_by: null, installed_at: null } }));
        }
    }, [productionId]);

    const handleSort = (key) => {
        if (key === sortBy) {
            setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortBy(key);
            setSortDir('asc');
        }
    };

    const sortedAssignments = React.useMemo(() => {
        const column = ASSIGNMENT_SORT_COLUMNS.find((col) => col.key === sortBy) || ASSIGNMENT_SORT_COLUMNS[0];
        const factor = sortDir === 'asc' ? 1 : -1;
        return [...(assignments || [])].sort((a, b) => {
            const va = column.get(a);
            const vb = column.get(b);
            let cmp;
            if (column.numeric) {
                cmp = (Number(va) || 0) - (Number(vb) || 0);
            } else {
                cmp = String(va).localeCompare(String(vb), 'fr', { numeric: true, sensitivity: 'base' });
            }
            // Départage stable par slot pour un ordre déterministe.
            if (cmp === 0) cmp = (a.slot_start ?? 0) - (b.slot_start ?? 0);
            return cmp * factor;
        });
    }, [assignments, sortBy, sortDir]);

    return (
        <Table size="small" stickyHeader>
            <TableHead>
                <TableRow>
                    <TableCell padding="checkbox">Inst.</TableCell>
                    {ASSIGNMENT_SORT_COLUMNS.map((col) => (
                        <TableCell
                            key={col.key}
                            sortDirection={sortBy === col.key ? sortDir : false}
                        >
                            <TableSortLabel
                                active={sortBy === col.key}
                                direction={sortBy === col.key ? sortDir : 'asc'}
                                onClick={() => handleSort(col.key)}
                            >
                                {col.label}
                            </TableSortLabel>
                        </TableCell>
                    ))}
                    <TableCell>Cond.</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {sortedAssignments.map((assignment) => (
                    <MachineAssignmentTableRow
                        key={assignment.slot_start}
                        assignment={assignment}
                        isSelected={selectedSlot === assignment.slot_start}
                        onSelectSlot={onSelectSlot}
                        onEditComponent={onEditComponent}
                        selectedMachineBomPlannedBoardQuantity={selectedMachineBomPlannedBoardQuantity}
                        selectedMachineBomRevision={selectedMachineBomRevision}
                        installedInfo={installedFor(assignment)}
                        canToggleInstalled={!!productionId}
                        onToggleInstalled={toggleInstalled}
                    />
                ))}
            </TableBody>
        </Table>
    );
});
