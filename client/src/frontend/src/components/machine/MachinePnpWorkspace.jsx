import React, { useCallback, useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CalculateRoundedIcon from '@mui/icons-material/CalculateRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Menu,
    MenuItem,
    Paper,
    Stack,
    Tab,
    Tabs,
} from '@mui/material';
import apiClient from '../../api/client';
import PageHeader from '../common/PageHeader';
import { useBomSession } from '../../context/BomSessionContext';
import { useWorkspaceData } from '../../hooks/useWorkspaceData';
import { useFixedFeeders } from '../../hooks/useFixedFeeders';
import { useMachineConfig } from '../../hooks/useMachineConfig';
import { extractRequestError } from '../../utils/machinePnp';
import { MachineTable, FixedFeederTable, CartTable } from './MachinePnpTables';
import MachineConfigDialog from './MachineConfigDialog';
import FixedFeederDialog from './FixedFeederDialog';
import { CreateMachineDialog, EditMachineDialog, CreateCartDialog, EditCartDialog } from './MachineCrudDialogs';
import FixedFeederFilters from './FixedFeederFilters';

const PANEL_SX = { backgroundColor: '#18181b', border: '1px solid #27272a' };

const TAB_SX = {
    fontSize: '0.8rem',
    minHeight: 40,
    textTransform: 'none',
    fontWeight: 500,
    color: '#71717a',
    '&.Mui-selected': { color: '#10b981' },
};

/**
 * Orchestrateur V2 de la page Machine PnP (réintégration du cluster).
 *
 * Monté uniquement quand le flag `machinePnpPlan` est ON. Construit à partir des
 * briques réutilisables du cluster : useWorkspaceData (données), useFixedFeeders
 * (feeders fixes), tables MachinePnpTables. Les dialogues d'assemblage (config
 * machine / plan d'implantation, édition feeder fixe, CRUD) sont ajoutés par
 * incréments successifs ; cette fondation assure le chargement, le rendu des
 * tables et les actions ne nécessitant pas encore d'écran dédié.
 */
