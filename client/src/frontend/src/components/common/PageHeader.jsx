import React from 'react';
import { Box, Stack, Typography } from '@mui/material';

function PageHeader({ eyebrow, title, description, actions = null }) {
    return (
        <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'flex-end' }}
            sx={{ mb: 3 }}
        >
            <Box>
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
                <Typography 
                    variant="h4" 
                    sx={{ 
                        mb: 1,
                        color: '#f4f4f5',
                        fontWeight: 700
                    }}
                >
                    {title}
                </Typography>
                {description ? (
                    <Typography 
                        variant="body1" 
                        sx={{ 
                            color: '#a1a1aa',
                            maxWidth: 760,
                            lineHeight: 1.6
                        }}
                    >
                        {description}
                    </Typography>
                ) : null}
            </Box>
            {actions}
        </Stack>
    );
}

export default PageHeader;
