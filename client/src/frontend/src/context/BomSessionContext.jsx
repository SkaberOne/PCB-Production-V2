import React, { createContext, useContext, useState } from 'react';
import { createDefaultImportWorkspace, DEFAULT_IMPORT_FORM } from '../utils/bomImportWorkspace';
import {
    buildSelectionSignature,
    buildReferenceRevisionKey,
    createDefaultBomWorkspace,
    ensureQuantityEntries,
    hydrateBomWorkspace,
    normalizeBomWorkspaceEntry,
    normalizeBomWorkspaceRevision,
    serializeBomWorkspace,
} from '../utils/bomWorkspace';

const BomSessionContext = createContext(null);
const BOM_WORKSPACE_PERSIST_DELAY_MS = 700;
const CURRENT_BOM_PERSIST_DELAY_MS = 450;
const IMPORT_WORKSPACE_PERSIST_DELAY_MS = 450;
const ACTIVE_PRODUCTION_STORAGE_KEY = 'pcb-production:active-production';
const CURRENT_BOM_STORAGE_PREFIX = 'pcb-production:current-bom:';
const IMPORT_WORKSPACE_STORAGE_PREFIX = 'pcb-production:import-workspace:';
const BOM_WORKSPACE_STORAGE_PREFIX = 'pcb-production:bom-workspace:';
const DEFAULT_PRODUCTION_SCOPE = 'standalone';

// TTL : 30 jours — les entrées plus anciennes sont purgées au boot
const STORAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Marqueur de version pour distinguer le nouveau format (avec TTL) de l'ancien
const STORAGE_FORMAT_VERSION = 1;

function getScopedStorageKey(prefix, productionId) {
    return `${prefix}${productionId || DEFAULT_PRODUCTION_SCOPE}`;
}

function readScopedStorage(prefix, productionId) {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const rawValue = window.localStorage.getItem(getScopedStorageKey(prefix, productionId));
        if (!rawValue) {
            return null;
        }

        const parsed = JSON.parse(rawValue);

        // Nouveau format versionné avec TTL
        if (parsed && parsed._v === STORAGE_FORMAT_VERSION && parsed._savedAt) {
            if (Date.now() - parsed._savedAt > STORAGE_TTL_MS) {
                // Entrée expirée — la supprimer immédiatement
                window.localStorage.removeItem(getScopedStorageKey(prefix, productionId));
                return null;
            }
            return parsed.data;
        }

        // Ancien format sans TTL (rétrocompatibilité) — retourner directement
        return parsed;
    } catch {
        return null;
    }
}

function writeScopedStorage(prefix, productionId, value) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        // Nouveau format versionné avec timestamp pour le TTL
        window.localStorage.setItem(
            getScopedStorageKey(prefix, productionId),
            JSON.stringify({ _v: STORAGE_FORMAT_VERSION, _savedAt: Date.now(), data: value }),
        );
    } catch (storageError) {
        // QuotaExceededError — données trop volumineuses pour localStorage
        // (ex : workspace avec de nombreuses BOM chargées simultanément)
        // La session reste fonctionnelle en mémoire ; seule la persistance inter-sessions est perdue.
        console.warn('[writeScopedStorage] Quota localStorage dépassé — donnée non persistée:', storageError.message);
    }
}

function removeScopedStorage(prefix, productionId) {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.removeItem(getScopedStorageKey(prefix, productionId));
}

/**
 * Purge les entrées localStorage de session expirées (> 30 jours).
 * Appelé une fois au boot du Provider — ne bloque pas le rendu.
 */
function purgeExpiredScopedStorage() {
    if (typeof window === 'undefined') {
        return;
    }

    const SCOPED_PREFIXES = [
        CURRENT_BOM_STORAGE_PREFIX,
        IMPORT_WORKSPACE_STORAGE_PREFIX,
        BOM_WORKSPACE_STORAGE_PREFIX,
    ];

    try {
        Object.keys(window.localStorage).forEach((key) => {
            if (!SCOPED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
                return;
            }

            try {
                const parsed = JSON.parse(window.localStorage.getItem(key));
                if (
                    parsed?._v === STORAGE_FORMAT_VERSION
                    && parsed?._savedAt
                    && Date.now() - parsed._savedAt > STORAGE_TTL_MS
                ) {
                    window.localStorage.removeItem(key);
                }
            } catch {
                // Ignorer les erreurs de parsing sur des clés individuelles
            }
        });
    } catch {
        // Ignorer les erreurs globales (ex: localStorage inaccessible)
    }
}

