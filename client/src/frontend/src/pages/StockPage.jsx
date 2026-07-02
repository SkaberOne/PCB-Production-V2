import React from 'react';
import { Stack, Tab, Tabs } from '@mui/material';
import PageHeader from '../components/common/PageHeader';
import StockPanel from '../components/library/StockPanel';
import ProduceCheckPanel from '../components/library/ProduceCheckPanel';

/**
 * Section « Stock » (ADR 0010 / 0011) — derrière le flag `libraryStock`.
 * Onglet Inventaire : soldes, seuils, mouvements (Phase 1).
 * Onglet « Puis-je produire ? » : anticipation des manques + clôture de prod (Phase 2).
 */
function StockPage() {
    const [activeTab, setActiveTab] = React.useState(0);
    return (
        <Stack spacing={4}>
            <PageHeader
                eyebrow="Bibliothèque"
                title="Stock"
                description="Inventaire physique interne des composants et anticipation des manques."
            />
            <Tabs
                value={activeTab}
                onChange={(event, value) => setActiveTab(value)}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
                aria-label="Sections du stock"
                sx={{ borderBottom: '1px solid #1f2937' }}
            >
                <Tab label="Inventaire" id="stock-tab-0" aria-controls="stock-panel-0" />
                <Tab label="Puis-je produire ?" id="stock-tab-1" aria-controls="stock-panel-1" />
            </Tabs>

            {activeTab === 0 ? <StockPanel /> : null}
            {activeTab === 1 ? <ProduceCheckPanel /> : null}
        </Stack>
    );
}

export default StockPage;
