import React from 'react';
import { Alert, Box, Card, CardContent, Divider, Grid, Typography } from '@mui/material';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import { colors } from '../../theme';
import { eur, hrs } from '../../utils/costingFormat';

const CARD_SX = { backgroundColor: colors.surfaceCard, border: `1px solid ${colors.border}`, height: '100%' };

function Line({ label, value, strong, muted, top }) {
    return (
        <Box
            sx={{
                display: 'flex',
                justifyContent: 'space-between',
                py: 0.6,
                borderTop: top ? `1px solid ${colors.border}` : 'none',
            }}
        >
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>{label}</Typography>
            <Typography
                variant="body2"
                sx={{ color: muted ? colors.textSecondary : colors.textPrimary, fontWeight: strong ? 600 : 400 }}
            >
                {value}
            </Typography>
        </Box>
    );
}

/**
 * Per-card cost decomposition: matière (left) and main d'œuvre (right).
 * Expects a `card` object from GET /costing/productions/{id}.
 */
function CardCostBreakdown({ card }) {
    if (!card) return null;
    const m = card.material || {};
    const l = card.labor || {};
    return (
        <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
                <Card sx={CARD_SX}>
                    <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Inventory2RoundedIcon fontSize="small" sx={{ color: colors.textSecondary }} />
                                Matière / carte
                            </Typography>
                            <Typography variant="subtitle2">{eur(m.subtotal)}</Typography>
                        </Box>
                        <Line label="Composants (auto BOM)" value={eur(m.components)} />
                        <Line label="Pâte à braser" value={eur(m.paste)} />
                        <Line label={`PCB nu (amorti /${card.quantity})`} value={eur(m.pcb_per_board)} />
                        <Line
                            label={`Stencil${m.amortize_stencil ? ` (amorti /${card.quantity})` : ' (plein/carte)'}`}
                            value={eur(m.stencil_per_board)}
                        />
                        <Line label="Sous-total matière" value={eur(m.subtotal)} strong top />
                        {!m.complete && (
                            <Alert severity="warning" sx={{ mt: 1.5 }}>
                                {m.missing?.length} ligne(s) sans prix — coût matière partiel :{' '}
                                {(m.missing || []).slice(0, 4).join(', ')}
                                {m.missing?.length > 4 ? '…' : ''}
                            </Alert>
                        )}
                    </CardContent>
                </Card>
            </Grid>
            <Grid item xs={12} md={6}>
                <Card sx={CARD_SX}>
                    <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <ScheduleRoundedIcon fontSize="small" sx={{ color: colors.textSecondary }} />
                                Main d'œuvre / carte
                            </Typography>
                            <Typography variant="subtitle2">{eur(l.subtotal)}</Typography>
                        </Box>
                        <Line label="Prépa (amortie)" value={hrs(l.prep_h)} muted />
                        <Line label={`Assemblage TOP${l.top_auto ? ' (auto)' : ''}`} value={hrs(l.assembly_top_h)} muted />
                        <Line label={`Assemblage BOT${l.bot_auto ? ' (auto)' : ''}`} value={hrs(l.assembly_bot_h)} muted />
                        {Number(l.tht_h) > 0 && <Line label="Traversants (THT)" value={hrs(l.tht_h)} muted />}
                        <Line label="Test" value={hrs(l.test_h)} muted />
                        <Line label="Rework" value={hrs(l.rework_h)} muted />
                        <Line label="Temps total" value={hrs(l.time_total_h)} top />
                        <Divider sx={{ my: 0.5, borderColor: colors.border }} />
                        <Line label={`× ${l.labor_rate} €/h`} value={eur(l.subtotal)} strong />
                    </CardContent>
                </Card>
            </Grid>
        </Grid>
    );
}

export default CardCostBreakdown;