function scheduleIdleTask(callback) {
    if (typeof window === 'undefined') {
        return null;
    }

    if (typeof window.requestIdleCallback === 'function') {
        return {
            type: 'idle',
            id: window.requestIdleCallback(callback, { timeout: 300 }),
        };
    }

    return {
        type: 'timeout',
        id: window.setTimeout(callback, 16),
    };
}

function cancelIdleTask(handle) {
    if (!handle || typeof window === 'undefined') {
        return;
    }

    if (handle.type === 'idle' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(handle.id);
        return;
    }

    window.clearTimeout(handle.id);
}

function clearScheduledTask(taskRef) {
    if (!taskRef.current || typeof window === 'undefined') {
        taskRef.current = null;
        return;
    }

    if (taskRef.current.timeoutId) {
        window.clearTimeout(taskRef.current.timeoutId);
    }
    cancelIdleTask(taskRef.current.idleHandle);
    taskRef.current = null;
}

function scheduleDeferredTask(taskRef, delay, callback) {
    if (typeof window === 'undefined') {
        return;
    }

    clearScheduledTask(taskRef);

    const nextTask = {
        timeoutId: null,
        idleHandle: null,
    };

    nextTask.timeoutId = window.setTimeout(() => {
        nextTask.timeoutId = null;
        nextTask.idleHandle = scheduleIdleTask(() => {
            callback();
            if (taskRef.current === nextTask) {
                taskRef.current = null;
            }
        });
    }, delay);

    taskRef.current = nextTask;
}

function normalizeImportedBom(payload) {
    const items = Array.isArray(payload.items) ? payload.items : [];

    return {
        reference: payload.reference || '',
        revision: payload.revision || '',
        side: payload.side || 'TOP',
        status: payload.status || payload.revision_status || 'DRAFT',
        bomReferenceId: payload.bom_reference_id || null,
        bomRevisionId: payload.bom_revision_id || null,
        message: payload.message || '',
        itemCount: payload.item_count ?? items.length,
        items,
        stats: payload.stats || {},
        warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
        errors: Array.isArray(payload.errors) ? payload.errors : [],
        updatedAt: new Date().toISOString(),
    };
}

function normalizeImportWorkspace(payload = {}) {
    return {
        files: Array.isArray(payload.files) ? payload.files : [],
        draftBatch: Array.isArray(payload.draftBatch) ? payload.draftBatch : [],
        result: payload.result || null,
        batchResults: Array.isArray(payload.batchResults) ? payload.batchResults : [],
        error: payload.error || null,
        form: {
            ...DEFAULT_IMPORT_FORM,
            ...(payload.form || {}),
        },
        autoDetectedImport: {
            reference: '',
            side: '',
            ...(payload.autoDetectedImport || {}),
        },
        componentResolutionPaused: Boolean(payload.componentResolutionPaused),
        footprintResolutionPaused: Boolean(payload.footprintResolutionPaused),
        batchComponentResolutionPaused: Boolean(payload.batchComponentResolutionPaused),
        batchFootprintResolutionPaused: Boolean(payload.batchFootprintResolutionPaused),
        pendingFootprintPrompt: Boolean(payload.pendingFootprintPrompt),
    };
}

function normalizeActiveProduction(payload = null) {
    if (!payload || !payload.id) {
        return null;
    }

    return {
        id: Number(payload.id),
        name: payload.name || '',
        status: payload.status || 'ACTIVE',
        notes: payload.notes || null,
        bomCount: Number(payload.bom_count ?? payload.bomCount ?? 0),
        linkedReferences: Array.isArray(payload.linked_references)
            ? payload.linked_references
            : (Array.isArray(payload.linkedReferences) ? payload.linkedReferences : []),
        bomRevisions: Array.isArray(payload.bom_revisions)
            ? payload.bom_revisions
            : (Array.isArray(payload.bomRevisions) ? payload.bomRevisions : []),
        createdAt: payload.created_at || payload.createdAt || null,
        updatedAt: payload.updated_at || payload.updatedAt || null,
    };
}

