import React from 'react';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import EmptyState from '../common/EmptyState';
import { BOM_ITEM_STATUSES, getBomItemStatus, getBomItemType } from '../../utils/bomSession';
import { buildActiveStats, getStatusChipColor } from '../../utils/bomReviewView';
import {
    compactCellSx,
    compactInputSx,
    compactPaginationSx,
    compactTableContainerSx,
    compactTableSx,
    compactWrapCellSx,
} from '../../utils/compactTable';
import { componentTypeOptions } from '../../utils/componentTypes';

// ─── Dark-themed dialog paper ────────────────────────────────────────────────
const DIALOG_PAPER_SX = {
    backgroundColor: '#111827',
    color: '#f4f4f5',
    border: '1px solid #27272a',
    borderRadius: 3,
};

// ─── Sort comparator ─────────────────────────────────────────────────────────
function compareItems(a, b, column) {
    const get = (item) => {
        switch (column) {
            case 'reference':         return String(item.reference || item.reference_item || '').toLowerCase();
            case 'value_raw':         return String(item.value_raw || '').toLowerCase();
            case 'value_harmonized':  return String(item.value_harmonized || '').toLowerCase();
            case 'footprint_eagle':   return String(item.footprint_eagle || '').toLowerCase();
            case 'footprint_pnp':     return String(item.footprint_pnp || '').toLowerCase();
            case 'quantity':          return Number(item.quantity || 1);
            case 'type':              return String(item._type || '').toLowerCase();
            case 'status':            return String(item._status || '').toLowerCase();
            default:                  return '';
        }
    };
    const av = get(a);
    const bv = get(b);
    if (typeof av === 'number') return av - bv;
    return av.localeCompare(bv, undefined, { sensitivity: 'base' });
}

// ─── Sortable header cell ─────────────────────────────────────────────────────
const HEADER_HOVER_SX = {
    cursor: 'pointer',
    userSelect: 'none',
    '&:hover': { backgroundColor: 'rgba(255,255,255,0.04)' },
};

function SortableHeaderCell({ label, column, sortConfig, onSort, width, sx }) {
    const isActive = sortConfig.column === column;
    const isAsc = sortConfig.direction === 'asc';
    return (
        <TableCell sx={{ width, ...HEADER_HOVER_SX, ...sx }} onClick={() => onSort(column)}>
            <Stack direction="row" alignItems="center" spacing={0.25}>
                <span>{label}</span>
                {isActive ? (
                    isAsc
                        ? <ArrowUpwardRoundedIcon sx={{ fontSize: '0.72rem', color: '#10b981' }} />
                        : <ArrowDownwardRoundedIcon sx={{ fontSize: '0.72rem', color: '#10b981' }} />
                ) : null}
            </Stack>
        </TableCell>
    );
}

