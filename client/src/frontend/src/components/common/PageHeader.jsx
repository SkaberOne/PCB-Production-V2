import React from 'react';
import { Box, Stack, Typography } from '@mui/material';

function PageHeader({ eyebrow, title, description, subtitle, actions = null }) {
    // Alias : certaines pages passent `subtitle` (historique) au lieu de `description`.
    const resolvedDescription = description != null ? description : subtitle;
    return (
        <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'flex-end' }}
            sx={{ mb: 1.5 }}
        >
            <Box>
                {eyebrow ? (
                    <Typography
                        variant="overline"
                        sx={{
                            color: 'text.secondary',
                            letterSpacing: '0.08em',
                            fontSize: '0.62rem',
                            fontWeight: 500,
                            lineHeight: 1.4
                        }}
                    >
                        {eyebrow}
                    </Typography>
                ) : null}
                <Typography
                    component="h2"
                    sx={{
                        mb: resolvedDescription ? 0.5 : 0,
                        color: '#f4f4f5',
                        fontWeight: 700,
                        fontSize: '1.05rem',
                        letterSpacing: '-0.01em'
                    }}
                >
                    {title}
                </Typography>
                {resolvedDescription ? (
                    <Typography
                        variant="body2"
                        sx={{
                            color: '#a1a1aa',
                            maxWidth: 640,
                            fontSize: '0.8rem',
                            lineHeight: 1.45
                        }}
                    >
                        {resolvedDescription}
                    </Typography>
                ) : null}
            </Box>
            {actions}
        </Stack>
    );
}

export default PageHeader;
