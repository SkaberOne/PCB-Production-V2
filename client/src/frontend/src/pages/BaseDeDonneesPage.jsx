import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Stack, Tab, Tabs } from '@mui/material';
import PageHeader from '../components/common/PageHeader';
import CardCatalogPage from './CardCatalogPage';
import MpnEnrichmentPanel from '../components/library/MpnEnrichmentPanel';
import ReglesTypePanel from '../components/library/ReglesTypePanel';
import ComposantsPanel from '../components/library/ComposantsPanel';
import EmpreintesPanel from '../components/library/EmpreintesPanel';

function BaseDeDonneesPage() {
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = React.useState(
        () => (searchParams.get('tab') === 'cartes' ? 4 : 0),
    );
    // Ouverture directe de l'onglet Cartes via /base-donnees?tab=cartes (redirection /cartes).
    React.useEffect(() => {
        if (searchParams.get('tab') === 'cartes') setActiveTab(4);
    }, [searchParams]);
    return (
        <Stack spacing={4}>
            <PageHeader
                eyebrow="Bibliothèque"
                title="Base de données"
                description="Référentiel ECB : empreintes machine, composants, règles de type et enrichissement MPN."
            />
            <Tabs
                value={activeTab}
                onChange={(event, value) => setActiveTab(value)}
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
                aria-label="Sections de la base de données"
                sx={{ borderBottom: '1px solid #1f2937' }}
            >
                <Tab label="Empreintes" id="bdd-tab-0" aria-controls="bdd-panel-0" />
                <Tab label="Composants" id="bdd-tab-1" aria-controls="bdd-panel-1" />
                <Tab label="Règles de type" id="bdd-tab-2" aria-controls="bdd-panel-2" />
                <Tab label="Enrichissement MPN" id="bdd-tab-3" aria-controls="bdd-panel-3" />
                <Tab label="Cartes" id="bdd-tab-4" aria-controls="bdd-panel-4" />
            </Tabs>

            {activeTab === 0 ? (
                <EmpreintesPanel />
            ) : null}

            {activeTab === 1 ? (
                <ComposantsPanel />
            ) : null}

            {activeTab === 2 ? (
                <ReglesTypePanel />
            ) : null}

            {activeTab === 3 ? (
                <MpnEnrichmentPanel />
            ) : null}

            {activeTab === 4 ? (
                <CardCatalogPage embedded />
            ) : null}
        </Stack>
    );
}

export default BaseDeDonneesPage;
