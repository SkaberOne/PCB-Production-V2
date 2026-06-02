import React from 'react';
import { Alert, Box, Button, Card, CardContent, Grid, Typography } from '@mui/material';
import { colors } from '../../theme';

// Tuiles en thème dark : fond teinté subtil + valeur en couleur sémantique vive.
const TILE_TONES = {
    info: { value: colors.blue, tint: 'rgba(59, 130, 246, 0.10)', edge: 'rgba(59, 130, 246, 0.25)' },
    success: { value: colors.green, tint: 'rgba(16, 185, 129, 0.10)', edge: 'rgba(16, 185, 129, 0.25)' },
    warning: { value: colors.amber, tint: 'rgba(245, 158, 11, 0.10)', edge: 'rgba(245, 158, 11, 0.25)' },
    neutral: { value: colors.textPrimary, tint: 'rgba(255, 255, 255, 0.04)', edge: colors.border },
};

function StatTile({ value, label, tone = 'neutral' }) {
    const t = TILE_TONES[tone] || TILE_TONES.neutral;
    return (
        <Box
            sx={{
                p: 2,
                backgroundColor: t.tint,
                border: `1px solid ${t.edge}`,
                borderRadius: 2,
                textAlign: 'center',
            }}
        >
            <Typography variant="h5" sx={{ color: t.value }}>
                {value}
            </Typography>
            <Typography variant="caption" sx={{ color: colors.textSecondary }}>
                {label}
            </Typography>
        </Box>
    );
}

function BomImportOverviewPanel({
    missingComponentGroups,
    missingFootprintGroups,
    itemUpdateState,
    result,
    stats,
    updateWorkspace,
    warnings = [],
    errors = [],
}) {
    return (
        <>
            {missingComponentGroups.length > 0 ? (
                <Alert
                    severity="warning"
                    sx={{ mb: 2 }}
                    action={(
                        <Button
                            color="inherit"
                            size="small"
                            onClick={() => updateWorkspace((current) => ({ ...current, componentResolutionPaused: false }))}
                        >
                            Mapper
                        </Button>
                    )}
                >
                    {missingComponentGroups.length} composant(s) absent(s) de la base.
                </Alert>
            ) : null}

            {missingFootprintGroups.length > 0 ? (
                <Alert
                    severity="warning"
                    sx={{ mb: 2 }}
                    action={(
                        <Button
                            color="inherit"
                            size="small"
                            onClick={() => updateWorkspace((current) => ({ ...current, footprintResolutionPaused: false }))}
                        >
                            Mapper
                        </Button>
                    )}
                >
                    {missingFootprintGroups.length} empreinte(s) Eagle sans footprint PnP dans la base.
                </Alert>
            ) : null}

            {itemUpdateState.message ? (
                <Alert severity={itemUpdateState.type} sx={{ mb: 2 }}>
                    {itemUpdateState.message}
                </Alert>
            ) : null}

            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                        Statistiques d'import
                    </Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={6} sm={3}>
                            <StatTile
                                value={result.item_count}
                                label="Lignes importées"
                                tone="info"
                            />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <StatTile
                                value={stats.auto_harmonized || 0}
                                label="Valeurs harmonisées"
                                tone="success"
                            />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <StatTile
                                value={stats.manual_review || 0}
                                label="Valeurs conservées"
                                tone="warning"
                            />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <StatTile
                                value={warnings.length || 0}
                                label="Avertissements"
                                tone={warnings.length > 0 ? 'warning' : 'neutral'}
                            />
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {warnings.length > 0 ? (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                        Avertissements de parsing
                    </Typography>
                    <ul style={{ marginBottom: 0 }}>
                        {warnings.map((warning, index) => (
                            <li key={index}>{warning}</li>
                        ))}
                    </ul>
                </Alert>
            ) : null}

            {errors.length > 0 ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                        Lignes ignorees
                    </Typography>
                    <ul style={{ marginBottom: 0 }}>
                        {errors.map((itemError, index) => (
                            <li key={index}>{itemError}</li>
                        ))}
                    </ul>
                </Alert>
            ) : null}
        </>
    );
}

export default BomImportOverviewPanel;
