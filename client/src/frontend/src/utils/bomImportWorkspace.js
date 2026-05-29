export const DEFAULT_IMPORT_FORM = {
    reference: '',
    revision: 'REV_A',
    side: 'TOP',
    category: '',
};

export function createDefaultImportWorkspace() {
    return {
        files: [],
        draftBatch: [],
        result: null,
        batchResults: [],
        error: null,
        form: { ...DEFAULT_IMPORT_FORM },
        autoDetectedImport: { reference: '', side: '' },
        componentResolutionPaused: false,
        footprintResolutionPaused: false,
        batchComponentResolutionPaused: false,
        batchFootprintResolutionPaused: false,
        pendingFootprintPrompt: false,
    };
}

export function extractImportMetadataFromFilename(filename) {
    if (!filename) {
        return { reference: '', side: '' };
    }

    const basename = filename.replace(/\.[^/.]+$/, '').trim();
    const segments = basename.split('_').filter(Boolean);
    const sideCandidate = segments.length > 1 ? String(segments[segments.length - 1]).toUpperCase() : '';

    if (sideCandidate === 'TOP' || sideCandidate === 'BOT') {
        return {
            reference: segments.slice(0, -1).join('_').trim(),
            side: sideCandidate,
        };
    }

    return {
        reference: basename,
        side: '',
    };
}

export function buildBatchDraftFromFiles(selectedFiles, defaultRevision) {
    return Array.from(selectedFiles || []).filter(Boolean).map((selectedFile, index) => {
        const inferredImport = extractImportMetadataFromFilename(selectedFile.name);
        const rowKey = `${selectedFile.name}-${selectedFile.size}-${selectedFile.lastModified || 0}-${index}`;

        return {
            row_key: rowKey,
            file: selectedFile,
            file_name: selectedFile.name,
            reference: inferredImport.reference,
            revision: defaultRevision || DEFAULT_IMPORT_FORM.revision,
            side: inferredImport.side || DEFAULT_IMPORT_FORM.side,
            category: DEFAULT_IMPORT_FORM.category,
        };
    });
}

export function decorateBatchResult(entry, metadata = {}) {
    return {
        ...entry,
        file_name: metadata.file_name || entry.file_name || '',
        reference: entry.reference || metadata.reference || '',
        revision: entry.revision || metadata.revision || '',
        side: entry.side || metadata.side || DEFAULT_IMPORT_FORM.side,
        category: entry.category || metadata.category || '',
        item_count: entry.item_count ?? entry.items?.length ?? 0,
        items: Array.isArray(entry.items) ? entry.items : [],
        warnings: Array.isArray(entry.warnings) ? entry.warnings : [],
        errors: Array.isArray(entry.errors) ? entry.errors : [],
        stats: entry.stats || {},
    };
}

export function buildMissingComponentGroups(items = []) {
    const groups = new Map();

    items
        .filter((item) => item.component_library_missing && !item.dnp)
        .forEach((item) => {
            const componentValue = item.value_harmonized || item.value_raw || 'Valeur non renseignée';
            const componentFootprint = item.footprint_pnp || item.footprint_eagle || 'Empreinte non renseignée';
            const componentType = item.component_type || item.type || 'Autre';
            const key = `${componentValue}__${componentFootprint}__${componentType}`;

            if (groups.has(key)) {
                const existing = groups.get(key);
                existing.itemIds.push(item.id);
                existing.references.push(item.reference || item.reference_item || '?');
                return;
            }

            groups.set(key, {
                key,
                itemIds: [item.id],
                references: [item.reference || item.reference_item || '?'],
                componentValue,
                footprintEagle: item.footprint_eagle || '',
                footprintPnp: item.footprint_pnp || '',
                componentType,
                proposedComponentName: item.proposed_component_name || componentValue,
            });
        });

    return Array.from(groups.values()).sort((left, right) => {
        if (right.itemIds.length !== left.itemIds.length) {
            return right.itemIds.length - left.itemIds.length;
        }

        return left.componentValue.localeCompare(right.componentValue);
    });
}

