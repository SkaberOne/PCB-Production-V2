import React from 'react';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import {
    Card,
    CardContent,
    Chip,
    Grid,
    MenuItem,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import {
    compactCellSx,
    compactInputSx,
    compactPaginationSx,
    compactTableContainerSx,
    compactTableSx,
    compactWrapCellSx,
} from '../../utils/compactTable';
import {
    buildPreviewTarget,
    clearPreviewFootprintDraft,
    getPreviewFootprintDraftValue,
    getPreviewStatusMeta,
    setPreviewFootprintDraft,
} from '../../utils/bomImportPreview';

const STATUS_ICONS = {
    'missing-component': WarningIcon,
    'missing-footprint': WarningIcon,
    ready: CheckCircleIcon,
    kept: WarningIcon,
};

function renderStatusChip(item) {
    const status = getPreviewStatusMeta(item);
    const StatusIcon = STATUS_ICONS[status.key] || WarningIcon;

    return (
        <Chip
            icon={<StatusIcon />}
            label={status.label}
            size="small"
            color={status.color}
            variant="outlined"
        />
    );
}

const CompactPreviewRow = React.memo(function CompactPreviewRow({
    effectivePreviewScope,
    group,
    previewFootprintDrafts,
    setPreviewFootprintDrafts,
    updatePreviewTargetsLocally,
    handleCompactGroupFootprintSave,
    handleCompactGroupValueSave,
}) {
    const draftKey = `compact:${group.key}`;

    return (
        <TableRow>
            {effectivePreviewScope === 'batch' && (
                <TableCell sx={compactWrapCellSx}>
                    {group.bomLabels.join(', ')}
                </TableCell>
            )}
            <TableCell sx={compactCellSx}><strong>{group.count}</strong></TableCell>
            <TableCell>
                <TextField
                    fullWidth
                    size="small"
                    sx={compactInputSx}
                    value={group.value_harmonized || group.componentValue}
                    placeholder={group.value_raw || 'Nom composant'}
                    onChange={(event) => updatePreviewTargetsLocally(group.targets, 'value_harmonized', event.target.value)}
                    onBlur={(event) => handleCompactGroupValueSave(group, event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.currentTarget.blur();
                        }
                    }}
                />
            </TableCell>
            <TableCell sx={compactCellSx}>{group.footprint_eagle || '-'}</TableCell>
            <TableCell>
                <TextField
                    fullWidth
                    size="small"
                    sx={compactInputSx}
                    value={getPreviewFootprintDraftValue(previewFootprintDrafts, draftKey, group.footprint_pnp || '')}
                    placeholder={group.footprint_eagle || 'PnP'}
                    onChange={(event) => {
                        setPreviewFootprintDrafts((current) => setPreviewFootprintDraft(current, draftKey, event.target.value));
                    }}
                    onBlur={async (event) => {
                        const nextValue = event.target.value;
                        await handleCompactGroupFootprintSave(group, nextValue);
                        setPreviewFootprintDrafts((current) => clearPreviewFootprintDraft(current, draftKey));
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.currentTarget.blur();
                        }
                    }}
                />
            </TableCell>
            <TableCell sx={compactCellSx}>{group.component_type || '-'}</TableCell>
            <TableCell sx={compactWrapCellSx}>
                {group.component_library_missing ? 'Absent de la base' : 'Trouve'}
            </TableCell>
            <TableCell>{renderStatusChip(group)}</TableCell>
        </TableRow>
    );
});

