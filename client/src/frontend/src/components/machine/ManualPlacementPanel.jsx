import React from 'react';
import PanToolRoundedIcon from '@mui/icons-material/PanToolRounded';
import ReportProblemRoundedIcon from '@mui/icons-material/ReportProblemRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    IconButton,
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
import { getFeederSizePalette } from '../../utils/machinePnp';

/**
 * Section « à placer à la main » (débordement capacité) : composants sortis de la
 * machine, priorisés par l'optimiseur (gros feeders peu posés d'abord).
 */
function OverflowSection({ items, slotSavings, onEditComponent }) {
    return (
        <Box sx={{ backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 2, p: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                <PanToolRoundedIcon sx={{ fontSize: 16, color: '#f59e0b' }} />
                <Typography sx={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    À placer à la main ({items.length})
                </Typography>
                <Chip
                    size="small"
                    label={`libère ${slotSavings} emplacement(s)`}
                    sx={{ height: 18, fontSize: '0.62rem', backgroundColor: 'rgba(245,158,11,0.14)', color: '#fde68a', border: '1px solid rgba(245,158,11,0.3)' }}
                />
            </Stack>
            <Typography sx={{ fontSize: '0.72rem', color: '#a1a1aa', mb: 1.25 }}>
                Capacité machine dépassée : ces composants (les plus gros et les moins posés en priorité)
                sont à poser à la main pour que le reste tienne sur la machine.
            </Typography>

            <TableContainer sx={{ maxHeight: 240 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow sx={{ '& th': { borderColor: '#27272a', color: '#71717a', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', py: 0.5, backgroundColor: '#1a1206' } }}>
                            <TableCell>Composant</TableCell>
                            <TableCell>Footprint</TableCell>
                            <TableCell>Feeder</TableCell>
                            <TableCell align="right">Poses</TableCell>
                            <TableCell align="right">Éditer</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {items.map((item) => {
                            const palette = getFeederSizePalette(item.feeder_size_mm);
                            const feederLabel = item.feeder_size_mm
                                ? `${item.feeder_size_mm} mm`
                                : (item.feeder_type || '--');
                            return (
                                <TableRow key={item.component_id} sx={{ '& td': { borderColor: '#27272a', py: 0.5 } }}>
                                    <TableCell sx={{ color: '#f4f4f5', fontSize: '0.78rem' }}>
                                        {item.component_label}
                                        {item.forced_manual ? (
                                            <Chip size="small" label="forcé" sx={{ ml: 0.75, height: 16, fontSize: '0.6rem', backgroundColor: 'rgba(245,158,11,0.18)', color: '#fde68a' }} />
                                        ) : null}
                                    </TableCell>
                                    <TableCell sx={{ color: '#a1a1aa', fontSize: '0.72rem' }}>{item.footprint_pnp || '--'}</TableCell>
                                    <TableCell sx={{ fontSize: '0.72rem' }}>
                                        <Stack direction="row" spacing={0.6} alignItems="center">
                                            <Box sx={{ width: 9, height: 9, borderRadius: 0.5, border: `1px solid ${palette.borderColor}`, backgroundColor: palette.slotBackground }} />
                                            <span style={{ color: '#d4d4d8' }}>{feederLabel}{item.slot_usage > 1 ? ' (2 pos.)' : ''}</span>
                                        </Stack>
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: '#a1a1aa', fontSize: '0.72rem' }}>{item.total_board_quantity ?? 0}</TableCell>
                                    <TableCell align="right" sx={{ py: '2px !important' }}>
                                        <Tooltip title="Éditer / remettre en placement auto">
                                            <span>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => onEditComponent && onEditComponent(item.component_id)}
                                                    disabled={!onEditComponent}
                                                    sx={{ color: '#fde68a' }}
                                                >
                                                    <EditRoundedIcon sx={{ fontSize: 16 }} />
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

/**
 * Section « à compléter — taille de feeder manquante » : composants sans taille de
 * feeder exploitable. Non installés sur la PnP (placement manuel auto). On invite à
 * renseigner la taille dans la Base de données, puis à recalculer le plan.
 */
function MissingSizeSection({ items, onRecalculate, recalculating, onEditComponent }) {
    return (
        <Box sx={{ backgroundColor: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 2, p: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                <ReportProblemRoundedIcon sx={{ fontSize: 16, color: '#f87171' }} />
                <Typography sx={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    À compléter — taille de feeder manquante ({items.length})
                </Typography>
            </Stack>
            <Typography sx={{ fontSize: '0.72rem', color: '#a1a1aa', mb: 1.25 }}>
                Ces composants n'ont pas de taille de feeder définie : ils ne sont pas installés sur la PnP
                et sont basculés en pose manuelle. Renseignez leur taille de feeder dans la Base de données,
                puis recalculez le plan d'implantation.
            </Typography>

            <TableContainer sx={{ maxHeight: 240 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow sx={{ '& th': { borderColor: '#27272a', color: '#71717a', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', py: 0.5, backgroundColor: '#1a0a0a' } }}>
                            <TableCell>Composant</TableCell>
                            <TableCell>Footprint</TableCell>
                            <TableCell align="right">Poses</TableCell>
                            <TableCell align="right">Éditer</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {items.map((item) => (
                            <TableRow key={item.component_id} sx={{ '& td': { borderColor: '#27272a', py: 0.5 } }}>
                                <TableCell sx={{ color: '#f4f4f5', fontSize: '0.78rem' }}>{item.component_label}</TableCell>
                                <TableCell sx={{ color: '#a1a1aa', fontSize: '0.72rem' }}>{item.footprint_pnp || '--'}</TableCell>
                                <TableCell align="right" sx={{ color: '#a1a1aa', fontSize: '0.72rem' }}>{item.total_board_quantity ?? 0}</TableCell>
                                <TableCell align="right" sx={{ py: '2px !important' }}>
                                    <Tooltip title="Compléter la taille / éditer ce composant">
                                        <span>
                                            <IconButton
                                                size="small"
                                                onClick={() => onEditComponent && onEditComponent(item.component_id)}
                                                disabled={!onEditComponent}
                                                sx={{ color: '#fca5a5' }}
                                            >
                                                <EditRoundedIcon sx={{ fontSize: 16 }} />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
                <Button
                    component="a"
                    href="#/base-donnees"
                    size="small"
                    variant="outlined"
                    startIcon={<OpenInNewRoundedIcon sx={{ fontSize: 16 }} />}
                    sx={{ textTransform: 'none', fontSize: '0.72rem', color: '#fca5a5', borderColor: 'rgba(239,68,68,0.4)' }}
                >
                    Compléter dans la Base de données
                </Button>
                <Button
                    size="small"
                    variant="text"
                    onClick={onRecalculate}
                    disabled={recalculating}
                    startIcon={recalculating ? <CircularProgress size={14} /> : <RefreshRoundedIcon sx={{ fontSize: 16 }} />}
                    sx={{ textTransform: 'none', fontSize: '0.72rem', color: '#a1a1aa' }}
                >
                    Recalculer le plan
                </Button>
            </Stack>
        </Box>
    );
}

/**
 * Panneau de pose manuelle : regroupe deux causes distinctes —
 *  1) taille de feeder manquante (à compléter) ;
 *  2) débordement de capacité (optimiseur).
 * Ne s'affiche que si le backend renvoie au moins un composant en manuel.
 */
function ManualPlacementPanel({ config, onEditComponent }) {
    const plan = config.machineProductionPlan;
    const allItems = plan?.manual_placement_components || [];
    const needsSize = allItems.filter((item) => item.needs_feeder_size);
    const overflow = allItems.filter((item) => !item.needs_feeder_size);
    const [recalculating, setRecalculating] = React.useState(false);

    if (!needsSize.length && !overflow.length) return null;

    const handleRecalculate = async () => {
        if (!plan || typeof config.loadMachineProductionPlan !== 'function') return;
        setRecalculating(true);
        try {
            await config.loadMachineProductionPlan(
                plan.machine_id,
                plan.production_id,
                config.selectedMachineBomRevisionId || null,
            );
        } finally {
            setRecalculating(false);
        }
    };

    return (
        <Stack spacing={1.5}>
            {needsSize.length > 0 && (
                <MissingSizeSection
                    items={needsSize}
                    onRecalculate={handleRecalculate}
                    recalculating={recalculating}
                    onEditComponent={onEditComponent}
                />
            )}
            {overflow.length > 0 && (
                <OverflowSection
                    items={overflow}
                    slotSavings={plan.manual_placement_slot_savings || 0}
                    onEditComponent={onEditComponent}
                />
            )}
        </Stack>
    );
}

export default ManualPlacementPanel;
