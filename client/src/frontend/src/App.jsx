import React from 'react';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import PrecisionManufacturingRoundedIcon from '@mui/icons-material/PrecisionManufacturingRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded';
import TableViewRoundedIcon from '@mui/icons-material/TableViewRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import ErrorBoundary from './components/common/ErrorBoundary';
import BomFilesPage from './pages/BomFilesPage';
import BomViewerPage from './pages/BomViewerPage';
import CommandPage from './pages/CommandPage';
import DashboardPage from './pages/DashboardPage';
import ErpDefaultsPage from './pages/ErpDefaultsPage';
import ImportBomPage from './pages/ImportBomPage';
import MachinePnpPage from './pages/MachinePnpPage';
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
        path: '/fichier-bom',
        label: 'BOM enregistrées',
        title: 'BOM enregistrées',
        description: 'Sélection de BOM harmonisées déjà importées et organisées par référence.',
        icon: FolderRoundedIcon,
        group: 'library',
        step: null
    },
    {
        path: '/parametre',
        label: 'Paramètres',
        title: 'Administration et référentiels',
        description: 'Base de données, mappings, harmonisation, machines et chemins.',
        icon: SettingsRoundedIcon,
        group: 'system',
        step: null
    }
];

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
                <Route path="/parametre" element={<ErrorBoundary context="Parametres"><SettingsPage /></ErrorBoundary>} />
                <Route path="/parametre-erp" element={<ErrorBoundary context="Defauts ERP"><ErpDefaultsPage /></ErrorBoundary>} />
            </Routes>
        </AppShell>
    );
}

export default App;
