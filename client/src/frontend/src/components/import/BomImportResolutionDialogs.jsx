import React from 'react';
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    List,
    ListItem,
    ListItemText,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { compactCellSx, compactInputSx, compactTableSx, compactWrapCellSx } from '../../utils/compactTable';

function BomImportResolutionDialogs(props) {
    const {
        result,
        isBatchResolutionMode,
        currentMissingComponentGroup,
        componentResolutionPaused,
        componentResolutionLoading,
        updateWorkspace,
        componentResolutionName,
        setComponentResolutionName,
        componentResolutionError,
        handleResolveMissingComponents,
        missingComponentGroups,
        currentMissingFootprintGroup,
        footprintResolutionPaused,
        footprintResolutionLoading,
        footprintResolutionValue,
        setFootprintResolutionValue,
        footprintResolutionError,
        handleResolveMissingFootprints,
        batchComponentResolutionPaused,
        batchMissingComponentGroups,
        pauseBatchResolution,
        componentBatchDrafts,
        setComponentBatchDrafts,
        handleDeleteBatchMissingComponentGroup,
        handleResolveBatchMissingComponents,
        currentBatchMissingComponentGroup,
        batchFootprintResolutionPaused,
        currentBatchMissingFootprintGroup,
        batchMissingFootprintGroups,
        footprintBatchDrafts,
        setFootprintBatchDrafts,
        handleResolveBatchMissingFootprints,
    } = props;

    return (
        <>
            <Dialog
                open={Boolean(result && !isBatchResolutionMode && currentMissingComponentGroup && !componentResolutionPaused)}
                fullWidth
                maxWidth="sm"
                onClose={() => {
                    if (!componentResolutionLoading) {
                        updateWorkspace((current) => ({ ...current, componentResolutionPaused: true }));
                    }
                }}
            >
                <DialogTitle>Composant absent de la base</DialogTitle>
                {currentMissingComponentGroup && (
                    <>
                        <DialogContent dividers>
                            <Typography variant="body2" sx={{ mb: 2 }}>
                                Ce composant n'est pas encore répertorié dans la base. Tu peux accepter le nom proposé, le modifier, ou supprimer toutes les lignes correspondantes de cette BOM.
                            </Typography>
                            <Grid container spacing={2} sx={{ mb: 2 }}>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="body2" sx={{ color: '#666' }}>Valeur : <strong>{currentMissingComponentGroup.componentValue}</strong></Typography>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="body2" sx={{ color: '#666' }}>Type : <strong>{currentMissingComponentGroup.componentType}</strong></Typography>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="body2" sx={{ color: '#666' }}>Footprint Eagle : <strong>{currentMissingComponentGroup.footprintEagle || '-'}</strong></Typography>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="body2" sx={{ color: '#666' }}>Footprint PnP : <strong>{currentMissingComponentGroup.footprintPnp || '-'}</strong></Typography>
                                </Grid>
                            </Grid>
                            <TextField
                                autoFocus
                                fullWidth
                                label="Nom du composant"
                                value={componentResolutionName}
                                onChange={(event) => setComponentResolutionName(event.target.value)}
                                helperText="Ce nom sera enregistré dans la colonne Value de la base composants. La colonne MPN reste libre pour les données fournisseur."
                            />
                            <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                                Références concernées ({currentMissingComponentGroup.itemIds.length})
                            </Typography>
                            <Paper variant="outlined" sx={{ maxHeight: 180, overflowY: 'auto' }}>
                                <List dense disablePadding>
                                    {currentMissingComponentGroup.references.map((reference) => (
                                        <ListItem key={reference} divider>
                                            <ListItemText primary={reference} />
                                        </ListItem>
                                    ))}
                                </List>
                            </Paper>
                            {componentResolutionError && <Alert severity="error" sx={{ mt: 2 }}>{componentResolutionError}</Alert>}
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => updateWorkspace((current) => ({ ...current, componentResolutionPaused: true }))} disabled={componentResolutionLoading}>Plus tard</Button>
                            <Button color="error" onClick={() => handleResolveMissingComponents('delete')} disabled={componentResolutionLoading}>Supprimer de la BOM</Button>
                            <Button variant="contained" onClick={() => handleResolveMissingComponents('register')} disabled={componentResolutionLoading}>
                                {componentResolutionLoading ? 'Enregistrement...' : 'Enregistrer dans la base'}
                            </Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>

            <Dialog
                open={Boolean(result && !isBatchResolutionMode && missingComponentGroups.length === 0 && currentMissingFootprintGroup && !footprintResolutionPaused)}
                fullWidth
                maxWidth="sm"
                onClose={() => {
                    if (!footprintResolutionLoading) {
                        updateWorkspace((current) => ({
                            ...current,
                            footprintResolutionPaused: true,
                            pendingFootprintPrompt: false,
                        }));
                    }
                }}
            >
                <DialogTitle>Footprint PnP inconnu</DialogTitle>
                {currentMissingFootprintGroup && (
                    <>
                        <DialogContent dividers>
                            <Typography variant="body2" sx={{ mb: 2 }}>
                                Cette empreinte Eagle n'a pas encore de correspondance PnP en base. Tu peux la saisir maintenant pour la mémoriser et l'appliquer à toutes les lignes concernées.
                            </Typography>
                            <Grid container spacing={2} sx={{ mb: 2 }}>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="body2" sx={{ color: '#666' }}>Footprint Eagle : <strong>{currentMissingFootprintGroup.footprintEagle}</strong></Typography>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="body2" sx={{ color: '#666' }}>Lignes concernées : <strong>{currentMissingFootprintGroup.itemIds.length}</strong></Typography>
                                </Grid>
                            </Grid>
                            <TextField
                                autoFocus
                                fullWidth
                                label="Footprint PnP"
                                value={footprintResolutionValue}
                                onChange={(event) => setFootprintResolutionValue(event.target.value)}
                                helperText="Le mapping Eagle -> PnP sera enregistré dans la base et réutilisable aux prochains imports."
                            />
                            <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                                Références concernées ({currentMissingFootprintGroup.itemIds.length})
                            </Typography>
                            <Paper variant="outlined" sx={{ maxHeight: 180, overflowY: 'auto' }}>
                                <List dense disablePadding>
                                    {currentMissingFootprintGroup.references.map((reference) => (
                                        <ListItem key={reference} divider>
                                            <ListItemText primary={reference} />
                                        </ListItem>
                                    ))}
                                </List>
                            </Paper>
                            {footprintResolutionError && <Alert severity="error" sx={{ mt: 2 }}>{footprintResolutionError}</Alert>}
                        </DialogContent>
                        <DialogActions>
                            <Button
                                onClick={() => updateWorkspace((current) => ({
                                    ...current,
                                    footprintResolutionPaused: true,
                                    pendingFootprintPrompt: false,
                                }))}
                                disabled={footprintResolutionLoading}
                            >
                                Plus tard
                            </Button>
                            <Button variant="contained" onClick={handleResolveMissingFootprints} disabled={footprintResolutionLoading}>
                                {footprintResolutionLoading ? 'Enregistrement...' : 'Enregistrer le mapping'}
                            </Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>

            <Dialog
                open={Boolean(isBatchResolutionMode && currentBatchMissingComponentGroup && !batchComponentResolutionPaused)}
                fullWidth
                maxWidth="lg"
                onClose={() => {
                    if (!componentResolutionLoading) {
                        pauseBatchResolution();
                    }
                }}
            >
                <DialogTitle>Correction du lot - composants absents</DialogTitle>
                {batchMissingComponentGroups.length > 0 && (
                    <>
                        <DialogContent dividers>
                            <Typography variant="body2" sx={{ mb: 2 }}>
                                Renseigne ici toute la liste des composants absents du lot. Chaque ligne remplie sera enregistrée dans la base composants, puis toutes les BOM concernées seront rechargées automatiquement.
                            </Typography>
                            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420 }}>
                                <Table sx={compactTableSx}>
                                    <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                                        <TableRow>
                                            <TableCell sx={{ width: '24%' }}><strong>Valeur détectée</strong></TableCell>
                                            <TableCell sx={{ width: '16%' }}><strong>Type</strong></TableCell>
                                            <TableCell sx={{ width: '18%' }}><strong>Footprint Eagle</strong></TableCell>
                                            <TableCell sx={{ width: '12%' }}><strong>BOM</strong></TableCell>
                                            <TableCell sx={{ width: '12%' }}><strong>Occurrences</strong></TableCell>
                                            <TableCell sx={{ width: '12%' }}><strong>Nom à enregistrer</strong></TableCell>
                                            <TableCell sx={{ width: '6%' }}><strong>Action</strong></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {batchMissingComponentGroups.map((group, index) => (
                                            <TableRow key={group.key}>
                                                <TableCell sx={compactWrapCellSx}>{group.componentValue}</TableCell>
                                                <TableCell sx={compactCellSx}>{group.componentType}</TableCell>
                                                <TableCell sx={compactCellSx}>{group.footprintEagle || '-'}</TableCell>
                                                <TableCell sx={compactCellSx}>{group.revisionGroups.length}</TableCell>
                                                <TableCell sx={compactCellSx}>{group.totalItemCount}</TableCell>
                                                <TableCell>
                                                    <TextField
                                                        autoFocus={index === 0}
                                                        fullWidth
                                                        size="small"
                                                        sx={compactInputSx}
                                                        value={componentBatchDrafts[group.key] || ''}
                                                        onChange={(event) => setComponentBatchDrafts((current) => ({
                                                            ...current,
                                                            [group.key]: event.target.value,
                                                        }))}
                                                        placeholder={group.proposedComponentName || group.componentValue}
                                                    />
                                                </TableCell>
                                                <TableCell sx={compactCellSx}>
                                                    <Button
                                                        size="small"
                                                        color="error"
                                                        variant="text"
                                                        startIcon={<DeleteIcon />}
                                                        disabled={componentResolutionLoading}
                                                        onClick={() => handleDeleteBatchMissingComponentGroup(group)}
                                                        sx={{ minWidth: 0, px: 0.5 }}
                                                        aria-label={`Supprimer ${group.componentValue} de toutes les BOM concernées`}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            {componentResolutionError && <Alert severity="error" sx={{ mt: 2 }}>{componentResolutionError}</Alert>}
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={pauseBatchResolution} disabled={componentResolutionLoading}>Plus tard</Button>
                            <Button variant="contained" onClick={handleResolveBatchMissingComponents} disabled={componentResolutionLoading}>
                                {componentResolutionLoading ? 'Enregistrement...' : 'Enregistrer la liste'}
                            </Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>

            <Dialog
                open={Boolean(
                    isBatchResolutionMode
                    && batchMissingComponentGroups.length === 0
                    && currentBatchMissingFootprintGroup
                    && !batchFootprintResolutionPaused
                )}
                fullWidth
                maxWidth="lg"
                onClose={() => {
                    if (!footprintResolutionLoading) {
                        pauseBatchResolution();
                    }
                }}
            >
                <DialogTitle>Correction du lot - footprints PnP</DialogTitle>
                {batchMissingFootprintGroups.length > 0 && (
                    <>
                        <DialogContent dividers>
                            <Typography variant="body2" sx={{ mb: 2 }}>
                                Renseigne ici toute la liste des footprints PnP manquants du lot. Chaque ligne remplie alimentera la base, puis le lot sera rechargé automatiquement.
                            </Typography>
                            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420 }}>
                                <Table sx={compactTableSx}>
                                    <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                                        <TableRow>
                                            <TableCell sx={{ width: '28%' }}><strong>Footprint Eagle</strong></TableCell>
                                            <TableCell sx={{ width: '14%' }}><strong>BOM</strong></TableCell>
                                            <TableCell sx={{ width: '14%' }}><strong>Occurrences</strong></TableCell>
                                            <TableCell sx={{ width: '44%' }}><strong>Footprint PnP à enregistrer</strong></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {batchMissingFootprintGroups.map((group, index) => (
                                            <TableRow key={group.key}>
                                                <TableCell sx={compactCellSx}>{group.footprintEagle}</TableCell>
                                                <TableCell sx={compactCellSx}>{group.revisionGroups.length}</TableCell>
                                                <TableCell sx={compactCellSx}>{group.totalItemCount}</TableCell>
                                                <TableCell>
                                                    <TextField
                                                        autoFocus={index === 0}
                                                        fullWidth
                                                        size="small"
                                                        sx={compactInputSx}
                                                        value={footprintBatchDrafts[group.key] || ''}
                                                        onChange={(event) => setFootprintBatchDrafts((current) => ({
                                                            ...current,
                                                            [group.key]: event.target.value,
                                                        }))}
                                                        placeholder={group.footprintEagle}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            {footprintResolutionError && <Alert severity="error" sx={{ mt: 2 }}>{footprintResolutionError}</Alert>}
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={pauseBatchResolution} disabled={footprintResolutionLoading}>Plus tard</Button>
                            <Button variant="contained" onClick={handleResolveBatchMissingFootprints} disabled={footprintResolutionLoading}>
                                {footprintResolutionLoading ? 'Enregistrement...' : 'Enregistrer la liste'}
                            </Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>
        </>
    );
}

export default BomImportResolutionDialogs;
