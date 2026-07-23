import React from 'react';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import PrecisionManufacturingRoundedIcon from '@mui/icons-material/PrecisionManufacturingRounded';
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import DeveloperBoardRoundedIcon from '@mui/icons-material/DeveloperBoardRounded';
import apiClient from '../api/client';
import { colors } from '../theme';

const ZERO = {
    catalogue: { references: 0, revisions: 0 },
    stock: { cartes_en_stock: 0, references_distinctes: 0, valeur: 0, a_prix: false },
    stock_bas: 0,
    productions_en_cours: { total: 0, active: 0, draft: 0 },
    commandes_clients_a_preparer: { total: 0, open: 0, ready: 0 },
    cartes_a_debugger: 0,
    machines: 0,
};

function eur(v) {
    if (v == null || Number.isNaN(Number(v))) return '— €';
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v); }
    catch (e) { return `${Number(v).toFixed(2)} €`; }
}

/**
 * Vue d'ensemble globale du dashboard (prompt 024). Charge l'agrégat
 * /reports/dashboard-overview et construit la rangée 1 (StatCard) + le bandeau
 * de mini-stats. Indépendant de la session.
 */
export default function useDashboardOverview(navigate) {
    const [overview, setOverview] = React.useState(null);

    const reloadOverview = React.useCallback(async () => {
        try {
            const res = await apiClient.get('/reports/dashboard-overview');
            setOverview(res.data);
        } catch (e) { /* silencieux : le dashboard reste utilisable */ }
    }, []);

    React.useEffect(() => { reloadOverview(); }, [reloadOverview]);

    // Repli robuste : réponse absente ou malformée → agrégat à zéro.
    const o = overview && overview.catalogue ? overview : ZERO;

    const statCards = [
        {
            label: 'Cartes au catalogue',
            value: o.catalogue.references,
            hint: `${o.catalogue.revisions} révision(s)`,
            icon: StorageRoundedIcon,
            color: colors.green,
            onClick: () => navigate('/base-donnees?tab=cartes'),
        },
        {
            label: 'Cartes en stock',
            value: o.stock.cartes_en_stock,
            hint: `${o.stock.references_distinctes} référence(s) · valeur ${o.stock.a_prix ? eur(o.stock.valeur) : '— € (prix à renseigner)'}`,
            icon: Inventory2RoundedIcon,
            color: colors.blue,
            onClick: () => navigate('/stock-cartes'),
        },
        {
            label: 'Alertes stock bas',
            value: o.stock_bas,
            hint: o.stock_bas === 0 ? 'aucune sous le minimum' : `${o.stock_bas} à réapprovisionner`,
            icon: WarningRoundedIcon,
            color: o.stock_bas > 0 ? colors.red : colors.green,
            onClick: () => navigate('/stock-cartes'),
        },
        {
            label: 'Productions en cours',
            value: o.productions_en_cours.total,
            hint: `${o.productions_en_cours.active} active(s) · ${o.productions_en_cours.draft} brouillon(s)`,
            icon: PrecisionManufacturingRoundedIcon,
            color: colors.green,
            onClick: () => {
                const el = typeof document !== 'undefined' && document.getElementById('dashboard-productions');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            },
        },
    ];

    const miniStats = [
        {
            label: 'Commandes clients à préparer',
            value: o.commandes_clients_a_preparer.total,
            hint: `${o.commandes_clients_a_preparer.open} ouverte(s) · ${o.commandes_clients_a_preparer.ready} prête(s)`,
            icon: ShoppingCartRoundedIcon,
            color: colors.amber,
            onClick: () => navigate('/commande-client'),
        },
        {
            label: 'Cartes à débugger',
            value: o.cartes_a_debugger,
            hint: 'stock cartes',
            icon: BugReportRoundedIcon,
            color: colors.red,
            onClick: () => navigate('/stock-cartes'),
        },
        {
            label: 'Modèles machines',
            value: o.machines,
            hint: 'catalogue machines',
            icon: DeveloperBoardRoundedIcon,
            color: colors.textSecondary,
            onClick: () => navigate('/machine-pnp'),
        },
    ];

    return { overview, reloadOverview, statCards, miniStats };
}
