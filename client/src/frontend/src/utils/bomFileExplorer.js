export const DEFAULT_UNCATEGORIZED_CATEGORY = 'Sans catégorie';

export function formatStoredBomDate(value) {
    if (!value) {
        return 'Date inconnue';
    }

    try {
        return new Date(value).toLocaleString('fr-FR');
    } catch {
        return value;
    }
}

function normalizeStoredBomSelection(entries = []) {
    const seenRevisionIds = new Set();

    return (Array.isArray(entries) ? entries : []).filter((entry) => {
        const revisionId = Number(entry?.bom_revision_id || 0);
        if (!revisionId || seenRevisionIds.has(revisionId)) {
            return false;
        }

        seenRevisionIds.add(revisionId);
        return true;
    });
}

export function syncStoredBomSelection(selectedEntries = [], visibleItems = []) {
    const visibleEntriesById = new Map(
        (Array.isArray(visibleItems) ? visibleItems : [])
            .filter((item) => Number(item?.bom_revision_id || 0) > 0)
            .map((item) => [Number(item.bom_revision_id), item]),
    );

    return normalizeStoredBomSelection(selectedEntries).map((entry) => (
        visibleEntriesById.get(Number(entry.bom_revision_id)) || entry
    ));
}

export function toggleStoredBomSelection(selectedEntries = [], item = null) {
    const revisionId = Number(item?.bom_revision_id || 0);
    const currentSelection = syncStoredBomSelection(selectedEntries, []);
    if (!revisionId) {
        return currentSelection;
    }

    return currentSelection.some((entry) => Number(entry.bom_revision_id) === revisionId)
        ? currentSelection.filter((entry) => Number(entry.bom_revision_id) !== revisionId)
        : [...currentSelection, item];
}

export function groupStoredBomFiles(items = [], knownCategories = []) {
    const categories = new Map();

    items.forEach((item) => {
        const categoryKey = item.category || DEFAULT_UNCATEGORIZED_CATEGORY;
        const referenceKey = item.reference || 'REFERENCE_INCONNUE';
        const revisionKey = item.revision || 'REVISION_INCONNUE';

        if (!categories.has(categoryKey)) {
            categories.set(categoryKey, {
                category: categoryKey,
                references: new Map(),
            });
        }

        const categoryEntry = categories.get(categoryKey);
        if (!categoryEntry.references.has(referenceKey)) {
            categoryEntry.references.set(referenceKey, {
                bomReferenceId: item.bom_reference_id,
                reference: referenceKey,
                name: item.name || '',
                revisions: new Map(),
            });
        }

        const referenceEntry = categoryEntry.references.get(referenceKey);
        if (!referenceEntry.revisions.has(revisionKey)) {
            referenceEntry.revisions.set(revisionKey, {
                revision: revisionKey,
                items: [],
            });
        }

        referenceEntry.revisions.get(revisionKey).items.push(item);
    });

    knownCategories.forEach((categoryName) => {
        const normalizedName = String(categoryName || '').trim();
        if (!normalizedName || categories.has(normalizedName)) {
            return;
        }

        categories.set(normalizedName, {
            category: normalizedName,
            references: new Map(),
        });
    });

    return Array.from(categories.values()).map((categoryEntry) => ({
        category: categoryEntry.category,
        references: Array.from(categoryEntry.references.values()).map((referenceEntry) => ({
            bomReferenceId: referenceEntry.bomReferenceId,
            reference: referenceEntry.reference,
            name: referenceEntry.name || '',
            revisions: Array.from(referenceEntry.revisions.values()).map((revisionEntry) => ({
                revision: revisionEntry.revision,
                items: revisionEntry.items.sort((left, right) => (left.side || '').localeCompare(right.side || '')),
            })),
        })).sort((left, right) => left.reference.localeCompare(right.reference)),
    })).sort((left, right) => left.category.localeCompare(right.category));
}