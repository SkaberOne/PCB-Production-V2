import React from 'react';
import { Button, Chip, Stack, Typography } from '@mui/material';

// Récapitulatif d'un import CAO par dossier carte (prompt 012) : une ligne par
// révision, avec son statut (importée / déjà en base / KiCad à venir / erreur).
const STATUS_META = {
    imported: { color: 'success', label: 'importée' },
    ignored: { color: 'default', label: 'déjà en base' },
    kicad: { color: 'info', label: 'KiCad — à venir' },
    error: { color: 'error', label: 'erreur' },
    empty: { color: 'warning', label: 'aucun CAO' },
};

const ORDER = ['imported', 'ignored', 'kicad', 'empty', 'error'];

function CaoImportReport({ report, canReview, onOpenReview }) {
    if (!report) return null;
    const { reference, name, rows } = report;
    const counts = rows.reduce((acc, row) => {
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
    }, {});

    return (
        <Stack spacing={1.5} data-testid="cao-report">
            <Typography variant="body2" sx={{ color: '#e4e4e7' }}>
                Carte <strong>{reference || '—'}</strong>{name ? ` — ${name}` : ''} : {rows.length} révision(s).
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {ORDER.filter((status) => counts[status]).map((status) => (
                    <Chip key={status} size="small" color={STATUS_META[status].color} label={`${counts[status]} ${STATUS_META[status].label}`} />
                ))}
            </Stack>
            <Stack spacing={0.75}>
                {rows.map((row) => (
                    <Stack key={row.revision} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Chip size="small" variant="outlined" label={`Rev.${row.revision}`} />
                        <Chip size="small" color={STATUS_META[row.status].color} label={STATUS_META[row.status].label} />
                        {row.message ? (
                            <Typography variant="caption" sx={{ color: '#a1a1aa' }}>{row.message}</Typography>
                        ) : null}
                    </Stack>
                ))}
            </Stack>
            {canReview ? (
                <Button variant="contained" data-testid="cao-open-review" onClick={onOpenReview}>
                    Ouvrir la Revue peuplée
                </Button>
            ) : null}
        </Stack>
    );
}

export default CaoImportReport;
