import React from 'react';
import apiClient from '../api/client';
import {
    buildFixedFeederFeedbackMessage,
    createFixedFeederFormState,
    extractRequestError,
    parsePositiveInteger,
} from '../utils/machinePnp';
import { useFixedFeederDerived } from './useFixedFeederDerived';

/**
 * Manages fixed feeder list, filters, sort, dialog state, and all CRUD operations.
 *
 * @param {object} opts
 * @param {Array}    opts.feeders         - Feeder types from useWorkspaceData
 * @param {Array}    opts.carts           - Carts from useWorkspaceData
 * @param {Function} opts.setFeedback     - Global feedback setter from useWorkspaceData
 * @param {Function} opts.setActionLoading
 * @param {string}   opts.actionLoading
 * @param {Function} opts.loadWorkspace   - Refresh workspace after mutations
 */
export function useFixedFeeders({ feeders, carts, setFeedback, setActionLoading, actionLoading, loadWorkspace }) {
    const [fixedFeederRows, setFixedFeederRows] = React.useState([]);
    const [fixedFeederListLoading, setFixedFeederListLoading] = React.useState(false);
    const [fixedFeederSummary, setFixedFeederSummary] = React.useState(null);

    // Dialog
    const [fixedFeederDialogOpen, setFixedFeederDialogOpen] = React.useState(false);
    const [editingFixedFeeder, setEditingFixedFeeder] = React.useState(null);
    const [fixedFeederForm, setFixedFeederForm] = React.useState(createFixedFeederFormState);
    const [fixedFeederDialogError, setFixedFeederDialogError] = React.useState('');
    const [fixedFeederComponentSearch, setFixedFeederComponentSearch] = React.useState('');
    const [fixedFeederCandidates, setFixedFeederCandidates] = React.useState([]);
    const [fixedFeederCandidatesLoading, setFixedFeederCandidatesLoading] = React.useState(false);

    const deferredFixedFeederComponentSearch = React.useDeferredValue(fixedFeederComponentSearch);

    // Garde de montage + jeton « dernière requête gagne » pour la recherche de
    // candidats (évite qu'une réponse lente écrase une saisie plus récente, et tout
    // setState après fermeture/démontage du dialogue).
    const mountedRef = React.useRef(true);
    React.useEffect(() => () => { mountedRef.current = false; }, []);
    const latestCandidatesRef = React.useRef(0);

    // ── Loaders ───────────────────────────────────────────────────────────────

    const loadFixedFeederRows = React.useCallback(async () => {
        if (mountedRef.current) setFixedFeederListLoading(true);
        try {
            const response = await apiClient.get('/marketplace/fixed-feeders/components', {
                params: { only_fixed: true, limit: 500 },
            });
            if (!mountedRef.current) return false;
            setFixedFeederRows(response.data?.data || []);
            return true;
        } catch (requestError) {
            if (mountedRef.current) {
                setFeedback({
                    type: 'error',
                    message: extractRequestError(requestError, 'Impossible de charger la liste des feeders fixes.'),
                });
            }
            return false;
        } finally {
            if (mountedRef.current) setFixedFeederListLoading(false);
        }
    }, [setFeedback]);

    const loadFixedFeederCandidates = React.useCallback(async (searchValue) => {
        if (!fixedFeederDialogOpen) {
            return;
        }
        const requestId = (latestCandidatesRef.current += 1);
        if (mountedRef.current) setFixedFeederCandidatesLoading(true);
        try {
            const response = await apiClient.get('/marketplace/fixed-feeders/components', {
                params: {
                    only_fixed: false,
                    limit: 60,
                    ...(String(searchValue || '').trim() ? { search: String(searchValue).trim() } : {}),
                },
            });
            if (!mountedRef.current || requestId !== latestCandidatesRef.current) return;
            setFixedFeederCandidates(response.data?.data || []);
        } catch (requestError) {
            if (!mountedRef.current || requestId !== latestCandidatesRef.current) return;
            setFixedFeederCandidates([]);
            setFixedFeederDialogError(extractRequestError(requestError, 'Impossible de charger les composants candidats.'));
        } finally {
            if (mountedRef.current && requestId === latestCandidatesRef.current) setFixedFeederCandidatesLoading(false);
        }
    }, [fixedFeederDialogOpen]);

    // ── Auto-load effects ─────────────────────────────────────────────────────

    React.useEffect(() => {
        loadFixedFeederRows();
    }, [loadFixedFeederRows]);

    React.useEffect(() => {
        if (!fixedFeederDialogOpen || editingFixedFeeder) {
            return;
        }
        loadFixedFeederCandidates(deferredFixedFeederComponentSearch);
    }, [deferredFixedFeederComponentSearch, editingFixedFeeder, fixedFeederDialogOpen, loadFixedFeederCandidates]);

    // ── Dialog helpers ────────────────────────────────────────────────────────

    const resetFixedFeederDialog = React.useCallback(() => {
        setFixedFeederDialogOpen(false);
        setEditingFixedFeeder(null);
        setFixedFeederForm(createFixedFeederFormState());
        setFixedFeederDialogError('');
        setFixedFeederComponentSearch('');
        setFixedFeederCandidates([]);
    }, []);

    const openFixedFeederDialog = React.useCallback((row = null) => {
        setFixedFeederDialogError('');
        setEditingFixedFeeder(row);
        if (row) {
            const feederMatch = feeders.find((feeder) => feeder.size_mm === row.feeder_size_mm);
            setFixedFeederForm({
                component_id: `${row.component_id}`,
                fixed_cart_id: row.fixed_cart_id ? `${row.fixed_cart_id}` : '',
                feeder_id: feederMatch ? `${feederMatch.id}` : '',
            });
        } else {
            setFixedFeederForm(createFixedFeederFormState());
        }
        setFixedFeederComponentSearch('');
        setFixedFeederCandidates([]);
        setFixedFeederDialogOpen(true);
    }, [feeders]);

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleCalculateFixedFeeders = React.useCallback(async () => {
        setActionLoading('calculate-fixed-feeders');
        try {
            const response = await apiClient.post('/marketplace/fixed-feeders/calculate');
            const summary = response.data || null;
            setFixedFeederSummary(summary);
            await Promise.all([loadWorkspace(), loadFixedFeederRows()]);
            setFeedback({ type: 'success', message: buildFixedFeederFeedbackMessage(summary) });
        } catch (requestError) {
            setFixedFeederSummary(null);
            setFeedback({
                type: 'error',
                message: extractRequestError(requestError, 'Erreur lors du calcul des feeders fixes.'),
            });
        } finally {
            setActionLoading('');
        }
    }, [loadFixedFeederRows, loadWorkspace, setActionLoading, setFeedback]);

    const handleRefreshFixedFeederRows = React.useCallback(async () => {
        setActionLoading('refresh-fixed-feeders');
        try {
            const loaded = await loadFixedFeederRows();
            if (loaded) {
                setFeedback({ type: 'success', message: 'La liste des feeders fixes a ete reactualisee.' });
            }
        } finally {
            setActionLoading('');
        }
    }, [loadFixedFeederRows, setActionLoading, setFeedback]);

    const handleSaveFixedFeeder = React.useCallback(async () => {
        const componentId = editingFixedFeeder?.component_id || parsePositiveInteger(fixedFeederForm.component_id);
        const fixedCartId = parsePositiveInteger(fixedFeederForm.fixed_cart_id);
        const feederId = parsePositiveInteger(fixedFeederForm.feeder_id);

        if (componentId === null) { setFixedFeederDialogError('Selectionne un composant a fixer.'); return; }
        if (fixedCartId === null) { setFixedFeederDialogError('Selectionne un chariot fixe.'); return; }
        if (feederId === null) { setFixedFeederDialogError('Selectionne une taille de feeder.'); return; }

        setActionLoading(`save-fixed-feeder-${componentId}`);
        setFixedFeederDialogError('');
        try {
            await apiClient.patch(`/marketplace/fixed-feeders/components/${componentId}`, {
                is_fixed_feeder: true,
                fixed_cart_id: fixedCartId,
                feeder_id: feederId,
            });
            resetFixedFeederDialog();
            await Promise.all([loadWorkspace(), loadFixedFeederRows()]);
            setFeedback({ type: 'success', message: 'Feeder fixe enregistre avec succes.' });
        } catch (requestError) {
            setFixedFeederDialogError(extractRequestError(requestError, "Erreur lors de l'enregistrement du feeder fixe."));
        } finally {
            setActionLoading('');
        }
    }, [
        editingFixedFeeder?.component_id,
        fixedFeederForm.component_id,
        fixedFeederForm.fixed_cart_id,
        fixedFeederForm.feeder_id,
        loadFixedFeederRows,
        loadWorkspace,
        resetFixedFeederDialog,
        setActionLoading,
        setFeedback,
    ]);

    const handleRemoveFixedFeeder = React.useCallback(async (componentId) => {
        setActionLoading(`remove-fixed-feeder-${componentId}`);
        try {
            await apiClient.patch(`/marketplace/fixed-feeders/components/${componentId}`, {
                is_fixed_feeder: false,
                fixed_cart_id: null,
            });
            await Promise.all([loadWorkspace(), loadFixedFeederRows()]);
            setFeedback({ type: 'success', message: 'Feeder fixe retire avec succes.' });
        } catch (requestError) {
            setFeedback({
                type: 'error',
                message: extractRequestError(requestError, 'Erreur lors du retrait du feeder fixe.'),
            });
        } finally {
            setActionLoading('');
        }
    }, [loadFixedFeederRows, loadWorkspace, setActionLoading, setFeedback]);

    // ── Dérivations (filtres/tri + chips + options) — extraites sous 300 l. ─────
    const derived = useFixedFeederDerived({
        fixedFeederRows,
        fixedFeederSummary,
        carts,
        feeders,
        fixedFeederCandidates,
        fixedFeederForm,
        editingFixedFeeder,
    });

    return {
        // State
        fixedFeederRows,
        fixedFeederListLoading,
        fixedFeederSummary,
        setFixedFeederSummary,
        // Dialog state
        fixedFeederDialogOpen,
        editingFixedFeeder,
        fixedFeederForm,
        setFixedFeederForm,
        fixedFeederDialogError,
        fixedFeederComponentSearch,
        setFixedFeederComponentSearch,
        fixedFeederCandidates,
        fixedFeederCandidatesLoading,
        // Derived (filtres/tri + chips + options)
        ...derived,
        // Functions
        loadFixedFeederRows,
        openFixedFeederDialog,
        resetFixedFeederDialog,
        handleCalculateFixedFeeders,
        handleRefreshFixedFeederRows,
        handleSaveFixedFeeder,
        handleRemoveFixedFeeder,
    };
}
