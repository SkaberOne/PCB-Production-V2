import React, { useState } from 'react';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

/**
 * GuideBanner — contextual inline hint shown at the top of a page.
 *
 * Props:
 *  - message {string}         : guidance text
 *  - ctaLabel {string}        : optional CTA button label
 *  - ctaPath {string}         : optional route to navigate to on CTA click
 *  - onCta {function}         : optional callback (used if ctaPath not provided)
 *  - dismissible {boolean}    : show close button (default: true)
 *  - storageKey {string}      : if set, remember dismissal in sessionStorage
 */
function GuideBanner({
    message,
    ctaLabel,
    ctaPath,
    onCta,
    dismissible = true,
    storageKey
}) {
    const navigate = useNavigate();

    const isDismissed = storageKey
        ? sessionStorage.getItem(`guide_banner_${storageKey}`) === '1'
        : false;

    const [hidden, setHidden] = useState(isDismissed);

    if (hidden) return null;

    const handleDismiss = () => {
        setHidden(true);
        if (storageKey) {
            sessionStorage.setItem(`guide_banner_${storageKey}`, '1');
        }
    };

    const handleCta = () => {
        if (ctaPath) navigate(ctaPath);
        else if (typeof onCta === 'function') onCta();
    };

    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2,
                py: 1.25,
                mb: 2.5,
                borderRadius: 2,
                backgroundColor: 'rgba(5, 150, 105, 0.07)',
                border: '1px solid rgba(5, 150, 105, 0.2)'
            }}
        >
            <InfoOutlinedIcon sx={{ color: '#059669', fontSize: 18, flexShrink: 0 }} />

            <Typography
                variant="body2"
                sx={{ color: '#a1a1aa', flex: 1, fontSize: '0.8125rem', lineHeight: 1.4 }}
            >
                {message}
            </Typography>

            {ctaLabel && (
                <Button
                    size="small"
                    endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: 14 }} />}
                    onClick={handleCta}
                    sx={{
                        fontSize: '0.75rem',
                        color: '#10b981',
                        borderColor: 'rgba(16, 185, 129, 0.3)',
                        px: 1.5,
                        py: 0.4,
                        flexShrink: 0,
                        '&:hover': {
                            backgroundColor: 'rgba(16, 185, 129, 0.08)',
                            borderColor: '#10b981'
                        }
                    }}
                    variant="outlined"
                >
                    {ctaLabel}
                </Button>
            )}

            {dismissible && (
                <IconButton
                    size="small"
                    onClick={handleDismiss}
                    aria-label="Masquer ce conseil"
                    sx={{ color: '#a1a1aa', flexShrink: 0, p: 0.25 }}
                >
                    <CloseRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
            )}
        </Box>
    );
}

export default GuideBanner;
