import React from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Grid,
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
    Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import {
    compactCellSx,
    compactInputSx,
    compactPaginationSx,
    compactTableContainerSx,
    compactTableSx,
} from '../../utils/compactTable';

const WorkspaceSessionRow = React.memo(function WorkspaceSessionRow({
    handleBatchResultFieldChange,
    handleDeleteImportedBom,
    handleDraftFieldChange,
    handleDraftRowRemove,
    handlePersistBatchMetadata,
    result,
    row,
    rowActionState,
    rowKey,
    selectBatchResult,
}) {
    const selected = result?.bom_revision_id
        ? row.bom_revision_id === result.bom_revision_id
        : row.file_name === result?.file_name;
    const rowBusy = rowActionState.key === rowKey;

    return (
        <TableRow
            hover={row.isImported}
            selected={selected}
            onClick={() => {
                if (row.isImported) {
                    selectBatchResult(row);
                }
            }}
            role={row.isImported ? 'button' : undefined}
            tabIndex={row.isImported ? 0 : undefined}
            aria-pressed={row.isImported ? selected : undefined}
            onKeyDown={(e) => { if (row.isImported && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectBatchResult(row); } }}
            sx={{ cursor: row.isImported ? 'pointer' : 'default' }}
        >
            <TableCell sx={compactCellSx}>{row.file_name}</TableCell>
            <TableCell>
                <TextField
                    fullWidth
                    size="small"
                    sx={compactInputSx}
                    value={row.category || ''}
                    placeholder="Ex: AMPLI"
                    aria-label={`Catégorie ${row.file_name}`}
                    onChange={(event) => (
                        row.isImported
                            ? handleBatchResultFieldChange(rowKey, 'category', event.target.value)
                            : handleDraftFieldChange(row.row_key, 'category', event.target.value)
                    )}
                />
            </TableCell>
            <TableCell>
                <TextField
                    fullWidth
                    size="small"
                    sx={compactInputSx}
                    value={row.reference}
                    aria-label={`Référence ${row.file_name}`}
                    onChange={(event) => (
                        row.isImported
                            ? handleBatchResultFieldChange(rowKey, 'reference', event.target.value)
                            : handleDraftFieldChange(row.row_key, 'reference', event.target.value)
                    )}
                />
            </TableCell>
            <TableCell>
                <TextField
                    fullWidth
                    size="small"
                    sx={compactInputSx}
                    value={row.name || ''}
                    placeholder="Ex: Ampli Gen6"
                    aria-label={`Nom ${row.file_name}`}
                    onChange={(event) => (
                        row.isImported
                            ? handleBatchResultFieldChange(rowKey, 'name', event.target.value)
                            : handleDraftFieldChange(row.row_key, 'name', event.target.value)
                    )}
                />
            </TableCell>
            <TableCell>
                <TextField
                    select
                    fullWidth
                    size="small"
                    sx={compactInputSx}
                    value={row.card_type || 'SIMPLE'}
                    aria-label={`Type ${row.file_name}`}
                    onChange={(event) => (
                        row.isImported
                            ? handleBatchResultFieldChange(rowKey, 'card_type', event.target.value)
                            : handleDraftFieldChange(row.row_key, 'card_type', event.target.value)
                    )}
                >
                    <MenuItem value="SIMPLE">Simple</MenuItem>
                    <MenuItem value="ASSEMBLY">Assemblage</MenuItem>
                </TextField>
            </TableCell>
            <TableCell>
                <TextField
                    fullWidth
                    size="small"
                    sx={compactInputSx}
                    value={row.revision}
                    aria-label={`Révision ${row.file_name}`}
                    onChange={(event) => (
                        row.isImported
                            ? handleBatchResultFieldChange(rowKey, 'revision', event.target.value)
                            : handleDraftFieldChange(row.row_key, 'revision', event.target.value)
                    )}
                />
            </TableCell>
            <TableCell>
                {row.isImported ? (
                    <Typography variant="body2" sx={{ color: '#f4f4f5', fontWeight: 500 }}>
                        {row.side}
                    </Typography>
                ) : (
                    <TextField
                        select
                        fullWidth
                        size="small"
                        sx={compactInputSx}
                        value={row.side}
                        aria-label={`Face ${row.file_name}`}
                        onChange={(event) => (
                            handleDraftFieldChange(row.row_key, 'side', event.target.value)
                        )}
                    >
                        <MenuItem value="TOP">TOP</MenuItem>
                        <MenuItem value="BOT">BOT</MenuItem>
                    </TextField>
                )}
            </TableCell>
            <TableCell sx={compactCellSx}>{row.item_count || 0}</TableCell>
            <TableCell sx={compactCellSx}>
                {row.isImported ? (row.success ? 'Importée' : 'Erreur') : 'À préparer'}
            </TableCell>
            <TableCell>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {row.isImported ? (
                        <>
                            <Button
                                size="small"
                                variant="text"
                                disabled={!row.success || rowBusy}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handlePersistBatchMetadata(row);
                                }}
                            >
                                {rowBusy && rowActionState.action === 'save-meta' ? 'Sauvegarde...' : 'Sauver'}
                            </Button>
                            <Button
                                size="small"
                                color="error"
                                variant="text"
                                disabled={rowBusy}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleDeleteImportedBom(row);
                                }}
                            >
                                {rowBusy && rowActionState.action === 'delete' ? 'Suppression...' : 'Supprimer'}
                            </Button>
                        </>
                    ) : (
                        <Button color="error" size="small" variant="text" onClick={() => handleDraftRowRemove(row.row_key)}>
                            Retirer
                        </Button>
                    )}
                </Box>
            </TableCell>
        </TableRow>
    );
});