function buildProductionQuantityEntries(production = null) {
    const bomRevisions = Array.isArray(production?.bomRevisions) ? production.bomRevisions : [];
    const quantityEntries = {};

    bomRevisions.forEach((entry) => {
        const key = buildReferenceRevisionKey(entry.reference, entry.revision);
        if (!key) {
            return;
        }

        const parsedQuantity = Number(entry.quantity_to_produce ?? entry.quantityToProduce ?? 1);
        const quantityToProduce = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;
        const existingEntry = quantityEntries[key];
        quantityEntries[key] = {
            key,
            reference: entry.reference || existingEntry?.reference || '',
            revision: entry.revision || existingEntry?.revision || '',
            quantityToProduce: existingEntry
                ? Math.max(existingEntry.quantityToProduce || 1, quantityToProduce)
                : quantityToProduce,
        };
    });

    return quantityEntries;
}

function patchItems(items = [], itemIds = [], patch = {}) {
    const targetIds = itemIds instanceof Set ? itemIds : new Set(itemIds);
    let changed = false;

    const nextItems = items.map((item) => {
        if (!targetIds.has(item.id)) {
            return item;
        }

        const hasDiff = Object.entries(patch).some(([key, value]) => item[key] !== value);
        if (!hasDiff) {
            return item;
        }

        changed = true;
        return {
            ...item,
            ...patch,
        };
    });

    return changed ? nextItems : items;
}

