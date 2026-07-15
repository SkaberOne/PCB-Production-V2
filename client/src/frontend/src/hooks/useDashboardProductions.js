import React from 'react';
import apiClient from '../api/client';
import { hydrateProductionWorkspace } from '../utils/productionWorkspace';

function buildMergedActiveProduction(currentProduction, summary) {
    if (!currentProduction) {
        return summary;
    }

    return {
        ...summary,
        linked_references: Array.isArray(summary?.linked_references)
            ? summary.linked_references
            : currentProduction.linkedReferences,
        bom_revisions: Array.isArray(summary?.bom_revisions)
            ? summary.bom_revisions
            : currentProduction.bomRevisions,
    };
}

function useDashboardProductions({
    activeProduction,
    setActiveProduction,
    clearActiveProduction,
    activateProductionSession,
    setImportedBom,
    setSelectedBomEntries,
    updateImportWorkspace,
    clearCurrentBom,
}) {
    // Ref to read activeProduction inside callbacks without adding it to deps (breaks infinite loop)
    const activeProductionRef = React.useRef(activeProduction);
    React.useEffect(() => { activeProductionRef.current = activeProduction; }, [activeProduction]);
    const [bomStats, setBomStats] = React.useState(null);
    const [productions, setProductions] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [refreshCooldown, setRefreshCooldown] = React.useState(false);
    const [feedback, setFeedback] = React.useState({ type: 'info', message: '' });
    const [actionLoadingId, setActionLoadingId] = React.useState(null);

    const fetchProductionDetail = React.useCallback(async (productionId) => {
        const response = await apiClient.get(`/marketplace/productions/${productionId}`);
        return response.data;
    }, []);

    const hydrateProductionSession = React.useCallback(async (productionDetail) => {
        await hydrateProductionWorkspace({
            productionDetail,
            activateProductionSession,
            setSelectedBomEntries,
            setImportedBom,
            updateImportWorkspace,
            clearCurrentBom,
        });
    }, [
        activateProductionSession,
        clearCurrentBom,
        setImportedBom,
        setSelectedBomEntries,
        updateImportWorkspace,
    ]);

    const syncProductionSession = React.useCallback(async (items) => {
        const activeProduction = activeProductionRef.current;
        const safeItems = Array.isArray(items) ? items : [];
        const currentProductionSummary = activeProduction?.id
            ? safeItems.find((production) => production.id === activeProduction.id) || null
            : null;

        if (currentProductionSummary && activeProduction) {
            setActiveProduction(buildMergedActiveProduction(activeProduction, currentProductionSummary));
            return;
        }

        const activeServerProduction = safeItems.find((production) => production.status === 'ACTIVE') || null;
        if (!activeServerProduction) {
            if (activeProduction) {
                clearActiveProduction();
            }
            return;
        }

        const productionDetail = await fetchProductionDetail(activeServerProduction.id);
        await hydrateProductionSession(productionDetail);
    }, [
        // activeProduction removed — read via ref to break the infinite loop
        clearActiveProduction,
        fetchProductionDetail,
        hydrateProductionSession,
        setActiveProduction,
    ]);

    const loadProductions = React.useCallback(async ({ preserveFeedback = false } = {}) => {
        setLoading(true);
        try {
            const response = await apiClient.get(`/marketplace/productions`);
            const items = response.data?.items || [];
            setProductions(items);
            await syncProductionSession(items);
            if (!preserveFeedback) {
                setFeedback({ type: 'info', message: '' });
            }
        } catch (requestError) {
            setFeedback({
                type: 'error',
                message: requestError.response?.data?.detail || requestError.message || 'Erreur lors du chargement des productions',
            });
        } finally {
            setLoading(false);
        }
    }, [syncProductionSession]);

    React.useEffect(() => {
        loadProductions();
    }, [loadProductions]);

    // Fetch BOM stats whenever the active production changes (A8)
    React.useEffect(() => {
        if (!activeProduction?.id) {
            setBomStats(null);
            return;
        }
        apiClient
            .get(`/reports/bom-stats?production_id=${activeProduction.id}`)
            .then((res) => setBomStats(res.data))
            .catch(() => setBomStats(null));
    }, [activeProduction?.id]);

    const handleRefresh = React.useCallback(() => {
        if (refreshCooldown) return;
        setRefreshCooldown(true);
        loadProductions();
        setTimeout(() => setRefreshCooldown(false), 1500);
    }, [loadProductions, refreshCooldown]);

    return {
        bomStats,
        productions,
        loading,
        refreshCooldown,
        feedback,
        setFeedback,
        actionLoadingId,
        setActionLoadingId,
        fetchProductionDetail,
        hydrateProductionSession,
        loadProductions,
        handleRefresh,
    };
}

export default useDashboardProductions;
