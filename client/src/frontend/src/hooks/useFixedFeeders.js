import React from 'react';
import apiClient from '../api/client';
import {
    buildFixedFeederFeedbackMessage,
    createFixedFeederFormState,
    extractRequestError,
    formatDecimal,
    getComponentPrimaryLabel,
    getComponentSecondaryLabel,
    parsePositiveInteger,
} from '../utils/machinePnp';

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

    // Filters / sort
    const [fixedFeederSearch, setFixedFeederSearch] = React.useState('');
    const [fixedFeederCartFilter, setFixedFeederCartFilter] = React.useState('all');
    const [fixedFeederSizeFilter, setFixedFeederSizeFilter] = React.useState('all');
    const [fixedFeederSortBy, setFixedFeederSortBy] = React.useState('bom_reference_count');
    const [fixedFeederSortDirection, setFixedFeederSortDirection] = React.useState('desc');

    // Dialog
    const [fixedFeederDialogOpen, setFixedFeederDialogOpen] = React.useState(false);
    const [editingFixedFeeder, setEditingFixedFeeder] = React.useState(null);
    const [fixedFeederForm, setFixedFeederForm] = React.useState(createFixedFeederFormState);
    const [fixedFeederDialogError, setFixedFeederDialogError] = React.useState('');
    const [fixedFeederComponentSearch, setFixedFeederComponentSearch] = React.useState('');
    const [fixedFeederCandidates, setFixedFeederCandidates] = React.useState([]);
    const [fixedFeederCandidatesLoading, setFixedFeederCandidatesLoading] = React.useState(false);

    const deferredFixedFeederSearch = React.useDeferredValue(fixedFeederSearch);
    const deferredFixedFeederComponentSearch = React.useDeferredValue(fixedFeederComponentSearch);

    // ── Loaders ───────────────────────────────────────────────────────────────

    const loadFixedFeederRows = React.useCallback(async () => {
        setFixedFeederListLoading(true);
        try {
            const response = await apiClient.get('/marketplace/fixed-feeders/components', {
                params: { only_fixed: true, limit: 500 },
            });
            setFixedFeederRows(response.data?.data || []);
            return true;
        } catch (requestError) {
            setFeedback({
                type: 'error',
                message: extractRequestError(requestError, 'Impossible de charger la liste des feeders fixes.'),
            });
            return false;
        } finally {
            setFixedFeederListLoading(false);
        }
    }, [setFeedback]);

    const loadFixedFeederCandidates = React.useCallback(async (searchValue) => {
        if (!fixedFeederDialogOpen) {
            return;
        }
        setFixedFeederCandidatesLoading(true);
        try {
            const response = await apiClient.get('/marketplace/fixed-feeders/components', {
                params: {
                    only_fixed: false,
                    limit: 60,
                    ...(String(searchValue || '').trim() ? { search: String(searchValue).trim() } : {}),
                },
            });
            setFixedFeederCandidates(response.data?.data || []);
        } catch (requestError) {
            setFixedFeederCandidates([]);
            setFixedFeederDialogError(extractRequestError(requestError, 'Impossible de charger les composants candidats.'));
        } finally {
            setFixedFeederCandidatesLoading(false);
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

    // ── Derived / computed ────────────────────────────────────────────────────

    const filteredFixedFeederRows = React.useMemo(() => {
        const normalizedSearch = deferredFixedFeederSearch.trim().toLowerCase();
        const rows = fixedFeederRows.filter((row) => {
            if (fixedFeederCartFilter !== 'all' && `${row.fixed_cart_id || ''}` !== fixedFeederCartFilter) return false;
            if (fixedFeederSizeFilter !== 'all' && `${row.feeder_size_mm || ''}` !== fixedFeederSizeFilter) return false;
            if (!normalizedSearch) return true;
            const haystack = [
                row.reference, row.component_label, row.footprint_pnp,
                row.feeder_type, row.fixed_cart_name, row.fixed_cart_kind,
            ].filter(Boolean).join(' ').toLowerCase();
            return haystack.includes(normalizedSearch);
        });
        const direction = fixedFeederSortDirection === 'asc' ? 1 : -1;
        rows.sort((left, right) => {
            const leftValue = left[fixedFeederSortBy];
            const rightValue = right[fixedFeederSortBy];
            if (typeof leftValue === 'number' || typeof rightValue === 'number') {
                return ((Number(leftValue) || 0) - (Number(rightValue) || 0)) * direction;
            }
            return String(leftValue || '').localeCompare(String(rightValue || ''), 'fr', { sensitivity: 'base' }) * direction;
        });
        return rows;
    }, [
        deferredFixedFeederSearch,
        fixedFeederCartFilter,
        fixedFeederRows,
        fixedFeederSizeFilter,
        fixedFeederSortBy,
        fixedFeederSortDirection,
    ]);

    const fixedFeederChips = React.useMemo(() => {
        if (!fixedFeederSummary) return [];
        const skippedCount = Number(fixedFeederSummary.skipped_no_cart_count || 0)
            + Number(fixedFeederSummary.skipped_capacity_count || 0)
            + Number(fixedFeederSummary.skipped_no_category_count || 0);
        return [
            { label: `${fixedFeederSummary.assigned_count || 0} fixe(s) calcules`, color: '#22c55e' },
            { label: `${fixedFeederSummary.changed_count || 0} changement(s)`, color: '#38bdf8' },
            { label: `${skippedCount} ignore(s)`, color: '#f59e0b' },
            { label: `${fixedFeederSummary.unmatched_bom_items || 0} BOM non mappes`, color: '#f97316' },
        ];
    }, [fixedFeederSummary]);

    const fixedFeederOverviewChips = React.useMemo(() => {
        if (!fixedFeederRows.length) return [];
        const manualCount = fixedFeederRows.filter((row) => row.fixed_cart_kind === 'CUSTOM').length;
        const autoCount = fixedFeederRows.length - manualCount;
        const averageBomOverlap = fixedFeederRows.reduce(
            (sum, row) => sum + Number(row.bom_reference_count || 0), 0,
        ) / fixedFeederRows.length;
        return [
            { label: `${fixedFeederRows.length} feeder(s) fixe(s)`, color: '#22c55e' },
            { label: `${manualCount} manuel(s)`, color: '#f59e0b' },
            { label: `${autoCount} auto`, color: '#38bdf8' },
            { label: `${formatDecimal(averageBomOverlap)} BOM en moyenne`, color: '#fb7185' },
        ];
    }, [fixedFeederRows]);

    const selectedFixedFeederCandidate = React.useMemo(() => {
        const componentId = parsePositiveInteger(fixedFeederForm.component_id);
        if (componentId === null) return editingFixedFeeder;
        return (
            fixedFeederCandidates.find((item) => item.component_id === componentId)
            || fixedFeederRows.find((item) => item.component_id === componentId)
            || editingFixedFeeder
        );
    }, [editingFixedFeeder, fixedFeederCandidates, fixedFeederForm.component_id, fixedFeederRows]);

    // Menu items derived from carts / feeders — exposed so page can render them
    const fixedFeederCandidateOptions = React.useMemo(() => (
        fixedFeederCandidates.map((candidate) => ({
            key: candidate.component_id,
            value: `${candidate.component_id}`,
            label: [
                getComponentPrimaryLabel(candidate),
                getComponentSecondaryLabel(candidate) || null,
                candidate.footprint_pnp || '--',
                `${candidate.bom_reference_count || 0} BOM`,
            ].filter(Boolean).join(' · '),
        }))
    ), [fixedFeederCandidates]);

    const cartOptions = React.useMemo(() => (
        carts.map((cart) => ({
            key: cart.id,
            value: `${cart.id}`,
            label: `${cart.name} · ${cart.kind}${cart.remaining_positions !== undefined ? ` · ${cart.remaining_positions} restant(s)` : ''}`,
        }))
    ), [carts]);

    const feederOptions = React.useMemo(() => (
        feeders.map((feeder) => ({
            key: feeder.id,
            value: `${feeder.id}`,
            label: `${feeder.size_mm} mm${feeder.description ? ` · ${feeder.description}` : ''}`,
        }))
    ), [feeders]);

    return {
        // State
        fixedFeederRows,
        fixedFeederListLoading,
        fixedFeederSummary,
        setFixedFeederSummary,
        fixedFeederSearch,
        setFixedFeederSearch,
        fixedFeederCartFilter,
        setFixedFeederCartFilter,
        fixedFeederSizeFilter,
        setFixedFeederSizeFilter,
        fixedFeederSortBy,
        setFixedFeederSortBy,
        fixedFeederSortDirection,
        setFixedFeederSortDirection,
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
        // Derived
        filteredFixedFeederRows,
        fixedFeederChips,
        fixedFeederOverviewChips,
        selectedFixedFeederCandidate,
        fixedFeederCandidateOptions,
        cartOptions,
        feederOptions,
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
