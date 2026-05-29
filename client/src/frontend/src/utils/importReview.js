import apiClient from '../api/client';

function buildReviewPayload(activeResult) {
    return {
        // Filtre les items sans id pour éviter un payload invalide côté serveur
        items: (activeResult?.items || []).filter((item) => Boolean(item?.id)).map((item) => ({
            id: item.id,
            value_harmonized: item.value_harmonized || null,
            footprint_pnp: item.footprint_pnp || null,
            notes: item.notes || null,
            dnp: item.dnp || false,
        })),
        create_mappings: true,
        mark_as_active: false,
    };
}

function hasBomRevisionId(payload) {
    return Boolean(payload?.bomRevisionId || payload?.bom_revision_id);
}

export function hasPersistableImportSelection({ currentBom, importWorkspace }) {
    if (hasBomRevisionId(currentBom)) {
        return true;
    }

    if (importWorkspace?.result?.success && hasBomRevisionId(importWorkspace.result)) {
        return true;
    }

    return (Array.isArray(importWorkspace?.batchResults) ? importWorkspace.batchResults : [])
        .some((entry) => entry?.success && hasBomRevisionId(entry));
}

/**
 * @param {{ batchItem, persistCategory?, signal? }} params
 * signal : AbortSignal optionnel — permet d'annuler les requêtes en vol si l'utilisateur navigue
 */
export async function persistImportedBatchMetadata({
    batchItem,
    persistCategory = true,
    signal,
}) {
    if (!batchItem?.success || !batchItem?.bom_revision_id) {
        throw new Error('Impossible de sauvegarder les metadonnees d une BOM non importee.');
    }

    const reference = String(batchItem.reference || '').trim();
    const revision = String(batchItem.revision || '').trim();
    const category = String(batchItem.category || '').trim();
    if (!reference || !revision) {
        throw new Error('La reference et la revision doivent etre renseignees avant de continuer la revue.');
    }

    const renameResponse = await apiClient.patch(`/bom/files/${batchItem.bom_revision_id}`, {
        reference,
        revision,
    }, { signal });

    const resolvedBomReferenceId = renameResponse.data?.bom_reference_id || batchItem.bom_reference_id || batchItem.bomReferenceId;
    if (persistCategory && resolvedBomReferenceId) {
        await apiClient.patch(`/bom/references/${resolvedBomReferenceId}/category`, {
            category: category || null,
        }, { signal });
    }

    const sessionResponse = await apiClient.get(`/bom/files/${batchItem.bom_revision_id}/session`, { signal });
    return {
        ...sessionResponse.data,
        bom_reference_id: sessionResponse.data?.bom_reference_id || resolvedBomReferenceId || null,
        bom_revision_id: sessionResponse.data?.bom_revision_id || batchItem.bom_revision_id,
        file_name: batchItem.file_name || sessionResponse.data?.file_name || '',
        category,
    };
}

/**
 * @param {{ importWorkspace, currentBom, setImportedBom, signal? }} params
 * signal : AbortSignal optionnel — propagé jusqu'aux appels apiClient individuels
 */
export async function persistImportWorkspaceBeforeReview({
    importWorkspace,
    currentBom,
    setImportedBom,
    signal,
}) {
    const batchResults = Array.isArray(importWorkspace?.batchResults) ? importWorkspace.batchResults : [];
    const activeResult = importWorkspace?.result?.success ? importWorkspace.result : null;
    let activeRevisionMeta = null;

    // Items batch éligibles à la persistance
    const eligibleBatchItems = batchResults.filter(
        (item) => item?.success && item?.bom_revision_id,
    );

    if (eligibleBatchItems.length > 0) {
        // Persistance parallèle : tous les items batch en même temps
        const settledResults = await Promise.allSettled(
            eligibleBatchItems.map((batchItem) => persistImportedBatchMetadata({ batchItem, signal })),
        );

        // Log des erreurs partielles sans interrompre le flux
        settledResults.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.warn(
                    `[persistImportWorkspace] Échec persistance item ${eligibleBatchItems[index]?.bom_revision_id}:`,
                    result.reason,
                );
            }
        });

        // Extraire la meta de l'item actif depuis les résultats fulfilled
        if (activeResult) {
            const activeIndex = eligibleBatchItems.findIndex(
                (item) => item.bom_revision_id === activeResult.bom_revision_id,
            );
            if (activeIndex !== -1 && settledResults[activeIndex]?.status === 'fulfilled') {
                const persistedEntry = settledResults[activeIndex].value;
                const batchItem = eligibleBatchItems[activeIndex];
                activeRevisionMeta = {
                    bom_reference_id: persistedEntry.bom_reference_id || activeResult.bom_reference_id || activeResult.bomReferenceId,
                    bom_revision_id: persistedEntry.bom_revision_id || activeResult.bom_revision_id || activeResult.bomRevisionId,
                    reference: persistedEntry.reference || batchItem.reference || activeResult.reference || currentBom?.reference || '',
                    revision: persistedEntry.revision || batchItem.revision || activeResult.revision || currentBom?.revision || '',
                    side: persistedEntry.side || activeResult.side || currentBom?.side || 'TOP',
                    file_name: persistedEntry.file_name || batchItem.file_name || '',
                    category: persistedEntry.category || activeResult.category || currentBom?.category || '',
                };
            }
        }

        return {
            settledResults,
            activeRevisionMeta,
        };
    }

    return { settledResults: [], activeRevisionMeta };
}

export { buildReviewPayload, hasBomRevisionId };
