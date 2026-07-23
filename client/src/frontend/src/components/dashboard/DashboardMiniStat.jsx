import React from 'react';
import { Box, Card, Grid, Stack, Typography } from '@mui/material';
import { colors } from '../../theme';

/**
 * Bandeau de mini-stats (prompt 024) : cartes compactes (icône + valeur + label
 * sur une ligne) sous la rangée 1, pour rester épuré. Cliquable → écran cible.
 */
function DashboardMiniStat({ stats }) {
    return (
        <Grid container spacing={2}>
            {stats.map(({ label, value, hint, icon: Icon, color, onClick }) => {
                const clickable = Boolean(onClick);
                return (
                    <Grid item xs={12} sm={4} key={label}>
                        <Card
                            onClick={onClick}
                            role={clickable ? 'button' : undefined}
                            tabIndex={clickable ? 0 : undefined}
                            aria-label={clickable ? `${label} : ${value}` : undefined}
                            onKeyDown={clickable ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
                            } : undefined}
                            sx={{
                                backgroundColor: colors.surfaceCard,
                                border: `1px solid ${colors.border}`,
                                cursor: clickable ? 'pointer' : 'default',
                                transition: 'border-color 0.2s ease, transform 0.2s ease',
                                '&:hover': clickable ? { borderColor: color, transform: 'translateY(-1px)' } : undefined,
                                '&:focus-visible': { outline: `2px solid ${color}`, outlineOffset: 2 },
                            }}
                        >
                            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2, py: 1.5 }}>
                                <Box sx={{
                                    p: 1, borderRadius: 1.5, backgroundColor: `${color}1a`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {Icon ? <Icon sx={{ color, fontSize: 20 }} /> : null}
                                </Box>
                                <Typography variant="h6" sx={{ color: colors.textPrimary, fontWeight: 700, minWidth: 28 }}>
                                    {value}
                                </Typography>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ color: colors.textPrimary, fontWeight: 500, lineHeight: 1.2 }} noWrap>
                                        {label}
                                    </Typography>
                                    {hint ? (
                                        <Typography variant="caption" sx={{ color: colors.textSecondary }} noWrap>
                                            {hint}
                                        </Typography>
                                    ) : null}
                                </Box>
                                {clickable ? (
                                    <Box sx={{ flexGrow: 1, textAlign: 'right' }}>
                                        <Typography variant="caption" sx={{ color, opacity: 0.7 }}>
                                            <span aria-hidden="true">→</span>
                                        </Typography>
                                    </Box>
                                ) : null}
                            </Stack>
                        </Card>
                    </Grid>
                );
            })}
        </Grid>
    );
}

export default DashboardMiniStat;
