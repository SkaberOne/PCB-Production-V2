import React from 'react';
import {
    formatDecimal,
    getComponentPrimaryLabel,
    getComponentSecondaryLabel,
} from '../utils/machinePnp';

/**
 * État de recherche/filtre/tri + dérivations (lignes filtrées, chips, options) pour
 * les feeders fixes. Extrait de useFixedFeeders pour le garder sous 300 lignes.
 * Ne porte aucun effet réseau : pure logique de présentation.
 */
export function useFixedFeederDerived({
    fixedFeederRows,
    fixedFeederSummary,
    carts,
    feeders,
    fixedFeederCandidates,
    fixedFeederForm,
    editingFixedFeeder,
}) {
    const [fixedFeederSearch, setFixedFeederSearch] = React.useState('');
    const [fixedFeederCartFilter, setFixedFeederCartFilter] = React.useState('all');
    const [fixedFeederSizeFilter, setFixedFeederSizeFilter] = React.useState('all');
    const [fixedFeederSortBy, setFixedFeederSortBy] = React.useState('bom_reference_count');
    const [fixedFeederSortDirection, setFixedFeederSortDirection] = React.useState('desc');

    const deferredFixedFeederSearch = React.useDeferredValue(fixedFeederSearch);

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
        const componentId = Number(fixedFeederForm.component_id);
        if (!Number.isInteger(componentId) || componentId <= 0) return editingFixedFeeder;
        return (
            fixedFeederCandidates.find((item) => item.component_id === componentId)
            || fixedFeederRows.find((item) => item.component_id === componentId)
            || editingFixedFeeder
        );
    }, [editingFixedFeeder, fixedFeederCandidates, fixedFeederForm.component_id, fixedFeederRows]);

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
        filteredFixedFeederRows,
        fixedFeederChips,
        fixedFeederOverviewChips,
        selectedFixedFeederCandidate,
        fixedFeederCandidateOptions,
        cartOptions,
        feederOptions,
    };
}