const RawPreviewRow = React.memo(function RawPreviewRow({
    effectivePreviewScope,
    handleInlineFootprintSave,
    handleInlineValueSave,
    item,
    index,
    previewFootprintDrafts,
    result,
    setPreviewFootprintDrafts,
    updatePreviewTargetsLocally,
}) {
    const rowKey = item._previewKey || `${item.reference}-${index}`;
    const draftKey = `raw:${item._previewKey || `${item.id}`}`;

    return (
        <TableRow key={rowKey}>
            {effectivePreviewScope === 'batch' && (
                <TableCell sx={compactWrapCellSx}>{item._bomLabel}</TableCell>
            )}
            <TableCell sx={compactCellSx}><strong>{item.reference}</strong></TableCell>
            <TableCell sx={compactCellSx}>{item.value_raw || '-'}</TableCell>
            <TableCell>
                <TextField
                    fullWidth
                    size="small"
                    sx={compactInputSx}
                    value={item.value_harmonized || ''}
                    placeholder={item.value_raw || 'Nom composant'}
                    onChange={(event) => {
                        updatePreviewTargetsLocally(
                            [buildPreviewTarget(item, result)],
                            'value_harmonized',
                            event.target.value,
                        );
                    }}
                    onBlur={(event) => handleInlineValueSave({ ...item, value_harmonized: event.target.value })}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.currentTarget.blur();
                        }
                    }}
                />
            </TableCell>
            <TableCell sx={compactCellSx}>{item.footprint_eagle || '-'}</TableCell>
            <TableCell>
                <TextField
                    fullWidth
                    size="small"
                    sx={compactInputSx}
                    value={getPreviewFootprintDraftValue(previewFootprintDrafts, draftKey, item.footprint_pnp || '')}
                    placeholder={item.footprint_eagle || 'PnP'}
                    onChange={(event) => {
                        setPreviewFootprintDrafts((current) => setPreviewFootprintDraft(current, draftKey, event.target.value));
                    }}
                    onBlur={async (event) => {
                        const nextValue = event.target.value;
                        await handleInlineFootprintSave({ ...item, footprint_pnp: nextValue });
                        setPreviewFootprintDrafts((current) => clearPreviewFootprintDraft(current, draftKey));
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.currentTarget.blur();
                        }
                    }}
                />
            </TableCell>
            <TableCell sx={compactCellSx}>{item.component_type || item.type || '-'}</TableCell>
            <TableCell sx={compactWrapCellSx}>
                {item.component_library_missing ? 'Absent de la base' : (item.component_library_name || 'Trouve')}
            </TableCell>
            <TableCell>{renderStatusChip(item)}</TableCell>
        </TableRow>
    );
});

