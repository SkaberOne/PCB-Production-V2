import React from 'react';
import { Grid } from '@mui/material';
import StatCard from './StatCard';

function DashboardStatCards({ cards }) {
    return (
        <Grid container spacing={3}>
            {cards.map((card) => (
                <Grid item xs={12} sm={6} lg={3} key={card.label}>
                    <StatCard {...card} onClick={card.onClick || undefined} />
                </Grid>
            ))}
        </Grid>
    );
}

export default DashboardStatCards;
