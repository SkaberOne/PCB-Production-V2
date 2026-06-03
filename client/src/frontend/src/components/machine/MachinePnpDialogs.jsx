import React from 'react';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import {
    Alert,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Menu,
    MenuItem,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import {
    cartKindOptions,
    formatDecimal,
    getMachineAssignmentDisplayQuantities,
    getMachineAssignmentPalette,
    getMachineAssignmentTypeLabel,
} from '../../utils/machinePnp';

export function MachinePnpCrudDialogs({
    machineDialogOpen,
    editingMachine,
    resetMachineDialog,
    machineDialogError,
    feederDialogError,
    cartDialogError,
    machineForm,
    setMachineForm,
    handleCreateMachine,
    actionLoading,
    feederDialogOpen,
    resetFeederDialog,
    feederForm,
    setFeederForm,
    handleCreateFeeder,
    cartDialogOpen,
    resetCartDialog,
    cartForm,
    setCartForm,
    bomCatégoriesLoading,
    cartCategoryOptions,
    bomCatégoriesError,
    handleCreateCart,
}) {
    return (
        <>
            <Dialog open={machineDialogOpen} onClose={resetMachineDialog} maxWidth="sm" fullWidth>
                <DialogTitle>{editingMachine ? 'Modifier la machine PnP' : 'Créer une machine PnP'}</DialogTitle>
                <DialogContent sx={{ pt: '12px !important' }}>
                    <Stack spacing={2}>
                        {machineDialogError ? <Alert severity="error">{machineDialogError}</Alert> : null}
                        <TextField
                            label="Nom de la machine"
                            value={machineForm.name}
                            onChange={(event) => setMachineForm((current) => ({ ...current, name: event.target.value }))}
                            fullWidth
                        />
                        <TextField
                            label="Nombre total de positions"
                            type="number"
                            value={machineForm.num_positions}
                            onChange={(event) => setMachineForm((current) => ({ ...current, num_positions: event.target.value }))}
                            fullWidth
                            inputProps={{ min: 1, max: 200, step: 1 }}
                            helperText="Entier entre 1 et 200."
                        />
                        <TextField
                            label="Description"
                            value={machineForm.description}
                            onChange={(event) => setMachineForm((current) => ({ ...current, description: event.target.value }))}
                            fullWidth
                            multiline
                            minRows={2}
                        />
                        <TextField
                            label="Notes"
                            value={machineForm.notes}
                            onChange={(event) => setMachineForm((current) => ({ ...current, notes: event.target.value }))}
                            fullWidth
                            multiline
                            minRows={2}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={resetMachineDialog}>Annuler</Button>
                    <Button
                        variant="contained"
                        onClick={handleCreateMachine}
                        disabled={actionLoading === 'create-machine' || actionLoading === `update-machine-${editingMachine?.id}`}
                    >
                        {editingMachine ? 'Mettre a jour' : 'Créer'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={feederDialogOpen} onClose={resetFeederDialog} maxWidth="sm" fullWidth>
                <DialogTitle>Créer un type de feeder</DialogTitle>
                <DialogContent sx={{ pt: '12px !important' }}>
                    <Stack spacing={2}>
                        {feederDialogError ? <Alert severity="error">{feederDialogError}</Alert> : null}
                        <TextField
                            label="Largeur (mm)"
                            type="number"
                            value={feederForm.size_mm}
                            onChange={(event) => setFeederForm((current) => ({ ...current, size_mm: event.target.value }))}
                            fullWidth
                            inputProps={{ min: 1, max: 100, step: 1 }}
                            helperText="Entier entre 1 et 100."
                        />
                        <TextField
                            label="Capacité indicative"
                            type="number"
                            value={feederForm.capacity}
                            onChange={(event) => setFeederForm((current) => ({ ...current, capacity: event.target.value }))}
                            fullWidth
                            placeholder="Optionnel"
                            inputProps={{ min: 1, step: 1 }}
                            helperText="Optionnel. Laisse vide si inconnu."
                        />
                        <TextField
                            label="Description"
                            value={feederForm.description}
                            onChange={(event) => setFeederForm((current) => ({ ...current, description: event.target.value }))}
                            fullWidth
                            multiline
                            minRows={2}
                        />
                        <TextField
                            label="Notes"
                            value={feederForm.notes}
                            onChange={(event) => setFeederForm((current) => ({ ...current, notes: event.target.value }))}
                            fullWidth
                            multiline
                            minRows={2}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={resetFeederDialog}>Annuler</Button>
                    <Button variant="contained" onClick={handleCreateFeeder} disabled={actionLoading === 'create-feeder'}>
                        Créer
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={cartDialogOpen} onClose={resetCartDialog} maxWidth="sm" fullWidth>
                <DialogTitle>Créer un chariot logique</DialogTitle>
                <DialogContent sx={{ pt: '12px !important' }}>
                    <Stack spacing={2}>
                        {cartDialogError ? <Alert severity="error">{cartDialogError}</Alert> : null}
                        <TextField
                            label="Nom du chariot"
                            value={cartForm.name}
                            onChange={(event) => setCartForm((current) => ({ ...current, name: event.target.value }))}
                            fullWidth
                        />
                        <TextField
                            select
                            label="Type de chariot"
                            value={cartForm.kind}
                            onChange={(event) => setCartForm((current) => ({
                                ...current,
                                kind: event.target.value,
                                target_category: event.target.value === 'CATEGORY' ? current.target_category : '',
                            }))}
                            fullWidth
                        >
                            {cartKindOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>
                                    {option.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        {cartForm.kind === 'CATEGORY' ? (
                            <TextField
                                select
                                label="Catégorie cible"
                                value={cartForm.target_category}
                                onChange={(event) => setCartForm((current) => ({ ...current, target_category: event.target.value }))}
                                fullWidth
                                disabled={bomCatégoriesLoading || !cartCategoryOptions.length}
                                helperText={
                                    bomCatégoriesLoading
                                        ? 'Chargement des catégories BOM disponibles...'
                                        : bomCatégoriesError
                                            ? bomCatégoriesError
                                            : cartCategoryOptions.length
                                                ? 'Choisis une catégorie BOM ou l'option "Composant commun" réservée aux feeders fixes.'
                                                : 'Aucune catégorie BOM disponible pour le moment.'
                                }
                            >
                                <MenuItem value="">
                                    <em>Sélectionner une catégorie</em>
                                </MenuItem>
                                {cartCategoryOptions.map((category) => (
                                    <MenuItem key={category.name} value={category.name}>
                                        {category.label || category.name}
                                        {category.isCommonFixedFeederOption
                                            ? ` · ${category.reference_count || 0} feeder(s) fixe(s)`
                                            : (category.reference_count ? ` · ${category.reference_count} ref.` : '')}
                                    </MenuItem>
                                ))}
                            </TextField>
                        ) : null}
                        <TextField
                            label="Capacité du chariot"
                            type="number"
                            value={cartForm.capacity_positions}
                            onChange={(event) => setCartForm((current) => ({ ...current, capacity_positions: event.target.value }))}
                            fullWidth
                            inputProps={{ min: 1, max: 500, step: 1 }}
                            helperText="Entier entre 1 et 500."
                        />
                        <TextField
                            label="Description"
                            value={cartForm.description}
                            onChange={(event) => setCartForm((current) => ({ ...current, description: event.target.value }))}
                            fullWidth
                            multiline
                            minRows={2}
                        />
                        <TextField
                            label="Notes"
                            value={cartForm.notes}
                            onChange={(event) => setCartForm((current) => ({ ...current, notes: event.target.value }))}
                            fullWidth
                            multiline
                            minRows={2}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={resetCartDialog}>Annuler</Button>
                    <Button variant="contained" onClick={handleCreateCart} disabled={actionLoading === 'create-cart'}>
                        Créer
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

export function MachinePnpAuxOverlays({
    selectedMachineSlot,
    setSelectedMachineSlotPosition,
    selectedMachineBomRevision,
    selectedMachineBomPlannedBoardQuantity,
    machineContextMenu,
    closeMachineContextMenu,
    openMachineConfigDialog,
    openMachineEditDialog,
    deleteDialog,
    setDeleteDialog,
    machineDeletePlanCount,
    cartLinkedComponents,
    handleDelete,
    actionLoading,
}) {
    return (
        <>
            <Dialog
                open={Boolean(selectedMachineSlot)}
                onClose={() => setSelectedMachineSlotPosition(null)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    {selectedMachineSlot?.assignment
                        ? `Détail emplacement feeder · Slot ${selectedMachineSlot.assignment.slot_start}${selectedMachineSlot.assignment.slot_end !== selectedMachineSlot.assignment.slot_start ? `-${selectedMachineSlot.assignment.slot_end}` : ''}`
                        : `Détail emplacement feeder · Slot ${selectedMachineSlot?.position || ''}`}
                </DialogTitle>
                <DialogContent sx={{ pt: '12px !important' }}>
                    {selectedMachineSlot ? (
                        <Stack spacing={1.5}>
                            {selectedMachineSlot.assignment ? (
                                (() => {
                                    const assignmentPalette = getMachineAssignmentPalette(selectedMachineSlot.assignment);
                                    const quantityDisplay = getMachineAssignmentDisplayQuantities(
                                        selectedMachineSlot.assignment,
                                        selectedMachineBomRevision,
                                        selectedMachineBomPlannedBoardQuantity,
                                    );

                                    return (
                                        <>
                                            <Typography variant="body1" sx={{ color: '#f4f4f5', fontWeight: 700 }}>
                                                {selectedMachineSlot.assignment.component_label}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                                                {selectedMachineSlot.assignment.component_reference || '--'}
                                                {selectedMachineSlot.assignment.feeder_type
                                                    ? ` · feeder ${selectedMachineSlot.assignment.feeder_type}`
                                                    : (
                                                        selectedMachineSlot.assignment.feeder_size_mm
                                                            ? ` · feeder ${selectedMachineSlot.assignment.feeder_size_mm} mm`
                                                            : ''
                                                    )}
                                                {selectedMachineSlot.assignment.footprint_pnp
                                                    ? ` · footprint ${selectedMachineSlot.assignment.footprint_pnp}`
                                                    : ''}
                                            </Typography>
                                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                <Chip
                                                    size="small"
                                                    label={getMachineAssignmentTypeLabel(selectedMachineSlot.assignment)}
                                                    sx={{
                                                        backgroundColor: assignmentPalette.chipBackground,
                                                        color: assignmentPalette.chipColor,
                                                        border: `1px solid ${assignmentPalette.chipBorder}`,
                                                    }}
                                                />
                                                <Chip
                                                    size="small"
                                                    label={`${selectedMachineSlot.assignment.bom_presence_count || 0} BOM`}
                                                    sx={{ backgroundColor: 'rgba(161,161,170,0.12)', color: '#d4d4d8' }}
                                                />
                                                <Chip
                                                    size="small"
                                                    label={`${quantityDisplay.totalChipLabel} ${formatDecimal(quantityDisplay.totalQuantity || 0)}`}
                                                    sx={{ backgroundColor: 'rgba(134,239,172,0.12)', color: '#bbf7d0' }}
                                                />
                                                <Chip
                                                    size="small"
                                                    label={`${quantityDisplay.perBoardChipLabel} ${formatDecimal(quantityDisplay.perBoardQuantity || 0)}`}
                                                    sx={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#bae6fd' }}
                                                />
                                            </Stack>
                                            <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                                                {selectedMachineBomRevision
                                                    ? `La popup affiche ici la quantite du composant pour la BOM selectionnee (${selectedMachineBomPlannedBoardQuantity || 0} carte(s)).`
                                                    : 'Prod. = quantite totale requise pour toute la production. / carte = quantite moyenne posee pour une carte.'}
                                            </Typography>
                                            {selectedMachineSlot.assignment.bom_labels?.length ? (
                                                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                                    {selectedMachineSlot.assignment.bom_labels.map((label) => (
                                                        <Chip
                                                            key={label}
                                                            size="small"
                                                            label={label}
                                                            sx={{ backgroundColor: 'rgba(161,161,170,0.12)', color: '#d4d4d8' }}
                                                        />
                                                    ))}
                                                </Stack>
                                            ) : null}
                                        </>
                                    );
                                })()
                            ) : (
                                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                                    Emplacement {selectedMachineSlot.position} libre.
                                </Typography>
                            )}
                        </Stack>
                    ) : null}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSelectedMachineSlotPosition(null)}>Fermer</Button>
                </DialogActions>
            </Dialog>

            <Menu
                open={Boolean(machineContextMenu)}
                onClose={closeMachineContextMenu}
                anchorReference="anchorPosition"
                anchorPosition={
                    machineContextMenu
                        ? { top: machineContextMenu.mouseY, left: machineContextMenu.mouseX }
                        : undefined
                }
            >
                <MenuItem onClick={() => openMachineConfigDialog(machineContextMenu?.machine)}>
                    <TuneRoundedIcon fontSize="small" style={{ marginRight: 8 }} />
                    Ouvrir la machine
                </MenuItem>
                <MenuItem onClick={() => {
                    closeMachineContextMenu();
                    openMachineEditDialog(machineContextMenu?.machine);
                }}>
                    <EditRoundedIcon fontSize="small" style={{ marginRight: 8 }} />
                    Modifier la machine
                </MenuItem>
            </Menu>

            <Dialog
                open={deleteDialog.open}
                onClose={() => setDeleteDialog({ open: false, type: '', item: null })}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>Confirmer la suppression</DialogTitle>
                <DialogContent sx={{ pt: '12px !important' }}>
                    <Stack spacing={1}>
                        <Typography variant="body2" sx={{ color: '#52525b' }}>
                            {deleteDialog.type === 'machine'
                                ? `Supprimer la machine ${deleteDialog.item?.name || ''} ?`
                                : deleteDialog.type === 'feeder'
                                    ? `Supprimer le feeder ${deleteDialog.item?.size_mm || ''} mm ?`
                                    : `Supprimer le chariot ${deleteDialog.item?.name || ''} ?`}
                        </Typography>
                        {deleteDialog.type === 'machine' && machineDeletePlanCount ? (
                            <Alert severity="warning">
                                {machineDeletePlanCount} plan(s) de production et leurs affectations seront aussi supprimés.
                            </Alert>
                        ) : null}
                        {deleteDialog.type === 'cart' && cartLinkedComponents ? (
                            <Alert severity="info">
                                {cartLinkedComponents} composant(s) fixe(s) seront détachés de ce chariot.
                            </Alert>
                        ) : null}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialog({ open: false, type: '', item: null })}>Annuler</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={handleDelete}
                        disabled={Boolean(
                            deleteDialog.type
                            && deleteDialog.item
                            && actionLoading === `delete-${deleteDialog.type}-${deleteDialog.item?.id}`
                        )}
                    >
                        Supprimer
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
