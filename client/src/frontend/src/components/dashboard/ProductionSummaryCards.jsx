import React from 'react';
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    LinearProgress,
    Skeleton,
    Stack,
    Tooltip,
    Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import BackHandRoundedIcon from '@mui/icons-material/BackHandRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import PrecisionManufacturingRoundedIcon from '@mui/icons-material/PrecisionManufacturingRounded';
import apiClient from '../../api/client';
import useEventStream from '../../hooks/useEventStream';
import ProduceRunDialog from './ProduceRunDialog';

const STATUS_UI = {
    DRAFT: { label: 'Brouillon', color: 'default' },
    ACTIVE: { label: 'Active', color: 'success' },
    COMPLETED: { label: 'Terminée', color: 'info' },
    ARCHIVED: { label: 'Archivée', color: 'default' },
};

const COMMAND_UI = {
    DRAFT: { label: 'Commande brouillon', color: 'default' },
    READY: { label: 'Commande prête', color: 'info' },
    SENT: { label: 'Commande envoyée', color: 'warning' },
    RECEIVED: { label: 'Commande reçue', color: 'success' },
};

function stockChip(stock) {
    if (!stock) {
        return <Chip size="small" variant="outlined" label="Stock : —" sx={{ color: '#a1a1aa' }} />;
    }
    if (stock.can_produce) {
        return <Chip size="small" variant="outlined" color="success" label="Stock OK" />;
    }
    return (
        <Chip
            size="small"
            variant="outlined"
            color="error"
            label={`${stock.shortage_count} manque(s)`}
        />
    );
}

/**
 * « Productions en cours » : une carte détaillée par production (endpoint agrégé
 * /reports/productions-summary) — avancement cartes, stock, commande, machine,
 * postes présents. Rafraîchi en silence sur les événements stock (SSE).
 */
