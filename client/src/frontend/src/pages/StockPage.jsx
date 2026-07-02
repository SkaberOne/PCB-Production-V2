import React from 'react';
import { Stack } from '@mui/material';
import PageHeader from '../components/common/PageHeader';
import StockPanel from '../components/library/StockPanel';

/**
 * Page « Stock » (ADR 0010) — livrée derrière le flag `libraryStock`.
 * Inventaire physique interne des composants (soldes, seuils, mouvements).
 * Le référentiel composants reste dans « Base de données → Composants ».
 */
function StockPage() {
    return (
        <Stack spacing={4}>
            <PageHeader
                eyebrow="Bibliothèque"
                title="Stock"
                description="Inventaire physique interne des composants : soldes, seuils et mouvements."
            />
            <StockPanel />
        </Stack>
    );
}

export default StockPage;
