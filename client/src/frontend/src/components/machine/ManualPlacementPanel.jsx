import React from 'react';
import PanToolRoundedIcon from '@mui/icons-material/PanToolRounded';
import {
    Box,
    Chip,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import { getFeederSizePalette } from '../../utils/machinePnp';

/**
 * Panneau « à placer à la main » : composants sortis de la machine au débordement,
 * priorisés par l'optimiseur (gros feeders peu posés d'abord) pour que le reste
 * tienne. Ne s'affiche que si le backend renvoie une liste non vide.
 */
function ManualPlacementPanel({ config }) {
    const plan = config.machineProductionPlan;
    const items = plan?.manual_placement_components || [];
    if (!items.length) return null;

    const slotSavings = plan.manual_placement_slot_savings || 0;

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
                                    </TableCell>
                                    <TableCell sx={{ color: '#a1a1aa', fontSize: '0.72rem' }}>{item.footprint_pnp || '--'}</TableCell>
                                    <TableCell sx={{ fontSize: '0.72rem' }}>
                                        <Stack direction="row" spacing={0.6} alignItems="center">
                                            <Box sx={{ width: 9, height: 9, borderRadius: 0.5, border: `1px solid ${palette.borderColor}`, backgroundColor: palette.slotBackground }} />
                                            <span style={{ color: '#d4d4d8' }}>{feederLabel}{item.slot_usage > 1 ? ' (2 pos.)' : ''}</span>
                                        </Stack>
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: '#a1a1aa', fontSize: '0.72rem' }}>{item.total_board_quantity ?? 0}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

export default ManualPlacementPanel;