function MachinePnpWorkspace() {
    const { activeProduction, bomWorkspace } = useBomSession();

    const {
        machines,
        feeders,
        carts,
        productions,
        loading,
        feedback,
        setFeedback,
        actionLoading,
        setActionLoading,
        deleteDialog,
        setDeleteDialog,
        loadWorkspace,
    } = useWorkspaceData();

    const fixedFeeders = useFixedFeeders({
        feeders,
        carts,
        setFeedback,
        setActionLoading,
        actionLoading,
        loadWorkspace,
    });

    const machineConfig = useMachineConfig({
        activeProduction,
        bomWorkspace,
        feeders,
        productions,
        setFeedback,
        setActionLoading,
        actionLoading,
        loadWorkspace,
    });

    const [activeTab, setActiveTab] = useState(0);
    const [createMachineOpen, setCreateMachineOpen] = useState(false);
    const [createCartOpen, setCreateCartOpen] = useState(false);
    const [editCart, setEditCart] = useState(null);
    const [editMachine, setEditMachine] = useState(null);
    const [machineMenu, setMachineMenu] = useState(null);

    const closeFeedback = useCallback(
        () => setFeedback({ type: 'info', message: '' }),
        [setFeedback],
    );

    const openDeleteMachine = useCallback(
        (machine) => setDeleteDialog({ open: true, type: 'machine', item: machine }),
        [setDeleteDialog],
    );
    const openDeleteCart = useCallback(
        (cart) => setDeleteDialog({ open: true, type: 'cart', item: cart }),
        [setDeleteDialog],
    );
    const closeDelete = useCallback(
        () => setDeleteDialog({ open: false, type: '', item: null }),
        [setDeleteDialog],
    );

    const handleOpenMachineMenu = useCallback((event, machine) => {
        event.preventDefault();
        setMachineMenu({ mouseX: event.clientX, mouseY: event.clientY, machine });
    }, []);
    const closeMachineMenu = useCallback(() => setMachineMenu(null), []);

    const handleConfirmDelete = useCallback(async () => {
        const { type, item } = deleteDialog;
        if (!type || !item) return;
        setActionLoading(`delete-${type}-${item.id}`);
        try {
            if (type === 'machine') {
                await apiClient.delete(`/marketplace/machines/${item.id}`);
            } else if (type === 'cart') {
                await apiClient.delete(`/marketplace/carts/${item.id}`);
            }
            await loadWorkspace();
            setFeedback({
                type: 'success',
                message: type === 'machine' ? 'Machine supprimée.' : 'Chariot supprimé.',
            });
            closeDelete();
        } catch (requestError) {
            setFeedback({
                type: 'error',
                message: extractRequestError(requestError, 'Erreur lors de la suppression.'),
            });
        } finally {
            setActionLoading('');
        }
    }, [closeDelete, deleteDialog, loadWorkspace, setActionLoading, setFeedback]);

    const feedbackSeverity = feedback?.type === 'error'
        ? 'error'
        : feedback?.type === 'success'
            ? 'success'
            : 'info';

    return (
        <Stack spacing={3}>
            <PageHeader
                eyebrow="Machine PnP"
                title="Plan d'implantation (V2)"
                description="Réintégration en cours : plan d'implantation feeders, feeders fixes, validation d'ordre de fabrication, détachement production↔machine."
            />

            <Alert severity="info" variant="outlined">
                Vue V2 activée par le flag « machinePnpPlan ». Construction incrémentale en cours.
            </Alert>

            {feedback?.message ? (
                <Alert severity={feedbackSeverity} onClose={closeFeedback}>{feedback.message}</Alert>
            ) : null}

            <Box sx={{ borderBottom: '1px solid #27272a' }}>
                <Tabs
                    value={activeTab}
                    onChange={(_, value) => setActiveTab(value)}
                    sx={{ minHeight: 40, '& .MuiTabs-indicator': { backgroundColor: '#10b981' } }}
                >
                    <Tab label="Machines" sx={TAB_SX} />
                    <Tab label="Feeders fixes" sx={TAB_SX} />
                    <Tab label="Chariots" sx={TAB_SX} />
                </Tabs>
            </Box>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress size={28} sx={{ color: '#059669' }} />
                </Box>
            ) : (
                <>
                    {activeTab === 0 ? (
                        <Stack spacing={2}>
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <Button
                                    startIcon={<AddRoundedIcon />}
                                    size="small"
                                    variant="contained"
                                    onClick={() => setCreateMachineOpen(true)}
                                    sx={{ backgroundColor: '#059669', '&:hover': { backgroundColor: '#047857' } }}
                                >
                                    Nouvelle machine
                                </Button>
                            </Box>
                            <Paper sx={PANEL_SX}>
                                <MachineTable
                                    actionLoading={actionLoading}
                                    machines={machines}
                                    selectedMachineId={machineConfig.machineConfigTarget?.id || null}
                                    onOpenConfig={machineConfig.openMachineConfigDialog}
                                    onDeleteMachine={openDeleteMachine}
                                    onOpenContextMenu={handleOpenMachineMenu}
                                />
                            </Paper>
                        </Stack>
                    ) : null}

                    {activeTab === 1 ? (
                        <Stack spacing={2}>
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                                <Button
                                    startIcon={<AddRoundedIcon />}
                                    size="small"
                                    variant="outlined"
                                    onClick={() => fixedFeeders.openFixedFeederDialog()}
                                >
                                    Ajouter
                                </Button>
                                <Button
                                    startIcon={<RefreshRoundedIcon />}
                                    size="small"
                                    onClick={fixedFeeders.handleRefreshFixedFeederRows}
                                    sx={{ color: '#a1a1aa' }}
                                >
                                    Actualiser
                                </Button>
                                <Button
                                    startIcon={<CalculateRoundedIcon />}
                                    size="small"
                                    variant="contained"
                                    onClick={fixedFeeders.handleCalculateFixedFeeders}
                                    disabled={actionLoading === 'calculate-fixed-feeders'}
                                    sx={{ backgroundColor: '#059669', '&:hover': { backgroundColor: '#047857' } }}
                                >
                                    Calculer les feeders fixes
                                </Button>
                            </Box>
                            <FixedFeederFilters fixedFeeders={fixedFeeders} />
                            <Paper sx={PANEL_SX}>
                                <FixedFeederTable
                                    actionLoading={actionLoading}
                                    rows={fixedFeeders.filteredFixedFeederRows}
                                    onEditFixedFeeder={fixedFeeders.openFixedFeederDialog}
                                    onRemoveFixedFeeder={fixedFeeders.handleRemoveFixedFeeder}
                                />
                            </Paper>
                        </Stack>
                    ) : null}

                    {activeTab === 2 ? (
                        <Stack spacing={2}>
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <Button
                                    startIcon={<AddRoundedIcon />}
                                    size="small"
                                    variant="contained"
                                    onClick={() => setCreateCartOpen(true)}
                                    sx={{ backgroundColor: '#059669', '&:hover': { backgroundColor: '#047857' } }}
                                >
                                    Nouveau chariot
                                </Button>
                            </Box>
                            <Paper sx={PANEL_SX}>
                                <CartTable
                                    actionLoading={actionLoading}
                                    carts={carts}
                                    onEditCart={setEditCart}
                                    onDeleteCart={openDeleteCart}
                                />
                            </Paper>
                        </Stack>
                    ) : null}
                </>
            )}

            <MachineConfigDialog config={machineConfig} />

            <FixedFeederDialog fixedFeeders={fixedFeeders} />

            <CreateMachineDialog
                open={createMachineOpen}
                onClose={() => setCreateMachineOpen(false)}
                onCreated={async () => { await loadWorkspace(); setFeedback({ type: 'success', message: 'Machine créée.' }); }}
            />
            <CreateCartDialog
                open={createCartOpen}
                onClose={() => setCreateCartOpen(false)}
                onCreated={async () => { await loadWorkspace(); setFeedback({ type: 'success', message: 'Chariot créé.' }); }}
            />
            <EditCartDialog
                cart={editCart}
                open={Boolean(editCart)}
                onClose={() => setEditCart(null)}
                onSaved={async () => { await loadWorkspace(); setFeedback({ type: 'success', message: 'Chariot mis à jour.' }); }}
            />
            <EditMachineDialog
                machine={editMachine}
                open={Boolean(editMachine)}
                onClose={() => setEditMachine(null)}
                onSaved={async () => { await loadWorkspace(); setFeedback({ type: 'success', message: 'Machine mise à jour.' }); }}
            />
            <Menu
                open={Boolean(machineMenu)}
                onClose={closeMachineMenu}
                anchorReference="anchorPosition"
                anchorPosition={machineMenu ? { top: machineMenu.mouseY, left: machineMenu.mouseX } : undefined}
            >
                <MenuItem onClick={() => { const m = machineMenu?.machine; closeMachineMenu(); if (m) machineConfig.openMachineConfigDialog(m); }}>
                    Configurer
                </MenuItem>
                <MenuItem onClick={() => { const m = machineMenu?.machine; closeMachineMenu(); setEditMachine(m); }}>
                    Modifier
                </MenuItem>
            </Menu>

            <Dialog open={deleteDialog.open} onClose={closeDelete} maxWidth="xs" fullWidth>
                <DialogTitle>Confirmer la suppression</DialogTitle>
                <DialogContent sx={{ pt: '12px !important' }}>
                    <DialogContentText>
                        Supprimer {deleteDialog.type === 'machine' ? 'la machine' : 'le chariot'}
                        {' '}«&nbsp;{deleteDialog.item?.name}&nbsp;» ? Cette action est irréversible.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDelete}>Annuler</Button>
                    <Button
                        color="error"
                        variant="contained"
                        onClick={handleConfirmDelete}
                        disabled={Boolean(
                            deleteDialog.type
                            && deleteDialog.item
                            && actionLoading === `delete-${deleteDialog.type}-${deleteDialog.item?.id}`,
                        )}
                    >
                        Supprimer
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}

export default MachinePnpWorkspace;