// ─── Single review row ────────────────────────────────────────────────────────
const BomReviewTableRow = React.memo(function BomReviewTableRow({
    item,
    status,
    isSelected,
    showSelectColumn,
    isFocused,
    rowRef,
    onSelect,
    onValueChange,
    onFootprintChange,
    onComponentTypeChange,
    onDnpChange,
    onNotesChange,
}) {
    const focusedRowSx = React.useMemo(() => ({
        backgroundColor: isFocused ? 'rgba(16, 185, 129, 0.06)' : 'transparent',
        outline: isFocused ? '1px solid rgba(16, 185, 129, 0.25)' : 'none',
        outlineOffset: '-1px',
    }), [isFocused]);

    return (
        <TableRow ref={rowRef} sx={focusedRowSx}>
            {showSelectColumn ? (
                <TableCell sx={{ ...compactCellSx, width: '4%' }}>
                    <Checkbox
                        size="small"
                        checked={isSelected}
                        onChange={(e) => onSelect(item.id, e.target.checked)}
                        sx={{ p: 0.5 }}
                    />
                </TableCell>
            ) : null}
            <TableCell sx={compactCellSx}>{item.reference || item.reference_item || '-'}</TableCell>
            <TableCell sx={compactWrapCellSx}>{item.value_raw || '-'}</TableCell>
            <TableCell>
                <TextField
                    fullWidth size="small"
                    value={item.value_harmonized || ''}
                    onChange={(e) => onValueChange(item.id, e.target.value)}
                    placeholder={item.value_raw || ''}
                    sx={compactInputSx}
                />
            </TableCell>
            <TableCell sx={compactWrapCellSx}>{item.footprint_eagle || '-'}</TableCell>
            <TableCell>
                <TextField
                    fullWidth size="small"
                    value={item.footprint_pnp || ''}
                    onChange={(e) => onFootprintChange(item, e.target.value)}
                    placeholder={item.footprint_eagle || ''}
                    sx={compactInputSx}
                />
            </TableCell>
            <TableCell sx={compactCellSx}>{item.quantity || 1}</TableCell>
            <TableCell>
                <Stack spacing={0.75}>
                    <TextField
                        fullWidth select size="small"
                        value={item._type || ''}
                        onChange={(e) => onComponentTypeChange(item.id, e.target.value)}
                        sx={compactInputSx}
                    >
                        {componentTypeOptions.map((opt) => (
                            <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                        ))}
                    </TextField>
                    {item.component_type_requires_confirmation && !item.component_type_confirmed ? (
                        <Typography variant="caption" sx={{ color: 'warning.main', lineHeight: 1.35 }}>
                            Confirmation requise.
                        </Typography>
                    ) : null}
                </Stack>
            </TableCell>
            <TableCell>
                <Chip label={status} size="small" color={getStatusChipColor(status)} variant="outlined" />
            </TableCell>
            <TableCell sx={compactCellSx}>
                <Checkbox
                    size="small"
                    checked={Boolean(item.dnp)}
                    onChange={(e) => onDnpChange(item.id, e.target.checked)}
                    sx={{ p: 0.5 }}
                />
            </TableCell>
            <TableCell>
                <TextField
                    fullWidth size="small"
                    value={item.notes || ''}
                    onChange={(e) => onNotesChange(item.id, e.target.value)}
                    placeholder="Note…"
                    sx={compactInputSx}
                />
            </TableCell>
        </TableRow>
    );
});

// ─── Main BomReviewTab component ──────────────────────────────────────────────
/**
 * Onglet "Revue BOM" : table éditable avec tri, filtres, sélection bulk,
 * raccourcis clavier (ArrowUp/Down, Space, Ctrl+Z) et notes.
 */
