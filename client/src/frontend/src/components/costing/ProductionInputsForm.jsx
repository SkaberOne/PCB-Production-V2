import React from 'react';
import {
    Card,
    CardContent,
    Checkbox,
    FormControlLabel,
    Grid,
    InputAdornment,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import { colors } from '../../theme';

const CARD_SX = { backgroundColor: colors.surfaceCard, border: `1px solid ${colors.border}` };

const FIELDS = [
    { key: 'quantity_produced', label: 'Cartes produites', unit: '' },
    { key: 'pcb_total_price', label: 'PCB nu (total série)', unit: '€' },
    { key: 'stencil_cost', label: 'Stencil', unit: '€' },
    { key: 'assembly_time_top_h', label: 'Assemblage TOP', unit: 'h', auto: true },
    { key: 'assembly_time_bot_h', label: 'Assemblage BOT', unit: 'h', auto: true },
    { key: 'tht_time_h', label: 'Traversants (THT)', unit: 'h' },
];

/**
 * Editor for the per-production non-material costing inputs (PRODUCTION_COST_INPUT).
 * Assembly times are auto-estimated server-side when left empty (hybrid). See ADR 0005.
 */
function ProductionInputsForm({ values, onChange, disabled }) {
    if (!values) return null;
    return (
        <Card sx={CARD_SX}>
            <CardContent>
                <Typography
                    variant="subtitle1"
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}
                >
                    <ListAltRoundedIcon fontSize="small" sx={{ color: colors.textSecondary }} />
                    Données production
                </Typography>
                <Grid container spacing={2}>
                    {FIELDS.map((field) => (
                        <Grid item xs={6} sm={4} key={field.key}>
                            <TextField
                                fullWidth
                                size="small"
                                type="number"
                                label={field.label}
                                value={values[field.key] ?? ''}
                                onChange={(e) => onChange(field.key, e.target.value)}
                                disabled={disabled}
                                placeholder={field.auto ? 'auto' : ''}
                                InputProps={{
                                    endAdornment: field.unit ? (
                                        <InputAdornment position="end">{field.unit}</InputAdornment>
                                    ) : undefined,
                                }}
                                helperText={field.auto ? 'Vide = estimé auto' : ''}
                            />
                        </Grid>
                    ))}
                    <Grid item xs={12} sm={4} sx={{ display: 'flex', alignItems: 'center' }}>
                        <Tooltip title="Amortir le coût du stencil sur la série (recommandé) plutôt que de le compter en entier par carte.">
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={Boolean(values.amortize_stencil)}
                                        onChange={(e) => onChange('amortize_stencil', e.target.checked)}
                                        disabled={disabled}
                                    />
                                }
                                label="Amortir le stencil"
                            />
                        </Tooltip>
                    </Grid>
                </Grid>
                <Typography
                    variant="caption"
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, color: colors.textSecondary }}
                >
                    <AutoFixHighRoundedIcon sx={{ fontSize: 14 }} />
                    Temps d'assemblage : estimé automatiquement, surchargeable à la main.
                </Typography>
            </CardContent>
        </Card>
    );
}

export default ProductionInputsForm;
