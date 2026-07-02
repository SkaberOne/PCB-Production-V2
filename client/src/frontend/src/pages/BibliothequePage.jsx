import React from 'react';
import { Stack, Tab, Tabs } from '@mui/material';
import PageHeader from '../components/common/PageHeader';
import ComposantsPanel from '../components/library/ComposantsPanel';
import StockPanel from '../components/library/StockPanel';

/**
 * Section « Bibliothèque » (ADR 0010) — livrée derrière le flag `libraryStock`.
 * Onglet Composants : réutilise le panneau existant du référentiel.
 * Onglet Stock : inventaire physique interne (solde, seuils, mouvements).
 */
function BibliothequePage() {
    const [activeTab, setActiveTab] = React.useState(0);
    return (
        <Stack spacing={4}>
            <PageHeader
                eyebrow="Bibliothèque"
                title="Bibliothèque"
                description="Composants du référentiel et inventaire physique interne des composants."
            />
            <Tabs
                value={activeTab}
                onChange={(event, value) => setActiveTab(value)}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
                aria-label="Sections de la bibliothèque"
                sx={{ borderBottom: '1px solid #1f2937' }}
            >
                <Tab label="Composants" id="lib-tab-0" aria-controls="lib-panel-0" />
                <Tab label="Stock" id="lib-tab-1" aria-controls="lib-panel-1" />
            </Tabs>

            {activeTab === 0 ? <ComposantsPanel /> : null}
            {activeTab === 1 ? <StockPanel /> : null}
        </Stack>
    );
}

export default BibliothequePage;