function BomImportWorkspaceCard({
    dragActive,
    handleDrag,
    handleDrop,
    handleFileChange,
    uploadSummaryLabel,
    uploadSummaryMeta,
    hasFiles,
    isBatchMode,
    sessionRows,
    paginatedSessionRows,
    sessionPage,
    sessionRowsPerPage,
    setSessionPage,
    setSessionRowsPerPage,
    result,
    rowActionState,
    handleBatchResultFieldChange,
    handleDraftFieldChange,
    selectBatchResult,
    handlePersistBatchMetadata,
    handleDeleteImportedBom,
    handleDraftRowRemove,
    hasWorkspaceContent,
    handleClear,
    handleUpload,
    loading,
    showVisualizationAction,
    handleOpenVisualization,
    reviewNavigationLoading,
}) {
    return (
        <Card sx={{ mb: 3 }}>
            <CardContent>
                <Box
                    className={`upload-area compact ${dragActive ? 'active' : ''}`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                >
                    <input
                        id="file-input"
                        type="file"
                        accept=".txt"
                        multiple
                        onClick={(e) => { e.currentTarget.value = ''; }}
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                    />
                    <Grid container spacing={1.5} alignItems="center">
                        <Grid item xs={12} md>
                            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                                <Box className="upload-area-icon">
                                    <CloudUploadIcon sx={{ fontSize: 22, color: '#10b981' }} />
                                </Box>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="subtitle1" sx={{ color: '#f4f4f5', fontWeight: 600 }}>
                                        Import des fichiers BOM
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#a1a1aa', display: 'block' }}>
                                        Glisse-dépose tes exports Eagle ou charge-les via le bouton.
                                    </Typography>
                                </Box>
                            </Stack>
                        </Grid>
                        <Grid item xs={12} md="auto">
                            <label htmlFor="file-input">
                                <Button
                                    variant="contained"
                                    component="span"
                                    size="small"
                                    startIcon={<CloudUploadIcon />}
                                    sx={{ textTransform: 'none' }}
                                >
                                    Choisir fichier(s)
                                </Button>
                            </label>
                        </Grid>
                        <Grid item xs={12}>
                            <Box className="upload-summary">
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography variant="body2" sx={{ color: '#f4f4f5', fontWeight: 500 }}>
                                        {uploadSummaryLabel}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#71717a' }}>
                                        {uploadSummaryMeta}
                                    </Typography>
                                </Box>
                                <Chip
                                    size="small"
                                    label={hasFiles ? (isBatchMode ? 'Lot' : 'Unitaire') : 'Prêt'}
                                    sx={{
                                        backgroundColor: hasFiles ? 'rgba(16,185,129,0.14)' : 'rgba(63,63,70,0.7)',
                                        color: hasFiles ? '#10b981' : '#d4d4d8',
                                        border: '1px solid',
                                        borderColor: hasFiles ? 'rgba(16,185,129,0.35)' : '#3f3f46',
                                    }}
                                />
                            </Box>
                        </Grid>
                    </Grid>
                </Box>

                <Accordion
                    disableGutters
                    elevation={0}
                    sx={{
                        mt: 1.5,
                        backgroundColor: 'transparent',
                        '&::before': { display: 'none' },
                    }}
                >
                    <AccordionSummary
                        expandIcon={<ExpandMoreRoundedIcon sx={{ color: '#71717a' }} />}
                        sx={{
                            px: 0.5,
                            minHeight: 34,
                            '& .MuiAccordionSummary-content': {
                                my: 0.5,
                            },
                        }}
                    >
                        <Typography variant="caption" sx={{ color: '#71717a', fontWeight: 600 }}>
                            Aide à l'import
                        </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 0.5, pt: 0, pb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: '#71717a', display: 'block' }}>
                            Tu peux importer une seule BOM ou un lot complet. Le logiciel détecte automatiquement la face depuis le nom du fichier quand le suffixe finit par `_TOP` ou `_BOT`.
                        </Typography>
                    </AccordionDetails>
                </Accordion>

                {sessionRows.length > 0 && (
                    <Card sx={{ mt: 3 }}>
                        <CardContent>
                            <Typography variant="h6" sx={{ mb: 2 }}>
                                Session BOM
                            </Typography>
                            <TableContainer sx={compactTableContainerSx}>
                                <Table sx={compactTableSx}>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ width: '15%' }}>Fichier</TableCell>
                                            <TableCell sx={{ width: '12%' }}>Catégorie</TableCell>
                                            <TableCell sx={{ width: '14%' }}>Référence</TableCell>
                                            <TableCell sx={{ width: '14%' }}>Nom</TableCell>
                                            <TableCell sx={{ width: '9%' }}>Type</TableCell>
                                            <TableCell sx={{ width: '9%' }}>Révision</TableCell>
                                            <TableCell sx={{ width: '6%' }}>Face</TableCell>
                                            <TableCell sx={{ width: '5%' }}>Lignes</TableCell>
                                            <TableCell sx={{ width: '9%' }}>État</TableCell>
                                            <TableCell sx={{ width: '7%' }}>Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {paginatedSessionRows.map((row, index) => {
                                            const rowKey = row.row_key || row.bom_revision_id || `${row.file_name}-${index}`;

                                            return (
                                                <WorkspaceSessionRow
                                                    key={rowKey}
                                                    handleBatchResultFieldChange={handleBatchResultFieldChange}
                                                    handleDeleteImportedBom={handleDeleteImportedBom}
                                                    handleDraftFieldChange={handleDraftFieldChange}
                                                    handleDraftRowRemove={handleDraftRowRemove}
                                                    handlePersistBatchMetadata={handlePersistBatchMetadata}
                                                    result={result}
                                                    row={row}
                                                    rowActionState={rowActionState}
                                                    rowKey={rowKey}
                                                    selectBatchResult={selectBatchResult}
                                                />
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            <TablePagination
                                component="div"
                                count={sessionRows.length}
                                page={sessionPage}
                                onPageChange={(_event, nextPage) => setSessionPage(nextPage)}
                                rowsPerPage={sessionRowsPerPage}
                                onRowsPerPageChange={(event) => {
                                    setSessionRowsPerPage(parseInt(event.target.value, 10));
                                    setSessionPage(0);
                                }}
                                rowsPerPageOptions={[25, 50, 100]}
                                sx={compactPaginationSx}
                                labelRowsPerPage="Lignes"
                            />
                        </CardContent>
                    </Card>
                )}

                <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {hasWorkspaceContent && (
                        <Button variant="outlined" size="small" onClick={handleClear} startIcon={<DeleteIcon />}>
                            Réinitialiser
                        </Button>
                    )}
                    <Button variant="contained" onClick={handleUpload} disabled={!hasFiles || loading} sx={{ textTransform: 'none' }}>
                        {loading ? <CircularProgress size={24} sx={{ mr: 1 }} /> : null}
                        {loading ? 'Traitement...' : (isBatchMode ? 'Importer le lot' : 'Importer')}
                    </Button>
                    {showVisualizationAction && result?.success && (
                        <Button
                            variant="outlined"
                            onClick={handleOpenVisualization}
                            startIcon={<ArrowForwardRoundedIcon />}
                            disabled={reviewNavigationLoading}
                        >
                            {reviewNavigationLoading ? 'Sauvegarde...' : 'Passer à la revue'}
                        </Button>
                    )}
                </Box>
            </CardContent>
        </Card>
    );
}

export default BomImportWorkspaceCard;

