import apiClient from '../api/client';
import { createDefaultImportWorkspace, decorateBatchResult } from './bomImportWorkspace';

function buildImportWorkspaceFromSelection(selection = [], loadedSessions = []) {
    const loadedByRevisionId = new Map(
        loadedSessions
            .filter((session) => session?.bom_revision_id)
            .map((session) => [session.bom_revision_id, session]),
    );

    const batchResults = selection.map((entry) => {
        const loadedSession = loadedByRevisionId.get(entry.bom_revision_id);
        if (loadedSession) {
            return decorateBatchResult(
                {
                    ...loadedSession,
                    success: true,
                },
                entry,
            );
        }

        return decorateBatchResult(
            {
                ...entry,
                success: true,
                item_count: 0,
                items: [],
                warnings: [],
                errors: [],
                stats: {},
            },
            entry,
        );
    });

    const loadedResult = loadedSessions.length
        ? batchResults.find((entry) => entry?.bom_revision_id === loadedSessions[0].bom_revision_id)
        : null;

    return {
        ...createDefaultImportWorkspace(),
        batchResults,
        result: loadedResult || batchResults[0] || null,
        error: null,
    };
}

export async function hydrateStoredBomSelection({
    selection = [],
    setSelectedBomEntries,
    setImportedBom,
    updateImportWorkspace,
    clearCurrentBom,
    preserveExistingWorkspace = false,
    // mergeWithExisting : fusionne les nouvelles révisions dans le workspace existant
    // (différent de preserveExistingWorkspace qui remplace si la sélection change)
    mergeWithExisting = false,
    throwOnEmptyLoad = false,
    signal,
}) {
    const normalizedSelection = Array.isArray(selection)
        ? selection.filter((entry) => entry?.bom_revision_id)
        : [];

    if (!normalizedSelection.length) {
        if (clearCurrentBom) {
            clearCurrentBom();
        }
        if (setSelectedBomEntries) {
            setSelectedBomEntries([]);
        }
        if (updateImportWorkspace) {
            updateImportWorkspace(createDefaultImportWorkspace());
        }
        return {
            selection: [],
            loadedSessions: [],
            loadedRevisionId: null,
        };
    }

    if (setSelectedBomEntries) {
        setSelectedBomEntries(normalizedSelection);
    }

    const selectionResults = await Promise.allSettled(
        normalizedSelection.map(async (bomEntry) => {
            const sessionResponse = await apiClient.get(
                `/bom/files/${bomEntry.bom_revision_id}/session`,
                { signal },
            );
            return {
                bomEntry,
                payload: {
                    ...sessionResponse.data,
                    file_name: bomEntry.file_name || sessionResponse.data?.file_name || '',
                },
            };
        }),
    );

    const loadedSessions = selectionResults
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value.payload)
        .filter(Boolean);

    const loadedRevisionId = selectionResults
        .find((result) => result.status === 'fulfilled')
        ?.value?.bomEntry?.bom_revision_id || null;

    // Log des erreurs partielles (404, etc.)
    selectionResults.forEach((result, index) => {
        if (result.status === 'rejected') {
            const revisionId = normalizedSelection[index]?.bom_revision_id;
            if (result.reason?.response?.status === 404) {
                console.warn(`[hydrateStoredBomSelection] BOM révision ${revisionId} introuvable (404)`);
            } else {
                console.warn(`[hydrateStoredBomSelection] Erreur chargement révision ${revisionId}:`, result.reason);
            }
        }
    });

    if (throwOnEmptyLoad && !loadedSessions.length) {
        throw new Error('Impossible de recharger les sessions BOM sélectionnées.');
    }

    if (loadedSessions[0] && setImportedBom) {
        setImportedBom(loadedSessions[0]);
    } else if (!loadedRevisionId && clearCurrentBom) {
        clearCurrentBom();
    }

    if (updateImportWorkspace) {
        updateImportWorkspace((current) => {
            // Mode fusion : ajoute les nouvelles révisions aux existantes sans écraser le workspace
            if (mergeWithExisting) {
                const existingBatchResults = current?.batchResults || [];
                const existingRevisionIds = new Set(
                    existingBatchResults.map((entry) => entry?.bom_revision_id).filter(Boolean),
                );
                const newBatchResults = buildImportWorkspaceFromSelection(normalizedSelection, loadedSessions).batchResults;
                const mergedBatchResults = [
                    ...existingBatchResults,
                    ...newBatchResults.filter((entry) => !existingRevisionIds.has(entry?.bom_revision_id)),
                ];

                return {
                    ...current,
                    batchResults: mergedBatchResults,
                    result: current.result || loadedSessions[0] || null,
                    error: null,
                };
            }

            // Mode preserve : garde le workspace si la sélection est identique, remplace sinon
            if (preserveExistingWorkspace) {
                const currentRevisionIds = new Set(
                    (current?.batchResults || [])
                        .map((entry) => entry?.bom_revision_id).filter(Boolean),
                );

                const newRevisionIds = new Set(normalizedSelection.map((entry) => entry?.bom_revision_id).filter(Boolean));
                const sameSelection = currentRevisionIds.size === newRevisionIds.size
                    && [...newRevisionIds].every((id) => currentRevisionIds.has(id));

                if (sameSelection) return current;
            }

            return buildImportWorkspaceFromSelection(normalizedSelection, loadedSessions);
        });
    }
}

// Alias for backward compatibility
export { hydrateStoredBomSelection as hydrateProductionWorkspace };