function BomReviewTab({
    activeBom,
    activeRevisionId,
    undoStackLength = 0,
    onValueChange,
    onFootprintChange,
    onComponentTypeChange,
    onDnpChange,
    onNotesChange,
    onBulkTypeChange,
    onUndo,
}) {
    // ── Filters ──────────────────────────────────────────────────────────────
    const [search, setSearch] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState('all');
    const [requiresConfirmOnly, setRequiresConfirmOnly] = React.useState(false);
    const [typeFilter, setTypeFilter] = React.useState('all');
    // ── Pagination ───────────────────────────────────────────────────────────
    const [reviewPage, setReviewPage] = React.useState(0);
    const [reviewRowsPerPage, setReviewRowsPerPage] = React.useState(25);
    // ── Sort ─────────────────────────────────────────────────────────────────
    const [sortConfig, setSortConfig] = React.useState({ column: null, direction: 'asc' });
    // ── Bulk select ──────────────────────────────────────────────────────────
    const [selectMode, setSelectMode] = React.useState(false);
    const [selectedItemIds, setSelectedItemIds] = React.useState(new Set());
    const [bulkTypeDialogOpen, setBulkTypeDialogOpen] = React.useState(false);
    const [bulkTypeValue, setBulkTypeValue] = React.useState('');
    // ── Keyboard navigation ──────────────────────────────────────────────────
    const [focusedRowIndex, setFocusedRowIndex] = React.useState(null);
    const rowRefs = React.useRef({});
    const containerRef = React.useRef(null);

    const deferredSearch = React.useDeferredValue(search);

    const items = React.useMemo(() => activeBom?.items || [], [activeBom]);
    const warnings = React.useMemo(() => activeBom?.warnings || [], [activeBom]);
    const errors = React.useMemo(() => activeBom?.errors || [], [activeBom]);

    // ── Stats (memoized) ─────────────────────────────────────────────────────
    const activeStats = React.useMemo(
        () => buildActiveStats(items, warnings, errors),
        [items, warnings, errors],
    );

    const pendingTypeConfirmationCount = React.useMemo(
        () => items.filter((i) => i.component_type_requires_confirmation && !i.component_type_confirmed).length,
        [items],
    );

    const typeOptions = React.useMemo(
        () => Array.from(new Set(items.map((i) => getBomItemType(i)))).filter(Boolean).sort((a, b) => a.localeCompare(b)),
        [items],
    );

    // ── Cache _status + _type per item to avoid duplicate calls (#6) ─────────
    const itemsWithMeta = React.useMemo(
        () => items.map((item) => ({
            ...item,
            _status: getBomItemStatus(item, warnings, errors),
            _type: getBomItemType(item),
        })),
        [items, warnings, errors],
    );

    // ── Filtered items ───────────────────────────────────────────────────────
    const filteredItems = React.useMemo(() => {
        const norm = deferredSearch.trim().toLowerCase();
        return itemsWithMeta.filter((item) => {
            const okStatus  = statusFilter === 'all' || item._status === statusFilter;
            const okType    = typeFilter === 'all' || item._type === typeFilter;
            const okConfirm = !requiresConfirmOnly
                || (item.component_type_requires_confirmation && !item.component_type_confirmed);
            const okSearch  = !norm || [
                item.reference, item.reference_item, item.value_raw,
                item.value_harmonized, item.footprint_eagle, item.footprint_pnp,
                item.component_library_name, item.notes,
            ].some((v) => String(v || '').toLowerCase().includes(norm));
            return okStatus && okType && okConfirm && okSearch;
        });
    }, [itemsWithMeta, statusFilter, typeFilter, requiresConfirmOnly, deferredSearch]);

    // ── Sorted items (#10) ────────────────────────────────────────────────────
    const sortedItems = React.useMemo(() => {
        if (!sortConfig.column) return filteredItems;
        const sorted = [...filteredItems].sort((a, b) => compareItems(a, b, sortConfig.column));
        return sortConfig.direction === 'asc' ? sorted : sorted.reverse();
    }, [filteredItems, sortConfig]);

    // ── Paginated items ──────────────────────────────────────────────────────
    const paginatedItems = React.useMemo(() => {
        const start = reviewPage * reviewRowsPerPage;
        return sortedItems.slice(start, start + reviewRowsPerPage);
    }, [sortedItems, reviewPage, reviewRowsPerPage]);

    // ── Reset page on filter/BOM change ──────────────────────────────────────
    React.useEffect(() => { setReviewPage(0); },
        [activeRevisionId, deferredSearch, statusFilter, typeFilter, requiresConfirmOnly]);

    // ── Reset selection + purge stale rowRefs on BOM change ──────────────────
    React.useEffect(() => {
        setSelectedItemIds(new Set());
        setFocusedRowIndex(null);
        setSelectMode(false);
        rowRefs.current = {};
    }, [activeRevisionId]);

    // ── Auto-scroll to first REVIEW/ERROR item on BOM load (#21) ─────────────
    React.useEffect(() => {
        if (!activeBom) return;

        const firstReviewIdx = itemsWithMeta.findIndex(
            (item) => item._status === BOM_ITEM_STATUSES.REVIEW || item._status === BOM_ITEM_STATUSES.ERROR,
        );
        if (firstReviewIdx >= 0) {
            const targetPage = Math.floor(firstReviewIdx / reviewRowsPerPage);
            setReviewPage(targetPage);
        }

        setTimeout(() => {
            containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeBom?.bomRevisionId]);

    // ── Scroll focused row into view ─────────────────────────────────────────
    React.useEffect(() => {
        if (focusedRowIndex === null) return;
        const focused = paginatedItems[focusedRowIndex];
        if (focused && rowRefs.current[focused.id]) {
            rowRefs.current[focused.id].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [focusedRowIndex, paginatedItems]);

    // ── Keyboard shortcuts (#19) ──────────────────────────────────────────────
    React.useEffect(() => {
        const onKey = (e) => {
            // Ctrl+Z / Cmd+Z — undo (#22)
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                if (undoStackLength > 0) { e.preventDefault(); onUndo(); }
                return;
            }
            // Arrow nav — skip when focus is inside an input/select
            const tag = document.activeElement?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFocusedRowIndex((prev) => Math.min((prev ?? -1) + 1, paginatedItems.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFocusedRowIndex((prev) => Math.max((prev ?? 1) - 1, 0));
            } else if (e.key === ' ' && focusedRowIndex !== null) {
                e.preventDefault();
                const focusedItem = paginatedItems[focusedRowIndex];
                if (focusedItem) onDnpChange(focusedItem.id, !focusedItem.dnp);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [undoStackLength, onUndo, paginatedItems, focusedRowIndex, onDnpChange]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleSort = React.useCallback((column) => {
        setSortConfig((prev) => ({
            column,
            direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
        }));
    }, []);

    const handleSelectItem = React.useCallback((itemId, checked) => {
        setSelectedItemIds((prev) => {
            const next = new Set(prev);
            checked ? next.add(itemId) : next.delete(itemId);
            return next;
        });
    }, []);

    const handleSelectAll = React.useCallback((checked) => {
        setSelectedItemIds(checked ? new Set(paginatedItems.map((i) => i.id)) : new Set());
    }, [paginatedItems]);

    // #9 — clickable chips filter
    const handleStatusChipClick = React.useCallback((status) => {
        setStatusFilter((prev) => prev === status ? 'all' : status);
        setRequiresConfirmOnly(false);
        setReviewPage(0);
    }, []);

    // #13 — pending type chip filter
    const handlePendingTypeChipClick = React.useCallback(() => {
        setRequiresConfirmOnly((prev) => !prev);
        setStatusFilter('all');
        setReviewPage(0);
    }, []);

    // #20 — bulk type assign
    const handleBulkTypeConfirm = React.useCallback(() => {
        if (bulkTypeValue && selectedItemIds.size) {
            onBulkTypeChange(Array.from(selectedItemIds), bulkTypeValue);
        }
        setBulkTypeDialogOpen(false);
        setBulkTypeValue('');
        setSelectedItemIds(new Set());
    }, [bulkTypeValue, selectedItemIds, onBulkTypeChange]);

    const allPageSelected = paginatedItems.length > 0
        && paginatedItems.every((i) => selectedItemIds.has(i.id));
    const somePageSelected = paginatedItems.some((i) => selectedItemIds.has(i.id)) && !allPageSelected;

    // ── Empty state ──────────────────────────────────────────────────────────
    if (!activeBom) {
        return (
            <EmptyState
                eyebrow="Aucune BOM active"
                title="Sélectionne une BOM pour commencer la revue"
                description="La table de revue apparaît ici dès qu'une BOM active est chargée depuis Fichier BOM ou Import BOM."
                actionLabel="Sélectionner une BOM"
            />
        );
    }

    const colCount = selectMode ? 11 : 10;

    return (
        <Stack spacing={3} ref={containerRef}>

            {/* ── Header + stats chips (#9) ─────────────────────────────── */}
            <Stack direction={{ xs: 'column', xl: 'row' }} justifyContent="space-between" spacing={2}>
                <Box>
                    <Typography variant="h6" sx={{ color: '#f4f4f5', fontWeight: 600 }}>
                        {`${activeBom.reference || 'BOM'} ${activeBom.revision || ''} ${activeBom.side || ''}`.trim()}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#a1a1aa', mt: 0.5 }}>
                        Revue finale avant préparation composants.{' '}
                        Ctrl+Z pour annuler. ↑↓ pour naviguer. Espace pour toggle DNP.
                    </Typography>
                </Box>

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip label={`${activeStats.total} lignes`} size="small" variant="outlined" />

                    <Tooltip title="Filtrer sur 'À vérifier'">
                        <Chip
                            label={`${activeStats.review} à vérifier`}
                            size="small"
                            color="warning"
                            variant={statusFilter === BOM_ITEM_STATUSES.REVIEW ? 'filled' : 'outlined'}
                            onClick={() => handleStatusChipClick(BOM_ITEM_STATUSES.REVIEW)}
                            sx={{ cursor: 'pointer' }}
                        />
                    </Tooltip>

                    <Tooltip title="Filtrer sur 'Erreur'">
                        <Chip
                            label={`${activeStats.errors} erreur(s)`}
                            size="small"
                            color="error"
                            variant={statusFilter === BOM_ITEM_STATUSES.ERROR ? 'filled' : 'outlined'}
                            onClick={() => handleStatusChipClick(BOM_ITEM_STATUSES.ERROR)}
                            sx={{ cursor: 'pointer' }}
                        />
                    </Tooltip>

                    <Tooltip title="Filtrer sur 'Harmonisé'">
                        <Chip
                            label={`${activeStats.harmonized} harmonisées`}
                            size="small"
                            color="success"
                            variant={statusFilter === BOM_ITEM_STATUSES.HARMONIZED ? 'filled' : 'outlined'}
                            onClick={() => handleStatusChipClick(BOM_ITEM_STATUSES.HARMONIZED)}
                            sx={{ cursor: 'pointer' }}
                        />
                    </Tooltip>

                    {pendingTypeConfirmationCount ? (
                        <Tooltip title="Filtrer les types à confirmer (#13)">
                            <Chip
                                label={`${pendingTypeConfirmationCount} type(s) à confirmer`}
                                size="small"
                                color="warning"
                                variant={requiresConfirmOnly ? 'filled' : 'outlined'}
                                onClick={handlePendingTypeChipClick}
                                sx={{ cursor: 'pointer' }}
                            />
                        </Tooltip>
                    ) : null}

                    {undoStackLength > 0 ? (
                        <Tooltip title="Annuler la dernière modification (Ctrl+Z)">
                            <Chip
                                label={`Annuler (${undoStackLength})`}
                                size="small"
                                variant="outlined"
                                onClick={onUndo}
                                sx={{ cursor: 'pointer', color: '#a1a1aa', borderColor: '#52525b' }}
                            />
                        </Tooltip>
                    ) : null}
                </Stack>
            </Stack>

            {/* ── Alerts ────────────────────────────────────────────────── */}
            {(warnings.length || errors.length) ? (
                <Alert severity={errors.length ? 'error' : 'warning'}>
                    {errors.length
                        ? `${errors.length} erreur(s) détectée(s) dans cette révision.`
                        : `${warnings.length} point(s) restent à vérifier dans cette révision.`}
                </Alert>
            ) : null}

            {pendingTypeConfirmationCount ? (
                <Alert severity="warning">
                    Des types proposés automatiquement restent à confirmer. Utilise <em>Save draft</em> pour accepter les
                    suggestions courantes, ou ajuste manuellement le champ Type avant <em>Validate</em>.
                </Alert>
            ) : null}

            {/* ── Filters + bulk actions ────────────────────────────────── */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems="center" flexWrap="wrap">
                <TextField
                    fullWidth
                    label="Recherche"
                    placeholder="Référence, valeur, empreinte, note…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <TextField
                    select label="Statut" value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setRequiresConfirmOnly(false); }}
                    sx={{ minWidth: 190 }}
                >
                    <MenuItem value="all">Tous</MenuItem>
                    <MenuItem value={BOM_ITEM_STATUSES.REVIEW}>{BOM_ITEM_STATUSES.REVIEW}</MenuItem>
                    <MenuItem value={BOM_ITEM_STATUSES.HARMONIZED}>{BOM_ITEM_STATUSES.HARMONIZED}</MenuItem>
                    <MenuItem value={BOM_ITEM_STATUSES.KEPT}>{BOM_ITEM_STATUSES.KEPT}</MenuItem>
                    <MenuItem value={BOM_ITEM_STATUSES.DNP}>{BOM_ITEM_STATUSES.DNP}</MenuItem>
                    <MenuItem value={BOM_ITEM_STATUSES.ERROR}>{BOM_ITEM_STATUSES.ERROR}</MenuItem>
                </TextField>
                <TextField
                    select label="Type" value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    sx={{ minWidth: 180 }}
                >
                    <MenuItem value="all">Tous</MenuItem>
                    {typeOptions.map((opt) => (
                        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                    ))}
                </TextField>

                {/* Bulk select toggle (#20) */}
                <Stack direction="row" spacing={1} flexShrink={0}>
                    <Button
                        size="small"
                        variant={selectMode ? 'contained' : 'outlined'}
                        onClick={() => { setSelectMode((prev) => !prev); setSelectedItemIds(new Set()); }}
                        sx={{ whiteSpace: 'nowrap' }}
                    >
                        {selectMode ? `Sélection (${selectedItemIds.size})` : 'Sélection multiple'}
                    </Button>
                    {selectMode && selectedItemIds.size > 0 ? (
                        <Button
                            size="small"
                            variant="outlined"
                            color="secondary"
                            onClick={() => setBulkTypeDialogOpen(true)}
                            sx={{ whiteSpace: 'nowrap' }}
                        >
                            Assigner type
                        </Button>
                    ) : null}
                </Stack>
            </Stack>

            {/* ── Review table (#8 notes, #10 sort, #18 static sx) ─────── */}
            <TableContainer sx={{ ...compactTableContainerSx, overflowX: 'auto' }}>
                <Table sx={compactTableSx}>
                    <TableHead sx={{ backgroundColor: '#09090b' }}>
                        <TableRow>
                            {selectMode ? (
                                <TableCell sx={{ width: '4%' }}>
                                    <Checkbox
                                        size="small"
                                        checked={allPageSelected}
                                        indeterminate={somePageSelected}
                                        onChange={(e) => handleSelectAll(e.target.checked)}
                                        sx={{ p: 0.5 }}
                                    />
                                </TableCell>
                            ) : null}
                            <SortableHeaderCell label="Ref"           column="reference"        sortConfig={sortConfig} onSort={handleSort} width={selectMode ? '7%' : '8%'} />
                            <SortableHeaderCell label="Valeur brute"  column="value_raw"         sortConfig={sortConfig} onSort={handleSort} width="9%" />
                            <SortableHeaderCell label="Valeur revue"  column="value_harmonized"  sortConfig={sortConfig} onSort={handleSort} width="11%" />
                            <SortableHeaderCell label="FP Eagle"      column="footprint_eagle"   sortConfig={sortConfig} onSort={handleSort} width="10%" />
                            <SortableHeaderCell label="FP PnP"        column="footprint_pnp"     sortConfig={sortConfig} onSort={handleSort} width="11%" />
                            <SortableHeaderCell label="Qty"           column="quantity"          sortConfig={sortConfig} onSort={handleSort} width="5%" />
                            <SortableHeaderCell label="Type"          column="type"              sortConfig={sortConfig} onSort={handleSort} width="10%" />
                            <SortableHeaderCell label="Statut"        column="status"            sortConfig={sortConfig} onSort={handleSort} width="10%" />
                            <TableCell sx={{ width: '5%' }}>DNP</TableCell>
                            <TableCell sx={{ width: selectMode ? '13%' : '21%' }}>Notes</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {!sortedItems.length ? (
                            <TableRow>
                                <TableCell colSpan={colCount} sx={{ py: 3 }}>
                                    <EmptyState
                                        eyebrow="Aucun résultat"
                                        title="La revue ne remonte aucune ligne"
                                        description="Ajuste la recherche ou les filtres pour revoir les lignes de cette BOM."
                                        actionLabel="Réinitialiser les filtres"
                                    />
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedItems.map((item, index) => (
                                <BomReviewTableRow
                                    key={item.id}
                                    item={item}
                                    status={item._status}
                                    isSelected={selectedItemIds.has(item.id)}
                                    showSelectColumn={selectMode}
                                    isFocused={focusedRowIndex === index}
                                    rowRef={(el) => { rowRefs.current[item.id] = el; }}
                                    onSelect={handleSelectItem}
                                    onValueChange={onValueChange}
                                    onFootprintChange={onFootprintChange}
                                    onComponentTypeChange={onComponentTypeChange}
                                    onDnpChange={onDnpChange}
                                    onNotesChange={onNotesChange}
                                />
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {sortedItems.length ? (
                <TablePagination
                    component="div"
                    count={sortedItems.length}
                    page={reviewPage}
                    onPageChange={(_, nextPage) => setReviewPage(nextPage)}
                    rowsPerPage={reviewRowsPerPage}
                    onRowsPerPageChange={(e) => { setReviewRowsPerPage(parseInt(e.target.value, 10)); setReviewPage(0); }}
                    rowsPerPageOptions={[25, 50, 100]}
                    sx={compactPaginationSx}
                    labelRowsPerPage="Lignes"
                />
            ) : null}

            {/* ── Bulk type assign dialog (#20) ─────────────────────────── */}
            <Dialog
                open={bulkTypeDialogOpen}
                onClose={() => setBulkTypeDialogOpen(false)}
                maxWidth="xs"
                fullWidth
                PaperProps={{ sx: DIALOG_PAPER_SX }}
            >
                <DialogTitle sx={{ borderBottom: '1px solid #27272a', fontWeight: 700 }}>
                    Assigner un type — {selectedItemIds.size} composant(s)
                </DialogTitle>
                <DialogContent sx={{ pt: 2.5 }}>
                    <TextField
                        select fullWidth size="small" label="Type"
                        value={bulkTypeValue}
                        onChange={(e) => setBulkTypeValue(e.target.value)}
                    >
                        {componentTypeOptions.map((opt) => (
                            <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                        ))}
                    </TextField>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2.5, borderTop: '1px solid #27272a', gap: 1 }}>
                    <Button onClick={() => setBulkTypeDialogOpen(false)} variant="outlined" sx={{ color: '#a1a1aa', borderColor: '#52525b' }}>
                        Annuler
                    </Button>
                    <Button onClick={handleBulkTypeConfirm} variant="contained" disabled={!bulkTypeValue}>
                        Appliquer
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}

export default React.memo(BomReviewTab);
