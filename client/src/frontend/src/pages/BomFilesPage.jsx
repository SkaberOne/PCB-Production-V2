import React from 'react';
import { Box, Typography, Stack } from '@mui/material';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import PageHeader from '../components/common/PageHeader';

function BomFilesPage() {
    return (
        <Box sx={{ p: 3 }}>
            <PageHeader
                title="Fichiers BOM"
                subtitle="Gestion des fichiers BOM harmonisés"
            />
            <Stack spacing={2} sx={{ mt: 3, alignItems: 'center', pt: 6, opacity: 0.5 }}>
                <FolderOpenRoundedIcon sx={{ fontSize: 56, color: '#52525b' }} />
                <Typography variant="body1" sx={{ color: '#a1a1aa' }}>
                    Page en cours de reconstruction
                </Typography>
                <Typography variant="body2" sx={{ color: '#71717a' }}>
                    Cette page sera disponible prochainement.
                </Typography>
            </Stack>
        </Box>
    );
}

export default BomFilesPage;