function BomImportPreviewCard({
    effectivePreviewScope,
    previewMode,
    setPreviewMode,
    setPreviewScope,
    previewStatusFilter,
    setPreviewStatusFilter,
    previewSearch,
    setPreviewSearch,
    previewRows,
    paginatedItems,
    previewPage,
    setPreviewPage,
    previewRowsPerPage,
    setPreviewRowsPerPage,
    successfulBatchCount,
    result,
    previewFootprintDrafts,
    setPreviewFootprintDrafts,
    updatePreviewTargetsLocally,
    handleInlineFootprintSave,
    handleInlineValueSave,
    handleCompactGroupValueSave,
    handleCompactGroupFootprintSave,
}) {
    return (
        <Card>
            <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>Aperçu des composants importés</Typography>
                <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={12} md={3}>
                        <TextField
                            select
                            fullWidth
                            size="small"
                            label="Portee"
                            value={effectivePreviewScope}
                            onChange={(event) => setPreviewScope(event.target.value)}
                            disabled={successfulBatchCount <= 1}
                        >
                            <MenuItem value="selected">BOM sélectionnée</MenuItem>
                            <MenuItem value="batch" disabled={successfulBatchCount <= 1}>Tout le lot</MenuItem>
                        </TextField>
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <TextField
                            select
                            fullWidth
                            size="small"
                            label="Affichage"
                            value={previewMode}
                            onChange={(event) => setPreviewMode(event.target.value)}
                        >
                            <MenuItem value="raw">BOM brute</MenuItem>
                            <MenuItem value="compact">Version compacte</MenuItem>
                        </TextField>
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <TextField
                            select
                            fullWidth
                            size="small"
                            label="Filtre statut"
                            value={previewStatusFilter}
                            onChange={(event) => setPreviewStatusFilter(event.target.value)}
                        >
                            <MenuItem value="all">Tous</MenuItem>
                            <MenuItem value="missing-component">Base a completer</MenuItem>
                            <MenuItem value="missing-footprint">Footprint à mapper</MenuItem>
                            <MenuItem value="ready">Prets</MenuItem>
                            <MenuItem value="kept">Conserves</MenuItem>
                        </TextField>
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <TextField
                            fullWidth
                            size="small"
                            label="Recherche"
                            value={previewSearch}
                            onChange={(event) => setPreviewSearch(event.target.value)}
                            placeholder="Valeur, footprint, BOM, reference..."
                        />
                    </Grid>
                </Grid>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                    {previewMode === 'compact'
                        ? `${previewRows.length} groupe(s) affiche(s)`
                        : `${previewRows.length} ligne(s) affichée(s)`}
                </Typography>
                <TableContainer component={Paper} sx={compactTableContainerSx}>
                    <Table sx={compactTableSx}>
                        {previewMode === 'compact' ? (
                            <>
                                <TableHead sx={{ backgroundColor: 'background.default' }}>
                                    <TableRow>
                                        {effectivePreviewScope === 'batch' && <TableCell sx={{ width: '16%' }}><strong>BOM</strong></TableCell>}
                                        <TableCell sx={{ width: '10%' }}><strong>Occ.</strong></TableCell>
                                        <TableCell sx={{ width: '18%' }}><strong>Nom / Valeur</strong></TableCell>
                                        <TableCell sx={{ width: '14%' }}><strong>Footprint Eagle</strong></TableCell>
                                        <TableCell sx={{ width: '16%' }}><strong>Footprint PnP</strong></TableCell>
                                        <TableCell sx={{ width: '10%' }}><strong>Type</strong></TableCell>
                                        <TableCell sx={{ width: '14%' }}><strong>Base composants</strong></TableCell>
                                        <TableCell sx={{ width: '10%' }}><strong>Statut</strong></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {paginatedItems.map((group) => {
                                        return (
                                            <CompactPreviewRow
                                                key={group.key}
                                                effectivePreviewScope={effectivePreviewScope}
                                                group={group}
                                                handleCompactGroupFootprintSave={handleCompactGroupFootprintSave}
                                                handleCompactGroupValueSave={handleCompactGroupValueSave}
                                                previewFootprintDrafts={previewFootprintDrafts}
                                                setPreviewFootprintDrafts={setPreviewFootprintDrafts}
                                                updatePreviewTargetsLocally={updatePreviewTargetsLocally}
                                            />
                                        );
                                    })}
                                </TableBody>
                            </>
                        ) : (
                            <>
                                <TableHead sx={{ backgroundColor: 'background.default' }}>
                                    <TableRow>
                                        {effectivePreviewScope === 'batch' && <TableCell sx={{ width: '14%' }}><strong>BOM</strong></TableCell>}
                                        <TableCell sx={{ width: '10%' }}><strong>Référence</strong></TableCell>
                                        <TableCell sx={{ width: '14%' }}><strong>Valeur brute</strong></TableCell>
                                        <TableCell sx={{ width: '18%' }}><strong>Nom / Valeur</strong></TableCell>
                                        <TableCell sx={{ width: '14%' }}><strong>Footprint Eagle</strong></TableCell>
                                        <TableCell sx={{ width: '16%' }}><strong>Footprint PnP</strong></TableCell>
                                        <TableCell sx={{ width: '8%' }}><strong>Type</strong></TableCell>
                                        <TableCell sx={{ width: '10%' }}><strong>Base composants</strong></TableCell>
                                        <TableCell sx={{ width: '10%' }}><strong>Statut</strong></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {paginatedItems.map((item, index) => (
                                        <RawPreviewRow
                                            key={item._previewKey || `${item.reference}-${index}`}
                                            effectivePreviewScope={effectivePreviewScope}
                                            handleInlineFootprintSave={handleInlineFootprintSave}
                                            handleInlineValueSave={handleInlineValueSave}
                                            index={index}
                                            item={item}
                                            previewFootprintDrafts={previewFootprintDrafts}
                                            result={result}
                                            setPreviewFootprintDrafts={setPreviewFootprintDrafts}
                                            updatePreviewTargetsLocally={updatePreviewTargetsLocally}
                                        />
                                    ))}
                                </TableBody>
                            </>
                        )}
                    </Table>
                </TableContainer>
                <TablePagination
                    component="div"
                    count={previewRows.length}
                    page={previewPage}
                    onPageChange={(_event, nextPage) => setPreviewPage(nextPage)}
                    rowsPerPage={previewRowsPerPage}
                    onRowsPerPageChange={(event) => {
                        setPreviewRowsPerPage(parseInt(event.target.value, 10));
                        setPreviewPage(0);
                    }}
                    rowsPerPageOptions={[25, 50, 100]}
                    sx={compactPaginationSx}
                    labelRowsPerPage="Lignes"
                />
            </CardContent>
        </Card>
    );
}

export default BomImportPreviewCard;