export function buildMissingFootprintGroups(items = []) {
    const groups = new Map();

    items
        .filter((item) => item.footprint_eagle && !item.footprint_pnp && !item.dnp)
        .forEach((item) => {
            const eagleFootprint = String(item.footprint_eagle || '').trim();
            if (!eagleFootprint) {
                return;
            }

            const key = eagleFootprint.toUpperCase();
            if (groups.has(key)) {
                const existing = groups.get(key);
                existing.itemIds.push(item.id);
                existing.references.push(item.reference || item.reference_item || '?');
                return;
            }

            groups.set(key, {
                key,
                itemIds: [item.id],
                references: [item.reference || item.reference_item || '?'],
                footprintEagle: eagleFootprint,
            });
        });

    return Array.from(groups.values()).sort((left, right) => {
        if (right.itemIds.length !== left.itemIds.length) {
            return right.itemIds.length - left.itemIds.length;
        }

        return left.footprintEagle.localeCompare(right.footprintEagle);
    });
}

function flattenUnique(values = []) {
    return Array.from(new Set(values.filter(Boolean)));
}

export function buildBatchMissingComponentGroups(batchResults = []) {
    const groups = new Map();

    (batchResults || [])
        .filter((entry) => entry?.success && Array.isArray(entry.items))
        .forEach((entry) => {
            const revisionGroups = buildMissingComponentGroups(entry.items);
            revisionGroups.forEach((group) => {
                const existing = groups.get(group.key);
                const revisionEntry = {
                    bomReferenceId: entry.bom_reference_id,
                    bomRevisionId: entry.bom_revision_id,
                    reference: entry.reference,
                    revision: entry.revision,
                    side: entry.side,
                    fileName: entry.file_name,
                    itemIds: group.itemIds,
                    references: group.references,
                };

                if (existing) {
                    existing.totalItemCount += group.itemIds.length;
                    existing.revisionGroups.push(revisionEntry);
                    existing.references = flattenUnique([...existing.references, ...group.references]);
                    existing.bomLabels = flattenUnique([
                        ...existing.bomLabels,
                        `${entry.reference || '?'} ${entry.revision || '?'} ${entry.side || '?'}`.trim(),
                    ]);
                    return;
                }

                groups.set(group.key, {
                    ...group,
                    totalItemCount: group.itemIds.length,
                    revisionGroups: [revisionEntry],
                    references: [...group.references],
                    bomLabels: [`${entry.reference || '?'} ${entry.revision || '?'} ${entry.side || '?'}`.trim()],
                });
            });
        });

    return Array.from(groups.values()).sort((left, right) => {
        if (right.totalItemCount !== left.totalItemCount) {
            return right.totalItemCount - left.totalItemCount;
        }

        return left.componentValue.localeCompare(right.componentValue);
    });
}

export function buildBatchMissingFootprintGroups(batchResults = []) {
    const groups = new Map();

    (batchResults || [])
        .filter((entry) => entry?.success && Array.isArray(entry.items))
        .forEach((entry) => {
            const revisionGroups = buildMissingFootprintGroups(entry.items);
            revisionGroups.forEach((group) => {
                const existing = groups.get(group.key);
                const revisionEntry = {
                    bomReferenceId: entry.bom_reference_id,
                    bomRevisionId: entry.bom_revision_id,
                    reference: entry.reference,
                    revision: entry.revision,
                    side: entry.side,
                    fileName: entry.file_name,
                    itemIds: group.itemIds,
                    references: group.references,
                };

                if (existing) {
                    existing.totalItemCount += group.itemIds.length;
                    existing.revisionGroups.push(revisionEntry);
                    existing.references = flattenUnique([...existing.references, ...group.references]);
                    existing.bomLabels = flattenUnique([
                        ...existing.bomLabels,
                        `${entry.reference || '?'} ${entry.revision || '?'} ${entry.side || '?'}`.trim(),
                    ]);
                    return;
                }

                groups.set(group.key, {
                    ...group,
                    totalItemCount: group.itemIds.length,
                    revisionGroups: [revisionEntry],
                    references: [...group.references],
                    bomLabels: [`${entry.reference || '?'} ${entry.revision || '?'} ${entry.side || '?'}`.trim()],
                });
            });
        });

    return Array.from(groups.values()).sort((left, right) => {
        if (right.totalItemCount !== left.totalItemCount) {
            return right.totalItemCount - left.totalItemCount;
        }

        return left.footprintEagle.localeCompare(right.footprintEagle);
    });
}

