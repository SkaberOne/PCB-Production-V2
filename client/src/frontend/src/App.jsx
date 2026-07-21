import React from 'react';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import PrecisionManufacturingRoundedIcon from '@mui/icons-material/PrecisionManufacturingRounded';
import PriceChangeRoundedIcon from '@mui/icons-material/PriceChangeRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import TableViewRoundedIcon from '@mui/icons-material/TableViewRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import DeveloperBoardRoundedIcon from '@mui/icons-material/DeveloperBoardRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import { Navigate, Route, Routes } from 'react-router-dom';
import featureFlags from './utils/featureFlags';
import AppShell from './components/layout/AppShell';
import ErrorBoundary from './components/common/ErrorBoundary';
import StockPage from './pages/StockPage';
import BoardStockPage from './pages/BoardStockPage';
import ClientOrdersPage from './pages/ClientOrdersPage';
import BomFilesPage from './pages/BomFilesPage';
import BomViewerPage from './pages/BomViewerPage';
import CommandPage from './pages/CommandPage';
import DashboardPage from './pages/DashboardPage';
import ErpDefaultsPage from './pages/ErpDefaultsPage';
import ImportBomPage from './pages/ImportBomPage';
import CostingPage from './pages/CostingPage';
import MachinePnpPage from './pages/MachinePnpPage';
import BaseDeDonneesPage from './pages/BaseDeDonneesPage';
import CardCatalogPage from './pages/CardCatalogPage';
import SettingsPage from './pages/SettingsPage';
import './App.css';

// group: 'workflow' | 'library' | 'system'
// step: workflow step index (1-5) or null
const pages = [
    {
        path: '/dashboard',
        label: 'Productions',
        title: 'Productions',
        description: "Vue d'ensemble des productions, machines PnP et statuts de suivi.",
        icon: DashboardRoundedIcon,
        group: 'workflow',
        step: 1
    },
    {
        path: '/import-bom',
        label: 'Import BOM',
        title: 'Import et pré-traitement BOM',
        description: 'Import de fichiers, identification de révision et préparation de la revue.',
        icon: UploadFileRoundedIcon,
        group: 'workflow',
        step: 2
    },
    {
        path: '/bom',
        label: 'Revue BOM',
        title: 'Revue complète de la BOM',
        description: 'Édition inline, warnings, conversion Eagle -> PnP et export.',
        icon: TableViewRoundedIcon,
        group: 'workflow',
        step: 3
    },
    {
        path: '/commande-composant',
        label: 'Commande',
        title: 'Préparation commande composants',
        description: 'Agrégation multi-BOM, génération de liste et export Excel.',
        icon: ShoppingCartRoundedIcon,
        group: 'workflow',
        step: 4
    },
    {
        path: '/machine-pnp',
        label: 'Machine PnP',
        title: 'Gestion machine et production',
        description: 'Affectation de production, visualisation machine et suivi de statut.',
        icon: PrecisionManufacturingRoundedIcon,
        group: 'workflow',
        step: 5
    },
    {
        path: '/prix-carte',
        label: 'Prix carte',
        title: 'Prix carte à la production',
        description: 'Coût de revient HT/TTC d\'une carte produite et prix de référence par carte.',
        icon: PriceChangeRoundedIcon,
        group: 'library',
        step: null
    },
    {
        path: '/fichier-bom',
        label: 'BOM enregistrées',
        title: 'BOM enregistrées',
        description: 'Sélection de BOM harmonisées déjà importées et organisées par référence.',
        icon: FolderRoundedIcon,
        group: 'library',
        step: null
    },
    {
        path: '/cartes',
        label: 'Cartes',
        title: 'Catalogue des cartes',
        description: 'Fiche unifiée par carte : référence, code KELENN, nom, type, révisions, prix et assemblages.',
        icon: DeveloperBoardRoundedIcon,
        group: 'library',
        step: null
    },
    {
        path: '/base-donnees',
        label: 'Base de données',
        title: 'Base de données',
        description: 'Empreintes machine, composants, règles de type et enrichissement MPN du référentiel.',
        icon: StorageRoundedIcon,
        group: 'library',
        step: null
    },
    {
        path: '/stock-cartes',
        label: 'Stock Cartes',
        title: 'Stock des cartes produites',
        description: 'Stock de cartes finies par référence : quantité, minimum, prix, état QA.',
        icon: DeveloperBoardRoundedIcon,
        group: 'stock',
        step: null
    },
    {
        path: '/commande-client',
        label: 'Commande Client/Machine',
        title: 'Commandes client / machine',
        description: 'Demandes de cartes (client ou machine), préparation de boîte et suivi.',
        icon: LocalShippingRoundedIcon,
        group: 'stock',
        step: null
    },
    {
        path: '/parametre',
        label: 'Paramètres',
        title: 'Réglages de l\'application',
        description: 'Intégrations API fournisseurs, valeurs ERP par défaut et chemins des flux locaux.',
        icon: SettingsRoundedIcon,
        group: 'system',
        step: null
    }
];

// Section « Bibliothèque » (inventaire physique) livrée derrière le flag
// `libraryStock` (ADR 0010) : masquée en release, activable pour test atelier.
if (featureFlags.libraryStock) {
    pages.splice(8, 0, {
        path: '/stock',
        label: 'Stock',
        title: 'Stock',
        description: 'Inventaire physique interne des composants : soldes, seuils et mouvements.',
        icon: Inventory2RoundedIcon,
        group: 'stock',
        step: null
    });
}

function App() {
    return (
        <AppShell pages={pages}>
            <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<ErrorBoundary context="Dashboard"><DashboardPage /></ErrorBoundary>} />
                <Route path="/import-bom" element={<ErrorBoundary context="Import BOM"><ImportBomPage /></ErrorBoundary>} />
                <Route path="/fichier-bom" element={<ErrorBoundary context="Fichier BOM"><BomFilesPage /></ErrorBoundary>} />
                <Route path="/bom" element={<ErrorBoundary context="BOM Viewer"><BomViewerPage /></ErrorBoundary>} />
                <Route path="/visualisation-bom" element={<Navigate to="/bom" replace />} />
                <Route path="/commande-composant" element={<ErrorBoundary context="Commande"><CommandPage /></ErrorBoundary>} />
                <Route path="/machine-pnp" element={<ErrorBoundary context="Machine PnP"><MachinePnpPage /></ErrorBoundary>} />
                <Route path="/prix-carte" element={<ErrorBoundary context="Prix carte"><CostingPage /></ErrorBoundary>} />
                <Route path="/cartes" element={<ErrorBoundary context="Catalogue Cartes"><CardCatalogPage /></ErrorBoundary>} />
                <Route path="/base-donnees" element={<ErrorBoundary context="Base de donnees"><BaseDeDonneesPage /></ErrorBoundary>} />
                {featureFlags.libraryStock ? (
                    <Route path="/stock" element={<ErrorBoundary context="Stock"><StockPage /></ErrorBoundary>} />
                ) : null}
                <Route path="/stock-cartes" element={<ErrorBoundary context="Stock Cartes"><BoardStockPage /></ErrorBoundary>} />
                <Route path="/commande-client" element={<ErrorBoundary context="Commande Client"><ClientOrdersPage /></ErrorBoundary>} />
                <Route path="/parametre" element={<ErrorBoundary context="Parametres"><SettingsPage /></ErrorBoundary>} />
                <Route path="/parametre-erp" element={<ErrorBoundary context="Defauts ERP"><ErpDefaultsPage /></ErrorBoundary>} />
            </Routes>
        </AppShell>
    );
}

export default App;
