import React from 'react';
import { Alert, Box, Button, Card, CardContent, Grid, Typography } from '@mui/material';

function StatTile({ value, label, backgroundColor, color }) {
    return (
        <Box sx={{ p: 2, backgroundColor, borderRadius: 1, textAlign: 'center' }}>
            <Typography variant="h5" sx={{ color }}>
                {value}
            </Typography>
            <Typography variant="caption" sx={{ color: '#666' }}>
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
                                backgroundColor="#f5f5f5"
                                color="#1976d2"
                            />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <StatTile
                                value={stats.auto_harmonized || 0}
                                label="Valeurs harmonisées"
                                backgroundColor="#e8f5e9"
                                color="#4caf50"
                            />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <StatTile
                                value={stats.manual_review || 0}
                                label="Valeurs conservées"
                                backgroundColor="#fff3e0"
                                color="#ff9800"
                            />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <StatTile
                                value={warnings.length || 0}
                                label="Avertissements"
                                backgroundColor="#fce4ec"
                                color="#111827"
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
