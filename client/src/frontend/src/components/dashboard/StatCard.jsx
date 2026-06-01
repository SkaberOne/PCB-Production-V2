import React from 'react';
import { Card, CardContent, Stack, Typography, Box } from '@mui/material';
import { colors } from '../../theme';

// Une valeur est considérée "vide" si elle est null, undefined, ou un placeholder texte ("--", "—", "...")
const EMPTY_VALUE_PLACEHOLDERS = new Set(['--', '—', '...', '']);
function isEmptyValue(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && EMPTY_VALUE_PLACEHOLDERS.has(value.trim())) return true;
    return false;
}

function StatCard({ label, value, hint, icon: Icon, color = colors.green, onClick }) {
    const isClickable = Boolean(onClick);
    const isEmpty = isEmptyValue(value);
    return (
        <Card
            onClick={onClick}
            sx={{
                height: '100%',
                backgroundColor: colors.surfaceCard,
                border: `1px solid ${colors.border}`,
                transition: 'border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out, transform 0.2s ease-in-out',
                willChange: 'transform',
                cursor: isClickable ? 'pointer' : 'default',
                '&:hover': {
                    borderColor: isClickable ? color : colors.borderHover,
                    boxShadow: isClickable
                        ? `0 4px 16px ${color}22`
                        : `0 4px 16px ${colors.green}1a`,
                    transform: isClickable ? 'translateY(-1px)' : 'none',
                },
            }}
        >
            <CardContent>
                <Stack spacing={2}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        {Icon && (
                            <Box
                                sx={{
                                    p: 1.5,
                                    borderRadius: 1.5,
                                    backgroundColor: `${color}1a`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <Icon sx={{ color, fontSize: 22 }} />
                            </Box>
                        )}
                        {isClickable && (
                            <Typography variant="caption" sx={{ color: color, opacity: 0.7, fontSize: '0.7rem', mt: 0.5 }}>
                                Voir →
                            </Typography>
                        )}
                    </Box>

                    <Typography
                        variant="body2"
                        sx={{
                            color: colors.textSecondary,
                            fontWeight: 500,
                            fontSize: '0.8rem',
                            letterSpacing: '0.02em',
                        }}
                    >
                        {label}
                    </Typography>

                    <Typography
                        variant="h4"
                        sx={{
                            color: isEmpty ? colors.textTertiary || '#52525b' : colors.textPrimary,
                            fontWeight: isEmpty ? 500 : 700,
                            fontSize: isEmpty ? '1rem' : '1.6rem',
                            lineHeight: 1.2,
                            fontStyle: isEmpty ? 'italic' : 'normal',
                        }}
                    >
                        {isEmpty ? 'En attente de session' : value}
                    </Typography>
                    {hint && (
                        <Typography variant="caption" sx={{ color: colors.textSecondary, fontSize: '0.75rem' }}>
                            {hint}
                        </Typography>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
}

export default StatCard;
