import React from 'react';
import {
    Box,
    Card,
    CardContent,
    Chip,
    Stack,
    Typography,
} from '@mui/material';
import EmptyState from '../common/EmptyState';

const PANEL_CARD_SX = {
    backgroundColor: '#18181b',
    border: '1px solid #27272a',
};

const ENTRY_ACTIVE_SX = {
    border: '1px solid #10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 2,
    px: 1.5,
    py: 1.25,
    cursor: 'pointer',
    transition: 'background-color 0.16s ease, border-color 0.16s ease',
    '&:hover': { backgroundColor: 'rgba(16, 185, 129, 0.18)' },
};

const ENTRY_INACTIVE_SX = {
    border: '1px solid #27272a',
    backgroundColor: '#111827',
    borderRadius: 2,
    px: 1.5,
    py: 1.25,
    cursor: 'pointer',
    transition: 'background-color 0.16s ease, border-color 0.16s ease',
    '&:hover': { backgroundColor: '#161b22' },
};

/**
 * Panel listant les BOMs sélectionnées pour la session.
 * Un clic sur une entrée active cette BOM.
 */
function BomSelectionPanel({
    selectedEntries = [],
    activeRevisionId = null,
    loadingRevisionId = null,
    bomWorkspace = {},
    onActivateEntry,
}) {
    return (
        <Card sx={PANEL_CARD_SX}>
            <CardContent>
                <Stack spacing={2}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
                        <Box>
                            <Typography variant="h6" sx={{ color: '#f4f4f5', fontWeight: 600 }}>
                                BOM sélectionnées
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#a1a1aa', mt: 0.5 }}>
                                Clique sur une ligne pour changer de BOM active. La revue se fait une BOM à la fois.
                            </Typography>
                        </Box>
                        <Chip
                            label={`${selectedEntries.length} BOM dans la session`}
                            size="small"
                            variant="outlined"
                            sx={{ alignSelf: 'flex-start' }}
                        />
                    </Stack>

                    {!selectedEntries.length ? (
                        <EmptyState
                            eyebrow="Session vide"
                            title="Aucune BOM à revoir"
                            description="Ouvre une sélection depuis Fichier BOM ou poursuis depuis Import BOM pour alimenter cette page."
                            actionLabel="Charger une BOM"
                        />
                    ) : (
                        <Box sx={{ maxHeight: 300, overflowY: 'auto', pr: 0.5 }}>
                            <Stack spacing={1}>
                                {selectedEntries.map((entry) => {
                                    const isActive = entry.bom_revision_id === activeRevisionId;
                                    const cachedRevision = bomWorkspace.revisionsById?.[entry.bom_revision_id];
                                    const entryStatus = cachedRevision?.status || entry.status || 'DRAFT';
                                    const isLoading = loadingRevisionId === entry.bom_revision_id;

                                    return (
                                        <Box
                                            key={entry.bom_revision_id}
                                            onClick={() => onActivateEntry(entry)}
                                            sx={isActive ? ENTRY_ACTIVE_SX : ENTRY_INACTIVE_SX}
                                        >
                                            <Stack
                                                direction={{ xs: 'column', md: 'row' }}
                                                justifyContent="space-between"
                                                spacing={1.5}
                                            >
                                                <Box sx={{ minWidth: 0 }}>
                                                    <Typography variant="body2" sx={{ color: '#f4f4f5', fontWeight: 600 }}>
                                                        {`${entry.reference || 'BOM'} ${entry.revision || ''} ${entry.side || ''}`.trim()}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                                                        {entry.file_name || 'BOM harmonisée'}
                                                        {cachedRevision?.itemCount ? ` — ${cachedRevision.itemCount} lignes` : ''}
                                                        {isLoading ? ' — chargement...' : ''}
                                                    </Typography>
                                                </Box>

                                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                    <Chip
                                                        label={entryStatus}
                                                        size="small"
                                                        color={entryStatus === 'ACTIVE' ? 'success' : 'default'}
                                                        variant="outlined"
                                                    />
                                                    {isActive ? (
                                                        <Chip label="BOM active" size="small" color="success" />
                                                    ) : null}
                                                </Stack>
                                            </Stack>
                                        </Box>
                                    );
                                })}
                            </Stack>
                        </Box>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
}

export default React.memo(BomSelectionPanel);
