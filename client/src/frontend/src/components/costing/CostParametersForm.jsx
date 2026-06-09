import React from 'react';
import { Card, CardContent, Grid, InputAdornment, TextField, Typography } from '@mui/material';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { colors } from '../../theme';

const CARD_SX = { backgroundColor: colors.surfaceCard, border: `1px solid ${colors.border}` };

const FIELDS = [
    { key: 'labor_rate', label: 'Taux horaire chargé', unit: '€/h' },
    { key: 'vat_pct', label: 'TVA', unit: '%' },
    { key: 'solder_paste_per_board', label: 'Pâte à braser / carte', unit: '€' },
    { key: 'defect_rate_pct', label: 'Taux de défaillance', unit: '%' },
    { key: 'repair_time_h', label: 'Temps réparation', unit: 'h' },
    { key: 'test_time_h', label: 'Temps de test', unit: 'h' },
    { key: 'prep_time_bom_h', label: 'Prépa BOM (amortie)', unit: 'h' },
    { key: 'prep_time_top_h', label: 'Prépa PnP TOP (amortie)', unit: 'h' },
    { key: 'prep_time_bot_h', label: 'Prépa PnP BOT (amortie)', unit: 'h' },
];

/**
 * Editor for the workshop costing parameters (single-row COST_PARAMETERS).
 * Controlled: values + onChange(key, value) provided by the parent. See ADR 0005.
 */
function CostParametersForm({ values, onChange, disabled }) {
    if (!values) return null;
    return (
        <Card sx={CARD_SX}>
            <CardContent>
                <Typography
                    variant="subtitle1"
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}
                >
                    <TuneRoundedIcon fontSize="small" sx={{ color: colors.textSecondary }} />
                    Paramètres atelier
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
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">{field.unit}</InputAdornment>
                                    ),
                                }}
                            />
                        </Grid>
                    ))}
                </Grid>
            </CardContent>
        </Card>
    );
}

export default CostParametersForm;
