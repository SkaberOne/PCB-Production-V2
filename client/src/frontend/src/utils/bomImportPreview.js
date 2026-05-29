export const PREVIEW_STATUS_META = {
    'missing-component': {
        label: 'Base a completer',
        color: 'warning',
    },
    'missing-footprint': {
        label: 'Footprint a mapper',
        color: 'warning',
    },
    ready: {
        label: 'Pret',
        color: 'success',
    },
    kept: {
        label: 'Conserve',
        color: 'default',
    },
};

export function buildPreviewTarget(item, result = null) {
    return {
        itemId: item.id,
        bomReferenceId: item._bomReferenceId || result?.bom_reference_id,
        bomRevisionId: item._bomRevisionId || result?.bom_revision_id,
        reference: item.reference || item.reference_item || '?',
    };
}

export function applyPreviewFieldToWorkspace(currentWorkspace, targets, field, value) {
    const normalizedTargets = (targets || []).filter((target) => target?.itemId && target?.bomRevisionId);
    if (!normalizedTargets.length) {
        return currentWorkspace;
    }

    const targetKeys = new Set(
        normalizedTargets.map((target) => `${target.bomRevisionId}:${target.itemId}`)
    );

    const nextBatchResults = currentWorkspace.batchResults.map((entry) => {
        if (!entry?.bom_revision_id || !Array.isArray(entry.items)) {
            return entry;
        }

        let hasRevisionChange = false;
        const nextItems = entry.items.map((item) => {
            if (!targetKeys.has(`${entry.bom_revision_id}:${item.id}`)) {
                return item;
            }

            hasRevisionChange = true;
            return { ...item, [field]: value };
        });

        return hasRevisionChange
            ? { ...entry, items: nextItems }
            : entry;
    });

    let nextResult = currentWorkspace.result;
    if (currentWorkspace.result?.bom_revision_id && Array.isArray(currentWorkspace.result.items)) {
        let hasResultChange = false;
        const nextItems = currentWorkspace.result.items.map((item) => {
            if (!targetKeys.has(`${currentWorkspace.result.bom_revision_id}:${item.id}`)) {
                return item;
            }

            hasResultChange = true;
            return { ...item, [field]: value };
        });

        if (hasResultChange) {
            nextResult = {
                ...currentWorkspace.result,
                items: nextItems,
            };
        }
    }

    return {
        ...currentWorkspace,
        result: nextResult,
        batchResults: nextBatchResults,
    };
}

export function getPreviewFootprintDraftValue(previewFootprintDrafts, draftKey, fallbackValue = '') {
    return Object.prototype.hasOwnProperty.call(previewFootprintDrafts, draftKey)
        ? previewFootprintDrafts[draftKey]
        : fallbackValue;
}

export function setPreviewFootprintDraft(currentDrafts, draftKey, value) {
    return {
        ...currentDrafts,
        [draftKey]: value,
    };
}

export function clearPreviewFootprintDraft(currentDrafts, draftKey) {
    if (!Object.prototype.hasOwnProperty.call(currentDrafts, draftKey)) {
        return currentDrafts;
    }

    const nextDrafts = { ...currentDrafts };
    delete nextDrafts[draftKey];
    return nextDrafts;
}

export function getPreviewStatusKey(item) {
    if (item.component_library_missing) {
        return 'missing-component';
    }

    if ((item.footprint_eagle || item.footprintEagle) && !(item.footprint_pnp || item.footprintPnp)) {
        return 'missing-footprint';
    }

    const wasHarmonized = (item.value_harmonized || item.value_harmonized === '')
        ? item.value_harmonized && item.value_harmonized !== item.value_raw
        : item.value_harmonized !== undefined && item.value_harmonized !== item.value_raw;
    if (wasHarmonized || item.footprint_pnp || item.footprintPnp) {
        return 'ready';
    }

    return 'kept';
}

export function getPreviewStatusMeta(item) {
    const key = getPreviewStatusKey(item);
    return {
        key,
        ...PREVIEW_STATUS_META[key],
    };
}

function buildPreviewSearchValues(entry) {
    return [
        entry.reference,
        entry.reference_item,
        entry.value_raw,
        entry.value_harmonized,
        entry.componentValue,
        entry.footprint_eagle,
        entry.footprint_pnp,
        entry.footprintEagle,
        entry.footprintPnp,
        entry.component_type,
        entry.type,
        entry._bomLabel,
        ...(entry.references || []),
        ...(entry.bomLabels || []),
    ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
}

export function matchesPreviewFilters(entry, { normalizedSearch = '', statusFilter = 'all' } = {}) {
    const statusMeta = getPreviewStatusMeta(entry);
    if (statusFilter !== 'all' && statusMeta.key !== statusFilter) {
        return false;
    }

    if (!normalizedSearch) {
        return true;
    }

    return buildPreviewSearchValues(entry).some((value) => value.includes(normalizedSearch));
}