export function buildSessionRows(draftBatch = [], batchResults = []) {
    const normalizedDraftBatch = Array.isArray(draftBatch) ? draftBatch : [];
    const normalizedBatchResults = Array.isArray(batchResults) ? batchResults : [];

    if (!normalizedDraftBatch.length) {
        return normalizedBatchResults.map((entry, index) => ({
            ...decorateBatchResult(entry, entry),
            row_key: entry.bom_revision_id || `${entry.file_name}-${index}`,
            isImported: true,
        }));
    }

    const sessionRows = normalizedDraftBatch.map((draftRow, index) => {
        const matchedResult = normalizedBatchResults.find((entry) => entry.file_name === draftRow.file_name);
        if (matchedResult) {
            return {
                ...matchedResult,
                row_key: matchedResult.bom_revision_id || `${matchedResult.file_name}-${index}`,
                isImported: true,
            };
        }

        return {
            ...draftRow,
            row_key: draftRow.row_key,
            success: false,
            isImported: false,
            item_count: 0,
            items: [],
            warnings: [],
            errors: [],
            stats: {},
            message: 'En attente d import',
            category: draftRow.category || '',
        };
    });

    const existingImportedKeys = new Set(
        sessionRows
            .filter((entry) => entry.isImported)
            .map((entry) => String(entry.bom_revision_id || entry.file_name || '')),
    );

    const storedRows = normalizedBatchResults
        .filter((entry) => !existingImportedKeys.has(String(entry.bom_revision_id || entry.file_name || '')))
        .map((entry, index) => ({
            ...decorateBatchResult(entry, entry),
            row_key: entry.bom_revision_id || `${entry.file_name}-${index}`,
            isImported: true,
        }));

    return [...sessionRows, ...storedRows];
}

export function buildImportPreviewItems({
    result = null,
    batchResults = [],
    scope = 'selected',
}) {
    const successfulBatchResults = (batchResults || []).filter((entry) => entry?.success && Array.isArray(entry.items));
    const sourceEntries = scope === 'batch'
        ? successfulBatchResults
        : (result?.success ? [result] : []);

    return sourceEntries.flatMap((entry) => (
        (entry.items || []).map((item) => ({
            ...item,
            _bomReferenceId: entry.bom_reference_id,
            _bomRevisionId: entry.bom_revision_id,
            _bomReference: entry.reference,
            _bomRevision: entry.revision,
            _bomSide: entry.side,
            _bomLabel: `${entry.reference || '?'} ${entry.revision || '?'} ${entry.side || '?'}`.trim(),
            _previewKey: `${entry.bom_revision_id || 'draft'}:${item.id}`,
        }))
    ));
}

export function buildCompactImportPreviewGroups(items = []) {
    const groups = new Map();

    (items || []).forEach((item) => {
        const componentValue = item.value_harmonized || item.value_raw || 'Valeur non renseignée';
        const footprintEagle = item.footprint_eagle || '';
        const componentType = item.component_type || item.type || 'Autre';
        const key = [
            componentValue,
            footprintEagle,
            componentType,
        ].join('__').toUpperCase();

        const targetDescriptor = {
            itemId: item.id,
            bomReferenceId: item._bomReferenceId,
            bomRevisionId: item._bomRevisionId,
            reference: item.reference || item.reference_item || '?',
        };

        if (groups.has(key)) {
            const existing = groups.get(key);
            existing.count += 1;
            existing.targets.push(targetDescriptor);
            existing.references.push(targetDescriptor.reference);
            existing.bomLabels.push(item._bomLabel);
            existing.component_library_missing = existing.component_library_missing || item.component_library_missing;
            existing.hasMissingFootprint = existing.hasMissingFootprint || Boolean(item.footprint_eagle && !item.footprint_pnp);
            if (!existing.footprint_pnp && item.footprint_pnp) {
                existing.footprint_pnp = item.footprint_pnp;
            }
            return;
        }

        groups.set(key, {
            key,
            componentValue,
            value_raw: item.value_raw || '',
            value_harmonized: item.value_harmonized || '',
            footprint_eagle: footprintEagle,
            footprint_pnp: item.footprint_pnp || '',
            component_type: componentType,
            count: 1,
            targets: [targetDescriptor],
            references: [targetDescriptor.reference],
            bomLabels: [item._bomLabel],
            component_library_missing: Boolean(item.component_library_missing),
            hasMissingFootprint: Boolean(item.footprint_eagle && !item.footprint_pnp),
        });
    });

    return Array.from(groups.values())
        .map((group) => ({
            ...group,
            references: flattenUnique(group.references),
            bomLabels: flattenUnique(group.bomLabels),
        }))
        .sort((left, right) => {
            if (right.count !== left.count) {
                return right.count - left.count;
            }

            return left.componentValue.localeCompare(right.componentValue);
        });
}
