import React from 'react';
import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

function EmptyState({
    eyebrow,
    title,
    description,
    actionLabel,
    actionDisabled = false,
    onAction,
    // Optional: navigate to a route on primary CTA click
    navigateTo,
    navigateLabel
}) {
    const navigate = useNavigate();
    const isActionDisabled = typeof onAction !== 'function' && !navigateTo ? true : actionDisabled;

    const handleAction = () => {
        if (navigateTo) {
            navigate(navigateTo);
        } else if (typeof onAction === 'function') {
            onAction();
        }
    };

    const ctaLabel = navigateTo ? (navigateLabel || actionLabel) : actionLabel;

    return (
        <Card sx={{ backgroundColor: 'transparent', border: 'none', boxShadow: 'none' }}>
            <CardContent sx={{ p: 0 }}>
                <Stack spacing={2} alignItems="flex-start">
                    {eyebrow ? (
                        <Typography
                            variant="overline"
                            sx={{
                                color: '#71717a',
                                letterSpacing: '0.08em',
                                fontSize: '0.65rem',
                                fontWeight: 500
                            }}
                        >
                            {eyebrow}
                        </Typography>
                    ) : null}
                    <Box>
                        <Typography
                            variant="h6"
                            sx={{
                                mb: 1,
                                color: '#a1a1aa',
                                fontWeight: 600
                            }}
                        >
                            {title}
                        </Typography>
                        <Typography
                            variant="body2"
                            sx={{
                                color: '#71717a',
                                maxWidth: 560,
                                lineHeight: 1.5
                            }}
                        >
                            {description}
                        </Typography>
                    </Box>
                    {ctaLabel ? (
                        <Button
                            variant={navigateTo ? 'contained' : 'outlined'}
                            disabled={isActionDisabled}
                            onClick={handleAction}
                            sx={{ mt: 1 }}
                        >
                            {ctaLabel}
                        </Button>
                    ) : null}
                </Stack>
            </CardContent>
        </Card>
    );
}

export default EmptyState;