export function BomSessionProvider({ children }) {
    const [activeProduction, setActiveProductionState] = useState(() => {
        if (typeof window === 'undefined') {
            return null;
        }

        try {
            const rawProduction = window.localStorage.getItem(ACTIVE_PRODUCTION_STORAGE_KEY);
            return normalizeActiveProduction(rawProduction ? JSON.parse(rawProduction) : null);
        } catch {
            return null;
        }
    });
    const initialProductionId = activeProduction?.id || null;
    const [currentBom, setCurrentBom] = useState(() => {
        const persistedBom = readScopedStorage(CURRENT_BOM_STORAGE_PREFIX, initialProductionId);
        return persistedBom ? normalizeImportedBom(persistedBom) : null;
    });
    const [importWorkspace, setImportWorkspace] = useState(() => {
        const persistedWorkspace = readScopedStorage(IMPORT_WORKSPACE_STORAGE_PREFIX, initialProductionId);
        return persistedWorkspace ? normalizeImportWorkspace(persistedWorkspace) : createDefaultImportWorkspace();
    });
    const bomWorkspacePersistRef = React.useRef(null);
    const currentBomPersistRef = React.useRef(null);
    const importWorkspacePersistRef = React.useRef(null);
    const activeProductionIdRef = React.useRef(activeProduction?.id || null);
    const [bomWorkspace, setBomWorkspace] = useState(() => {
        const persistedWorkspace = readScopedStorage(BOM_WORKSPACE_STORAGE_PREFIX, initialProductionId);
        if (!persistedWorkspace) {
            return createDefaultBomWorkspace();
        }

        return hydrateBomWorkspace(persistedWorkspace);
    });
    // Stable refs for flush — avoids recreating flushCurrentSessionPersistence on every state change
    const bomWorkspaceRef = React.useRef(bomWorkspace);
    const currentBomRef = React.useRef(currentBom);
    const importWorkspaceRef = React.useRef(importWorkspace);
    React.useEffect(() => {
        activeProductionIdRef.current = activeProduction?.id || null;
    }, [activeProduction?.id]);
    // Keep refs in sync with latest state (no deps cascade)
    React.useEffect(() => { bomWorkspaceRef.current = bomWorkspace; }, [bomWorkspace]);
    React.useEffect(() => { currentBomRef.current = currentBom; }, [currentBom]);
    React.useEffect(() => { importWorkspaceRef.current = importWorkspace; }, [importWorkspace]);

    // Purge des entrées expirées + migration des entrées legacy → format TTL
    // Exécuté une seule fois au montage, après le premier rendu
    React.useEffect(() => {
        purgeExpiredScopedStorage();
        // Force la réécriture de toutes les entrées de session dans le nouveau format versionné
        // (les entrées legacy sans _v sont ainsi migrées dès le boot)
        flushCurrentSessionPersistence();
    // flushCurrentSessionPersistence est stable (useCallback avec deps vides)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const flushCurrentSessionPersistence = React.useCallback((productionId = activeProductionIdRef.current) => {
        if (typeof window === 'undefined') {
            return;
        }

        clearScheduledTask(bomWorkspacePersistRef);
        clearScheduledTask(currentBomPersistRef);
        clearScheduledTask(importWorkspacePersistRef);

        // Read latest values from refs — avoids stale closure AND avoids listing state as deps
        const latestBomWorkspace = bomWorkspaceRef.current;
        const latestCurrentBom = currentBomRef.current;
        const latestImportWorkspace = importWorkspaceRef.current;

        writeScopedStorage(
            BOM_WORKSPACE_STORAGE_PREFIX,
            productionId,
            serializeBomWorkspace(latestBomWorkspace),
        );

        if (latestCurrentBom) {
            writeScopedStorage(CURRENT_BOM_STORAGE_PREFIX, productionId, latestCurrentBom);
        } else {
            removeScopedStorage(CURRENT_BOM_STORAGE_PREFIX, productionId);
        }

        writeScopedStorage(
            IMPORT_WORKSPACE_STORAGE_PREFIX,
            productionId,
            latestImportWorkspace,
        );
    }, []); // stable — no state deps, reads from refs

    React.useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const productionId = activeProduction?.id || null;
        scheduleDeferredTask(
            bomWorkspacePersistRef,
            BOM_WORKSPACE_PERSIST_DELAY_MS,
            () => {
                writeScopedStorage(
                    BOM_WORKSPACE_STORAGE_PREFIX,
                    productionId,
                    serializeBomWorkspace(bomWorkspace),
                );
            },
        );

        return () => {
            clearScheduledTask(bomWorkspacePersistRef);
        };
    }, [activeProduction?.id, bomWorkspace]);

    React.useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const productionId = activeProduction?.id || null;
        scheduleDeferredTask(
            currentBomPersistRef,
            CURRENT_BOM_PERSIST_DELAY_MS,
            () => {
                if (currentBom) {
                    writeScopedStorage(CURRENT_BOM_STORAGE_PREFIX, productionId, currentBom);
                    return;
                }

                removeScopedStorage(CURRENT_BOM_STORAGE_PREFIX, productionId);
            },
        );

        return () => {
            clearScheduledTask(currentBomPersistRef);
        };
    }, [activeProduction?.id, currentBom]);

    React.useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const productionId = activeProduction?.id || null;
        scheduleDeferredTask(
            importWorkspacePersistRef,
            IMPORT_WORKSPACE_PERSIST_DELAY_MS,
            () => {
                writeScopedStorage(
                    IMPORT_WORKSPACE_STORAGE_PREFIX,
                    productionId,
                    importWorkspace,
                );
            },
        );

        return () => {
            clearScheduledTask(importWorkspacePersistRef);
        };
    }, [activeProduction?.id, importWorkspace]);

    React.useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        if (activeProduction) {
            window.localStorage.setItem(
                ACTIVE_PRODUCTION_STORAGE_KEY,
                JSON.stringify(activeProduction),
            );
            return;
        }

        window.localStorage.removeItem(ACTIVE_PRODUCTION_STORAGE_KEY);
    }, [activeProduction]);

    const setImportedBom = React.useCallback((payload) => {
        const normalizedBom = normalizeImportedBom(payload);
        const normalizedEntry = normalizeBomWorkspaceEntry(payload);
        const sessionProductionId = activeProductionIdRef.current;

        setCurrentBom(normalizedBom);
        setBomWorkspace((current) => {
            const revisionId = normalizedBom.bomRevisionId;
            const selectedRevisionEntries = current.selectedRevisionEntries.some(
                (entry) => entry.bom_revision_id === normalizedEntry.bom_revision_id,
            )
                ? current.selectedRevisionEntries.map((entry) => (
                    entry.bom_revision_id === normalizedEntry.bom_revision_id
                        ? { ...entry, ...normalizedEntry }
                        : entry
                ))
                : [...current.selectedRevisionEntries, normalizedEntry].filter((entry) => entry.bom_revision_id);
            const selectionChanged = (
                buildSelectionSignature(current.selectedRevisionEntries)
                !== buildSelectionSignature(selectedRevisionEntries)
            );

            return {
                ...current,
                activeProductionId: sessionProductionId,
                selectedRevisionEntries,
                activeRevisionId: revisionId || current.activeRevisionId,
                revisionsById: revisionId
                    ? {
                        ...current.revisionsById,
                        [revisionId]: normalizeBomWorkspaceRevision(payload),
                    }
                    : current.revisionsById,
                quantitiesByReference: ensureQuantityEntries(
                    selectedRevisionEntries,
                    selectionChanged ? {} : current.quantitiesByReference,
                ),
                stockDraftByComponentKey: selectionChanged ? {} : current.stockDraftByComponentKey,
                stockValidation: selectionChanged
                    ? { isValidated: false, validatedAt: null }
                    : current.stockValidation,
            };
        });
    }, []);

    const updateBomItem = React.useCallback((itemIndex, patch) => {
        setCurrentBom((current) => {
            if (!current) {
                return current;
            }

            return {
                ...current,
                items: current.items.map((item, index) => (
                    index === itemIndex
                        ? { ...item, ...patch }
                        : item
                )),
                updatedAt: new Date().toISOString(),
            };
        });
    }, []);

    const setSelectedBomEntries = React.useCallback((entries) => {
        const normalizedEntries = (Array.isArray(entries) ? entries : [])
            .map((entry) => normalizeBomWorkspaceEntry(entry))
            .filter((entry) => entry.bom_revision_id);
        const sessionProductionId = activeProductionIdRef.current;

        setBomWorkspace((current) => {
            const selectionChanged = (
                buildSelectionSignature(current.selectedRevisionEntries)
                !== buildSelectionSignature(normalizedEntries)
            );
            const selectedRevisionIds = new Set(normalizedEntries.map((entry) => entry.bom_revision_id));
            const revisionsById = selectionChanged
                ? Object.fromEntries(
                    Object.entries(current.revisionsById).filter(([revisionId]) => selectedRevisionIds.has(Number(revisionId))),
                )
                : current.revisionsById;

            return {
                ...current,
                activeProductionId: sessionProductionId,
                selectedRevisionEntries: normalizedEntries,
                activeRevisionId: normalizedEntries[0]?.bom_revision_id || (selectionChanged ? null : current.activeRevisionId || null),
                revisionsById,
                quantitiesByReference: ensureQuantityEntries(
                    normalizedEntries,
                    selectionChanged ? {} : current.quantitiesByReference,
                ),
                stockDraftByComponentKey: selectionChanged ? {} : current.stockDraftByComponentKey,
                stockValidation: selectionChanged
                    ? { isValidated: false, validatedAt: null }
                    : current.stockValidation,
            };
        });
    }, []);

    const setActiveBomRevision = React.useCallback((revisionId) => {
        setBomWorkspace((current) => ({
            ...current,
            activeRevisionId: revisionId,
        }));
    }, []);

    const cacheBomRevision = React.useCallback((payload) => {
        const normalizedRevision = normalizeBomWorkspaceRevision(payload);
        const normalizedEntry = normalizeBomWorkspaceEntry(payload);
        const revisionId = normalizedRevision.bomRevisionId;
        const sessionProductionId = activeProductionIdRef.current;

        if (!revisionId) {
            return;
        }

        setBomWorkspace((current) => {
            const selectedRevisionEntries = current.selectedRevisionEntries.some(
                (entry) => entry.bom_revision_id === revisionId,
            )
                ? current.selectedRevisionEntries.map((entry) => (
                    entry.bom_revision_id === revisionId
                        ? { ...entry, ...normalizedEntry }
                        : entry
                ))
                : [...current.selectedRevisionEntries, normalizedEntry];

            return {
                ...current,
                activeProductionId: sessionProductionId,
                selectedRevisionEntries,
                revisionsById: {
                    ...current.revisionsById,
                    [revisionId]: normalizedRevision,
                },
                quantitiesByReference: ensureQuantityEntries(
                    selectedRevisionEntries,
                    current.quantitiesByReference,
                ),
            };
        });
    }, []);

    const updateBomWorkspaceItems = React.useCallback((revisionId, itemIds, patch) => {
        const normalizedIds = Array.isArray(itemIds) ? itemIds.filter(Boolean) : [];
        if (!revisionId || !normalizedIds.length) {
            return;
        }

        const targetIds = new Set(normalizedIds);

        setBomWorkspace((current) => {
            const existingRevision = current.revisionsById[revisionId];
            if (!existingRevision) {
                return current;
            }

            const nextItems = patchItems(existingRevision.items, targetIds, patch);
            if (nextItems === existingRevision.items) {
                return current;
            }

            return {
                ...current,
                revisionsById: {
                    ...current.revisionsById,
                    [revisionId]: {
                        ...existingRevision,
                        items: nextItems,
                        dirty: true,
                        updatedAt: new Date().toISOString(),
                    },
                },
            };
        });

        setCurrentBom((current) => {
            if (!current || current.bomRevisionId !== revisionId) {
                return current;
            }

            const nextItems = patchItems(current.items, targetIds, patch);
            if (nextItems === current.items) {
                return current;
            }

            return {
                ...current,
                items: nextItems,
                updatedAt: new Date().toISOString(),
            };
        });
    }, []);

    const updateBomWorkspaceItem = React.useCallback((revisionId, itemId, patch) => {
        updateBomWorkspaceItems(revisionId, [itemId], patch);
    }, [updateBomWorkspaceItems]);

    const updateBomWorkspaceQuantity = React.useCallback(({ reference, revision, quantityToProduce }) => {
        const key = buildReferenceRevisionKey(reference, revision);
        if (!key) {
            return;
        }

        setBomWorkspace((current) => ({
            ...current,
            quantitiesByReference: {
                ...current.quantitiesByReference,
                [key]: {
                    key,
                    reference,
                    revision,
                    quantityToProduce,
                },
            },
            stockValidation: {
                isValidated: false,
                validatedAt: null,
            },
        }));
    }, []);

    const setBomWorkspaceActiveTab = React.useCallback((activeTab) => {
        setBomWorkspace((current) => ({
            ...current,
            activeTab,
        }));
    }, []);

    const updateBomWorkspaceStockDraft = React.useCallback((componentKey, patch) => {
        if (!componentKey) {
            return;
        }

        setBomWorkspace((current) => ({
            ...current,
            stockDraftByComponentKey: {
                ...current.stockDraftByComponentKey,
                [componentKey]: {
                    ...(current.stockDraftByComponentKey[componentKey] || {}),
                    ...patch,
                },
            },
            stockValidation: {
                isValidated: false,
                validatedAt: null,
            },
        }));
    }, []);

    const setBomWorkspaceStockValidated = React.useCallback((isValidated) => {
        setBomWorkspace((current) => ({
            ...current,
            stockValidation: {
                isValidated: Boolean(isValidated),
                validatedAt: isValidated ? new Date().toISOString() : null,
            },
        }));
    }, []);

    const removeBomWorkspaceRevision = React.useCallback((revisionId) => {
        if (!revisionId) {
            return;
        }

        setBomWorkspace((current) => {
            const remainingEntries = current.selectedRevisionEntries.filter(
                (entry) => entry.bom_revision_id !== revisionId,
            );
            const remainingRevisionIds = new Set(remainingEntries.map((entry) => entry.bom_revision_id));
            const nextRevisionsById = Object.fromEntries(
                Object.entries(current.revisionsById).filter(([key]) => remainingRevisionIds.has(Number(key))),
            );
            const remainingQuantityKeys = new Set(
                remainingEntries.map((entry) => buildReferenceRevisionKey(entry.reference, entry.revision)),
            );
            const nextQuantitiesByReference = Object.fromEntries(
                Object.entries(current.quantitiesByReference).filter(([key]) => remainingQuantityKeys.has(key)),
            );

            return {
                ...current,
                selectedRevisionEntries: remainingEntries,
                activeRevisionId: current.activeRevisionId === revisionId
                    ? (remainingEntries[0]?.bom_revision_id || null)
                    : current.activeRevisionId,
                revisionsById: nextRevisionsById,
                quantitiesByReference: nextQuantitiesByReference,
                stockDraftByComponentKey: {},
                stockValidation: {
                    isValidated: false,
                    validatedAt: null,
                },
            };
        });

        setCurrentBom((current) => (
            current?.bomRevisionId === revisionId
                ? null
                : current
        ));
    }, []);

    const clearCurrentBom = React.useCallback(() => {
        setCurrentBom(null);
    }, []);

    // Helpers pour updateImportWorkspace / resetImportWorkspace
    const updateImportWorkspace = React.useCallback((updater) => {
        setImportWorkspace((current) => (typeof updater === 'function' ? updater(current) : updater));
    }, []);

    const resetImportWorkspace = React.useCallback(() => {
        setImportWorkspace(createDefaultImportWorkspace());
    }, []);

    const setActiveProduction = React.useCallback((payload) => {
        const normalizedProduction = normalizeActiveProduction(payload);
        const nextProductionId = normalizedProduction?.id || null;
        const productionQuantityEntries = buildProductionQuantityEntries(normalizedProduction);
        if (nextProductionId !== activeProductionIdRef.current) {
            flushCurrentSessionPersistence();
        }
        activeProductionIdRef.current = nextProductionId;
        setActiveProductionState(normalizedProduction);
        setBomWorkspace((current) => ({
            ...current,
            activeProductionId: nextProductionId,
            quantitiesByReference: Object.keys(productionQuantityEntries).length
                ? { ...current.quantitiesByReference, ...productionQuantityEntries }
                : current.quantitiesByReference,
        }));
    }, [flushCurrentSessionPersistence]);

    const activateProductionSession = React.useCallback((payload, options = {}) => {
        const { resetSession = true } = options;
        const normalizedProduction = normalizeActiveProduction(payload);
        const nextProductionId = normalizedProduction?.id || null;
        const productionQuantityEntries = buildProductionQuantityEntries(normalizedProduction);
        if (nextProductionId !== activeProductionIdRef.current || resetSession) {
            flushCurrentSessionPersistence();
        }
        const nextCurrentBom = resetSession
            ? (() => {
                const persistedBom = readScopedStorage(CURRENT_BOM_STORAGE_PREFIX, nextProductionId);
                return persistedBom ? normalizeImportedBom(persistedBom) : null;
            })()
            : currentBomRef.current;
        const nextImportWorkspace = resetSession
            ? (() => {
                const persistedImportWorkspace = readScopedStorage(IMPORT_WORKSPACE_STORAGE_PREFIX, nextProductionId);
                return persistedImportWorkspace ? normalizeImportWorkspace(persistedImportWorkspace) : createDefaultImportWorkspace();
            })()
            : importWorkspaceRef.current;
        const nextBomWorkspace = resetSession
            ? (() => {
                const persistedBomWorkspace = readScopedStorage(BOM_WORKSPACE_STORAGE_PREFIX, nextProductionId);
                return persistedBomWorkspace ? hydrateBomWorkspace(persistedBomWorkspace) : createDefaultBomWorkspace();
            })()
            : bomWorkspaceRef.current;

        activeProductionIdRef.current = nextProductionId;
        setActiveProductionState(normalizedProduction);
        setCurrentBom(nextCurrentBom);
        setImportWorkspace(nextImportWorkspace);
        setBomWorkspace({
            ...nextBomWorkspace,
            activeProductionId: nextProductionId,
            quantitiesByReference: Object.keys(productionQuantityEntries).length
                ? { ...nextBomWorkspace.quantitiesByReference, ...productionQuantityEntries }
                : nextBomWorkspace.quantitiesByReference,
        });
    }, [flushCurrentSessionPersistence]);

    const clearActiveProduction = React.useCallback(() => {
        setActiveProduction(null);
    }, [setActiveProduction]);

    // Alias pour compatibilité avec les composants qui utilisent flushSessionPersistence
    const flushSessionPersistence = flushCurrentSessionPersistence;

    const value = {
        currentBom,
        setCurrentBom,
        importWorkspace,
        setImportWorkspace,
        updateImportWorkspace,
        resetImportWorkspace,
        bomWorkspace,
        setBomWorkspace,
        // Vue dérivée des révisions sélectionnées (lecture seule pour les
        // consommateurs ; la source canonique est bomWorkspace.selectedRevisionEntries).
        selectedBomEntries: bomWorkspace.selectedRevisionEntries,
        setImportedBom,
        updateBomItem,
        setSelectedBomEntries,
        setActiveBomRevision,
        cacheBomRevision,
        updateBomWorkspaceItems,
        updateBomWorkspaceItem,
        updateBomWorkspaceQuantity,
        setBomWorkspaceActiveTab,
        updateBomWorkspaceStockDraft,
        setBomWorkspaceStockValidated,
        removeBomWorkspaceRevision,
        clearCurrentBom,
        setActiveProduction,
        clearActiveProduction,
        activateProductionSession,
        activeProduction,
        flushCurrentSessionPersistence,
        flushSessionPersistence,
    };

    return (
        <BomSessionContext.Provider value={value}>
            {children}
        </BomSessionContext.Provider>
    );
}

export function useBomSession() {
    const ctx = useContext(BomSessionContext);
    if (!ctx) throw new Error('useBomSession must be used within BomSessionProvider');
    return ctx;
}
