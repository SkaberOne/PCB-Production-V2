import React from 'react';
import apiClient from '../api/client';
import { extractRequestError } from '../utils/machinePnp';

/**
 * Manages the core PnP workspace data: machines, feeder types, carts, productions.
 * Provides global feedback, actionLoading, deleteDialog state, and loadWorkspace.
 */
export function useWorkspaceData() {
    const [machines, setMachines] = React.useState([]);
    const [feeders, setFeeders] = React.useState([]);
    const [carts, setCarts] = React.useState([]);
    const [productions, setProductions] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [feedback, setFeedback] = React.useState({ type: 'info', message: '' });
    const [actionLoading, setActionLoading] = React.useState('');
    const [deleteDialog, setDeleteDialog] = React.useState({ open: false, type: '', item: null });

    // Garde de montage : empêche tout setState après démontage (warnings React /
    // états fantômes) sur les chargeurs partagés effet + handlers.
    const mountedRef = React.useRef(true);
    React.useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const loadWorkspace = React.useCallback(async () => {
        if (mountedRef.current) setLoading(true);
        try {
            const [machinesResponse, feedersResponse, cartsResponse, productionsResponse] = await Promise.all([
                apiClient.get('/marketplace/machines', { params: { limit: 200 } }),
                apiClient.get('/marketplace/feeder-types', { params: { limit: 200 } }),
                apiClient.get('/marketplace/carts', { params: { limit: 200 } }),
                apiClient.get('/marketplace/productions'),
            ]);
            if (!mountedRef.current) return;
            setMachines(machinesResponse.data?.data || []);
            setFeeders(feedersResponse.data?.data || []);
            setCarts(cartsResponse.data?.data || []);
            const productionsData = productionsResponse.data;
            setProductions(
                Array.isArray(productionsData)
                    ? productionsData
                    : (productionsData?.items || productionsData?.data || []),
            );
            setFeedback({ type: 'info', message: '' });
        } catch (requestError) {
            if (!mountedRef.current) return;
            setFeedback({
                type: 'error',
                message: extractRequestError(requestError, 'Impossible de charger la configuration PnP.'),
            });
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        loadWorkspace();
    }, [loadWorkspace]);

    return {
        machines,
        feeders,
        carts,
        productions,
        loading,
        feedback,
        setFeedback,
        actionLoading,
        setActionLoading,
        deleteDialog,
        setDeleteDialog,
        loadWorkspace,
    };
}
