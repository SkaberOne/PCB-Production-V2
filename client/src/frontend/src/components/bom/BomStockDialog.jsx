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
    backgroundColor: '#111111',
    border: '1px solid #27272a',
};

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
                            Les informations sont enregistrées immédiatement pendant la saisie.
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
                                                    Estimation à partir des diamètres, du pitch et de la marge de sécurité.
                                                </Typography>
                                            </Box>

                                            <Grid container spacing={1.5}>
                                                <Grid item xs={12} sm={6}>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        type="number"
                                                        label="Diamètre extérieur (mm)"
                                                        value={line.draft.reel_outer_diameter_mm || ''}
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
                                                        value={line.draft.reel_hub_diameter_mm || ''}
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
                                                        value={line.draft.reel_safety_pct || 25}
                                                        onChange={onStockDraftChange(line.key, 'reel_safety_pct', true)}
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
                                                        value={line.draft.bag_qty || ''}
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
                                                        value={line.draft.tube_qty || ''}
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
