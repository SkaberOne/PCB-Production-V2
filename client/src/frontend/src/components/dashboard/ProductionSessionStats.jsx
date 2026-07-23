import React from 'react';
import { Grid } from '@mui/material';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import StatCard from './StatCard';

/**
 * Stats de la production active (prompt 024) : « Points à vérifier » et
 * « Empreintes PnP » — déplacées de la tête de dashboard vers près de la
 * production active (n'ont de sens qu'avec une production chargée en session).
 */
function ProductionSessionStats({ currentBom, sessionStats, bomStats, activeProduction, onNavigate }) {
    if (!activeProduction) return null;

    const cards = [
        {
            label: 'Points à vérifier',
            value: currentBom ? sessionStats.reviewCount : (bomStats ? bomStats.items_to_verify : '--'),
            hint: 'Lignes sans empreinte PnP ou type composant à confirmer.',
            icon: WarningRoundedIcon,
            color: '#f59e0b',
            onClick: (currentBom || bomStats) ? () => onNavigate('/bom?filter=to_verify') : null,
        },
        {
            label: 'Empreintes PnP',
            value: currentBom ? sessionStats.mappedFootprintsCount : (bomStats ? bomStats.items_with_footprint_pnp : '--'),
            hint: 'Lignes ayant déjà une empreinte PnP renseignée.',
            icon: CheckCircleRoundedIcon,
            color: '#34d399',
            onClick: (currentBom || bomStats) ? () => onNavigate('/bom?filter=has_footprint') : null,
        },
    ];

    return (
        <Grid container spacing={2} sx={{ mb: 2 }}>
            {cards.map((c) => (
                <Grid item xs={6} key={c.label}>
                    <StatCard {...c} onClick={c.onClick || undefined} />
                </Grid>
            ))}
        </Grid>
    );
}

export default ProductionSessionStats;
