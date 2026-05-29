export function buildReferenceRevisionKey(reference, revision) {
    return `${String(reference || '').trim().toUpperCase()}__${String(revision || '').trim().toUpperCase()}`;
}

export function normalizeBomWorkspaceEntry(payload = {}) {
    return {
        bom_reference_id: payload.bom_reference_id || payload.bomReferenceId || null,
        bom_revision_id: payload.bom_revision_id || payload.bomRevisionId || null,
        reference: payload.reference || '',
        revision: payload.revision || '',
        side: payload.side || 'TOP',
        status: payload.status || payload.revision_status || 'DRAFT',
        file_name: payload.file_name || payload.fileName || '',
        quantity_to_produce: Number(payload.quantity_to_produce ?? payload.quantityToProduce ?? 1) || 1,
    };
}

export function normalizeBomWorkspaceRevision(payload = {}) {
    const items = Array.isArray(payload.items) ? payload.items : [];

    return {
        reference: payload.reference || '',
        revision: payload.revision || '',
        side: payload.side || 'TOP',
        status: payload.status || payload.revision_status || 'DRAFT',
        bomReferenceId: payload.bom_reference_id || payload.bomReferenceId || null,
        bomRevisionId: payload.bom_revision_id || payload.bomRevisionId || null,
        fileName: payload.file_name || payload.fileName || '',
        message: payload.message || '',
        itemCount: payload.item_count ?? items.length,
        items,
        stats: payload.stats || {},
        warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
        errors: Array.isArray(payload.errors) ? payload.errors : [],
        updatedAt: new Date().toISOString(),
        dirty: Boolean(payload.dirty),
        loaded: payload.loaded !== false,
    };
}

export function createDefaultBomWorkspace() {
    return {
        activeProductionId: null,
        selectedRevisionEntries: [],
        activeRevisionId: null,
        revisionsById: {},
        quantitiesByReference: {},
        stockDraftByComponentKey: {},
        stockValidation: {
            isValidated: false,
            validatedAt: null,
        },
        activeTab: 'review',
    };
}

export function buildSelectionSignature(entries = []) {
    return (Array.isArray(entries) ? entries : [])
        .map((entry) => Number(entry?.bom_revision_id || 0))
        .filter((revisionId) => revisionId > 0)
        .sort((left, right) => left - right)
        .join('__');
}

export function ensureQuantityEntries(entries = [], existingQuantities = {}) {
    const nextQuantities = { ...existingQuantities };

    entries.forEach((entry) => {
        const key = buildReferenceRevisionKey(entry.reference, entry.revision);
        if (!key || nextQuantities[key]) {
            return;
        }

        const parsedQuantity = Number(entry.quantity_to_produce ?? entry.quantityToProduce ?? 1);
        nextQuantities[key] = {
            key,
            reference: entry.reference || '',
            revision: entry.revision || '',
            quantityToProduce: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1,
        };
    });

    return nextQuantities;
}

export function serializeBomWorkspace(workspace = {}) {
    const revisionsById = Object.fromEntries(
        Object.entries(workspace.revisionsById || {})
            .map(([revisionId, revision]) => [revisionId, normalizeBomWorkspaceRevision(revision)])
            .filter(([, revision]) => revision.bomRevisionId),
    );

    return {
        activeProductionId: workspace.activeProductionId || null,
        selectedRevisionEntries: Array.isArray(workspace.selectedRevisionEntries)
            ? workspace.selectedRevisionEntries
            : [],
        activeRevisionId: workspace.activeRevisionId || null,
        revisionsById,
        quantitiesByReference: workspace.quantitiesByReference || {},
        stockDraftByComponentKey: workspace.stockDraftByComponentKey || {},
        stockValidation: {
            isValidated: Boolean(workspace.stockValidation?.isValidated),
            validatedAt: workspace.stockValidation?.validatedAt || null,
        },
        activeTab: workspace.activeTab || 'review',
    };
}

export function hydrateBomWorkspace(payload = {}) {
    return {
        ...createDefaultBomWorkspace(),
        activeProductionId: payload.activeProductionId || null,
        selectedRevisionEntries: Array.isArray(payload.selectedRevisionEntries)
            ? payload.selectedRevisionEntries.map((entry) => normalizeBomWorkspaceEntry(entry)).filter((entry) => entry.bom_revision_id)
            : [],
        activeRevisionId: payload.activeRevisionId || null,
        revisionsById: Object.fromEntries(
            Object.entries(payload.revisionsById || {})
                .map(([revisionId, revision]) => [revisionId, normalizeBomWorkspaceRevision(revision)])
                .filter(([, revision]) => revision.bomRevisionId),
        ),
        quantitiesByReference: payload.quantitiesByReference || {},
        stockDraftByComponentKey: payload.stockDraftByComponentKey || {},
        stockValidation: {
            isValidated: Boolean(payload.stockValidation?.isValidated),
            validatedAt: payload.stockValidation?.validatedAt || null,
        },
        activeTab: payload.activeTab || 'review',
    };
}
