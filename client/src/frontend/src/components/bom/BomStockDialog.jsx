import React from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Grid,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { compactInputSx } from '../../utils/compactTable';
import { getStockStatusChipColor, normalizeStockStatus } from '../../utils/bomStockUi';

const panelCardSx = {
    backgroundColor: '#18181b',
    border: '1px solid #27272a',
};

const REEL_EMERALD = '#34d399';
const REEL_ZINC = '#d4d4d8';

// Schéma représentatif d'une bobine. Le disque vert = le corps de la bobine ;
// le cercle en pointillé vert = le sommet de la bande enroulée, et c'est SON
// diamètre que mesure la flèche verte (Ø extérieur de la bande). Le cercle
// intérieur = le moyeu (flèche zinc). Le tout se redimensionne selon les valeurs.
function ReelSchematic({ outerMm, hubMm }) {
    const outer = Number(outerMm);
    const hub = Number(hubMm);
    const cx = 128;
    const cy = 92;
    const R = 72;                       // disque vert = corps de la bobine
    const valid = outer > 0 && hub > 0 && hub < outer;
    const ratio = valid ? hub / outer : 0.42;
    const r = Math.max(20, Math.min(R - 16, ratio * R));
    const rBand = r + (R - r) * 0.52;   // cercle pointillé vert = sommet de la bande (mesuré)
    const hole = Math.max(7, r * 0.34);

    return (
        <Stack spacing={1} alignItems="center" sx={{ py: 0.5 }}>
            <Box sx={{ width: '100%', maxWidth: 260 }}>
                <svg
                    viewBox="0 0 240 190"
                    role="img"
                    aria-label="Schéma d'une bobine : la flèche verte mesure le diamètre du cercle pointillé vert (sommet de la bande), la flèche zinc mesure le moyeu"
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                >
                    <defs>
                        <marker id="reelArrowEmerald" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                            <path d="M0,0 L7,3.5 L0,7 Z" fill={REEL_EMERALD} />
                        </marker>
                        <marker id="reelArrowZinc" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                            <path d="M0,0 L7,3.5 L0,7 Z" fill={REEL_ZINC} />
                        </marker>
                    </defs>

                    {/* Corps de la bobine (disque vert) */}
                    <circle cx={cx} cy={cy} r={R} fill="#0c2e24" stroke={REEL_EMERALD} strokeWidth="2" />

                    {/* Sommet de la bande (cercle pointillé vert) — c'est ce qu'on mesure */}
                    <circle cx={cx} cy={cy} r={rBand} fill="none" stroke={REEL_EMERALD} strokeWidth="1.6" strokeDasharray="5 4" />

                    {/* Moyeu + trou central */}
                    <circle cx={cx} cy={cy} r={r} fill="#18181b" stroke={REEL_ZINC} strokeWidth="2" />
                    <circle cx={cx} cy={cy} r={hole} fill="#0b0b0d" stroke="#3f3f46" strokeWidth="1" />

                    {/* Flèche verte = diamètre du cercle pointillé vert (verticale, à gauche) */}
                    <line x1="18" y1={cy - rBand} x2="18" y2={cy + rBand} stroke={REEL_EMERALD} strokeWidth="1.4" markerStart="url(#reelArrowEmerald)" markerEnd="url(#reelArrowEmerald)" />
                    <line x1="18" y1={cy - rBand} x2={cx} y2={cy - rBand} stroke={REEL_EMERALD} strokeOpacity="0.45" strokeWidth="0.8" strokeDasharray="2 3" />
                    <line x1="18" y1={cy + rBand} x2={cx} y2={cy + rBand} stroke={REEL_EMERALD} strokeOpacity="0.45" strokeWidth="0.8" strokeDasharray="2 3" />

                    {/* Flèche zinc = Ø moyeu (horizontale, au centre) */}
                    <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke={REEL_ZINC} strokeWidth="1.4" markerStart="url(#reelArrowZinc)" markerEnd="url(#reelArrowZinc)" />
                </svg>
            </Box>

            <Stack direction="row" spacing={2}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', border: `2px dashed ${REEL_EMERALD}` }} />
                    <Typography variant="caption" sx={{ color: '#d4d4d8' }}>Ø extérieur (bande)</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${REEL_ZINC}` }} />
                    <Typography variant="caption" sx={{ color: '#d4d4d8' }}>Ø moyeu</Typography>
                </Box>
            </Stack>
        </Stack>
    );
}

function BomStockDialog({
    line = null,
    open = false,
    onClose,
    onStockDraftChange,
    onPitchBlur,
}) {
    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="md"
            PaperProps={{
                sx: {
                    backgroundColor: '#18181b',
                    color: '#f4f4f5',
                    border: '1px solid #27272a',
                    borderRadius: 3,
                },
            }}
        >
            <DialogTitle sx={{ borderBottom: '1px solid #27272a' }}>
                <Stack spacing={0.75}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {line?.componentLibraryName || line?.value || 'Composant'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                        {line ? `${line.value} - ${line.footprint} - ${line.type}` : ''}
                    </Typography>
                </Stack>
            </DialogTitle>

            <DialogContent sx={{ pt: 3 }}>
                {line ? (
                    <Stack spacing={3} sx={{ mt: 0.5 }}>
                        <Alert severity="info">
                            Les valeurs saisies sont conservées dans la session et enregistrées avec la BOM.
                        </Alert>

                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={3}>
                                <Card sx={panelCardSx}>
                                    <CardContent>
                                        <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                                            Besoin total
                                        </Typography>
                                        <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>
                                            {line.requiredQuantity}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid item xs={12} sm={3}>
                                <Card sx={panelCardSx}>
                                    <CardContent>
                                        <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                                            Stock dispo
                                        </Typography>
                                        <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>
                                            {line.totalAvailableQty}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid item xs={12} sm={3}>
                                <Card sx={panelCardSx}>
                                    <CardContent>
                                        <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                                            À commander
                                        </Typography>
                                        <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 700 }}>
                                            {line.quantityToOrder}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid item xs={12} sm={3}>
                                <Card sx={panelCardSx}>
                                    <CardContent>
                                        <Typography variant="caption" sx={{ color: '#a1a1aa', display: 'block', mb: 1 }}>
                                            Statut
                                        </Typography>
                                        <Chip
                                            label={normalizeStockStatus(line.status)}
                                            size="small"
                                            color={getStockStatusChipColor(line.status)}
                                            variant="outlined"
                                        />
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>

                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <Card sx={{ ...panelCardSx, height: '100%' }}>
                                    <CardContent>
                                        <Stack spacing={2}>
                                            <Box>
                                                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                                    Bobine
                                                </Typography>
                                                <Typography variant="body2" sx={{ color: '#a1a1aa', mt: 0.5 }}>
                                                    Estimation à partir des diamètres (Ø extérieur = sommet de la bande enroulée), du pitch et de la marge.
                                                </Typography>
                                            </Box>

                                            <ReelSchematic
                                                outerMm={line.draft.reel_outer_diameter_mm}
                                                hubMm={line.draft.reel_hub_diameter_mm}
                                            />

                                            <Grid container spacing={1.5}>
                                                <Grid item xs={12} sm={6}>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        type="number"
                                                        label="Ø extérieur de la bande (mm)"
                                                        helperText="Au sommet de l'enroulement de la bande"
                                                        value={line.draft.reel_outer_diameter_mm ?? ''}
                                                        onChange={onStockDraftChange(line.key, 'reel_outer_diameter_mm', true)}
                                                        sx={compactInputSx}
                                                    />
                                                </Grid>
                                                <Grid item xs={12} sm={6}>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        type="number"
                                                        label="Diamètre du moyeu (mm)"
                                                        value={line.draft.reel_hub_diameter_mm ?? ''}
                                                        onChange={onStockDraftChange(line.key, 'reel_hub_diameter_mm', true)}
                                                        sx={compactInputSx}
                                                    />
                                                </Grid>
                                                <Grid item xs={12} sm={6}>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        type="number"
                                                        label="Pitch (mm)"
                                                        value={line.draft.pitch_mm ?? line.componentPitchMm ?? ''}
                                                        onChange={onStockDraftChange(line.key, 'pitch_mm', true)}
                                                        onBlur={onPitchBlur(line)}
                                                        sx={compactInputSx}
                                                    />
                                                </Grid>
                                                <Grid item xs={12} sm={6}>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        type="number"
                                                        label="Marge de sécurité (%)"
                                                        value={line.draft.reel_safety_pct ?? 25}
                                                        onChange={onStockDraftChange(line.key, 'reel_safety_pct', true)}
                                                        sx={compactInputSx}
                                                    />
                                                </Grid>
                                                <Grid item xs={12} sm={6}>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        type="number"
                                                        label="Épaisseur de bande (mm)"
                                                        value={line.draft.tape_thickness_mm ?? ''}
                                                        placeholder={line.resolvedTapeThicknessMm != null ? `défaut ${line.resolvedTapeThicknessMm}` : ''}
                                                        helperText={
                                                            line.draft.tape_thickness_mm
                                                                ? null
                                                                : `Défaut appliqué : ${line.resolvedTapeThicknessMm ?? '-'} mm`
                                                        }
                                                        onChange={onStockDraftChange(line.key, 'tape_thickness_mm', true)}
                                                        sx={compactInputSx}
                                                    />
                                                </Grid>
                                            </Grid>

                                            <Alert severity="success">
                                                Quantité estimée en bobine : {line.reelEstimatedQty ?? '-'}
                                            </Alert>
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Grid>

                            <Grid item xs={12} md={6}>
                                <Card sx={{ ...panelCardSx, height: '100%' }}>
                                    <CardContent>
                                        <Stack spacing={2}>
                                            <Box>
                                                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                                    Sachet, tube et préparation
                                                </Typography>
                                                <Typography variant="body2" sx={{ color: '#a1a1aa', mt: 0.5 }}>
                                                    Toute quantité en sachet ou tube implique une pose manuelle.
                                                </Typography>
                                            </Box>

                                            <Grid container spacing={1.5}>
                                                <Grid item xs={12} sm={6}>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        type="number"
                                                        label="Quantité sachet"
                                                        value={line.draft.bag_qty ?? ''}
                                                        onChange={onStockDraftChange(line.key, 'bag_qty', true)}
                                                        sx={compactInputSx}
                                                    />
                                                </Grid>
                                                <Grid item xs={12} sm={6}>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        type="number"
                                                        label="Quantité tube"
                                                        value={line.draft.tube_qty ?? ''}
                                                        onChange={onStockDraftChange(line.key, 'tube_qty', true)}
                                                        sx={compactInputSx}
                                                    />
                                                </Grid>
                                                <Grid item xs={12}>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label="Emplacement feeder"
                                                        value={line.draft.feeder_slot || ''}
                                                        onChange={onStockDraftChange(line.key, 'feeder_slot')}
                                                        sx={compactInputSx}
                                                    />
                                                </Grid>
                                            </Grid>

                                            {line.manualPlacement ? (
                                                <Alert severity="warning">
                                                    Ce composant est actuellement considéré en pose manuelle.
                                                </Alert>
                                            ) : (
                                                <Alert severity="info">
                                                    Aucun indicateur de pose manuelle n'est actif pour ce composant.
                                                </Alert>
                                            )}
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    </Stack>
                ) : null}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2.5, borderTop: '1px solid #27272a' }}>
                <Button onClick={onClose} variant="contained">
                    Fermer
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default React.memo(BomStockDialog);