function ProductionSummaryCards({ activeProductionId }) {
    const [items, setItems] = React.useState(null); // null = chargement initial
    const [error, setError] = React.useState(null);
    const [produceFor, setProduceFor] = React.useState(null); // production du dialog lot
    const [lastLot, setLastLot] = React.useState(null);

    const load = React.useCallback(async (silent = false) => {
        if (!silent) setError(null);
        try {
            const res = await apiClient.get('/reports/productions-summary');
            setItems(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            if (!silent) {
                setError(err?.response?.data?.detail || 'Résumé des productions indisponible.');
                setItems([]);
            }
        }
    }, []);

    React.useEffect(() => { load(); }, [load]);
    useEventStream('stock', React.useCallback(() => { load(true); }, [load]));

    return (
        <Card sx={{ backgroundColor: '#18181b', border: '1px solid #1f2937' }}>
            <CardContent>
                <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="h6" sx={{ flexGrow: 1, color: '#f4f4f5', fontWeight: 600 }}>
                        Productions en cours
                    </Typography>
                    <Button size="small" variant="text" onClick={() => load()}>Actualiser</Button>
                </Stack>

                {error ? (
                    <Typography variant="body2" sx={{ color: '#f87171' }}>{error}</Typography>
                ) : null}

                {items === null ? (
                    <Stack spacing={1.5}>
                        <Skeleton variant="rounded" height={96} />
                        <Skeleton variant="rounded" height={96} />
                    </Stack>
                ) : items.length === 0 && !error ? (
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                        Aucune production en cours.
                    </Typography>
                ) : (
                    <Stack spacing={1.5}>
                        {items.map((p) => {
                            const statusUi = STATUS_UI[p.status] || { label: p.status || '—', color: 'default' };
                            const commandUi = p.command ? COMMAND_UI[p.command.status] : null;
                            const target = Number(p.boards_target) || 0;
                            const produced = Number(p.boards_produced) || 0;
                            const progress = target > 0 ? Math.min((produced / target) * 100, 100) : 0;
                            const isActive = p.id === activeProductionId;
                            return (
                                <Box
                                    key={p.id}
                                    sx={{
                                        border: '1px solid',
                                        borderColor: isActive ? '#059669' : '#27272a',
                                        borderRadius: 2,
                                        p: 1.5,
                                    }}
                                >
                                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                                        <Typography variant="subtitle2" sx={{ color: '#f4f4f5', fontWeight: 600, flexGrow: 1 }} noWrap>
                                            {p.name}
                                        </Typography>
                                        <Chip size="small" variant="outlined" color={statusUi.color} label={statusUi.label} />
                                    </Stack>

                                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
                                        <Box sx={{ flexGrow: 1 }}>
                                            <LinearProgress
                                                variant="determinate"
                                                value={progress}
                                                sx={{ height: 6, borderRadius: 3 }}
                                            />
                                        </Box>
                                        <Typography variant="caption" sx={{ color: '#a1a1aa', whiteSpace: 'nowrap' }}>
                                            {produced} / {target || '—'} carte(s)
                                        </Typography>
                                    </Stack>

                                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                                        {stockChip(p.stock)}
                                        {commandUi ? (
                                            <Chip size="small" variant="outlined" color={commandUi.color} label={commandUi.label} />
                                        ) : null}
                                        <Chip
                                            size="small"
                                            variant="outlined"
                                            label={`${p.revisions_count} BOM`}
                                            sx={{ color: '#a1a1aa' }}
                                        />
                                        {p.assembly_mode === 'MANUEL' ? (
                                            <Tooltip title="Cartes assemblées à la main (pas de machine PnP)">
                                                <Chip
                                                    size="small"
                                                    variant="outlined"
                                                    icon={<BackHandRoundedIcon />}
                                                    label="À la main"
                                                    sx={{ color: '#a1a1aa' }}
                                                />
                                            </Tooltip>
                                        ) : p.machine ? (
                                            <Tooltip title={p.assembly_mode === 'MIXTE' ? 'Assemblage mixte (PnP + main)' : 'Machine assignée'}>
                                                <Chip
                                                    size="small"
                                                    variant="outlined"
                                                    icon={<PrecisionManufacturingRoundedIcon />}
                                                    label={p.assembly_mode === 'MIXTE' ? `${p.machine.name} + main` : p.machine.name}
                                                    sx={{ color: '#a1a1aa' }}
                                                />
                                            </Tooltip>
                                        ) : p.assembly_mode === 'MIXTE' ? (
                                            <Chip size="small" variant="outlined" label="Mixte" sx={{ color: '#a1a1aa' }} />
                                        ) : null}
                                        {p.presence_count > 0 ? (
                                            <Tooltip title="Postes actuellement sur cette production">
                                                <Chip
                                                    size="small"
                                                    color="info"
                                                    variant="outlined"
                                                    icon={<GroupsRoundedIcon />}
                                                    label={`${p.presence_count} poste(s)`}
                                                />
                                            </Tooltip>
                                        ) : null}
                                        <Box sx={{ flexGrow: 1 }} />
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<AddRoundedIcon />}
                                            onClick={() => setProduceFor(p)}
                                            sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: 12 }}
                                        >
                                            Déclarer un lot
                                        </Button>
                                    </Stack>
                                </Box>
                            );
                        })}
                    </Stack>
                )}

                {lastLot ? (
                    <Typography variant="caption" sx={{ color: '#34d399', display: 'block', mt: 1.5 }}>
                        {lastLot}
                    </Typography>
                ) : null}

                <ProduceRunDialog
                    open={Boolean(produceFor)}
                    production={produceFor}
                    onClose={() => setProduceFor(null)}
                    onSaved={(boards, byHand) => {
                        setLastLot(`Lot enregistré : ${boards} carte(s) ${byHand ? 'à la main' : 'en machine'} — stock mis à jour.`);
                        load(true);
                    }}
                />
            </CardContent>
        </Card>
    );
}

export default ProductionSummaryCards;
