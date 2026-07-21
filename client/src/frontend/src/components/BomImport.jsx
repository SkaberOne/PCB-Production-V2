import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, LinearProgress, Typography } from '@mui/material';
import apiClient from '../api/client';
import { useNavigate } from 'react-router-dom';
import BomImportOverviewPanel from './import/BomImportOverviewPanel';
import BomImportPreviewCard from './import/BomImportPreviewCard';
import BomImportResolutionDialogs from './import/BomImportResolutionDialogs';
import BomImportWorkspaceCard from './import/BomImportWorkspaceCard';
import { useBomSession } from '../context/BomSessionContext';
import { buildReviewSelectionFromSettled, persistImportedBatchMetadata, persistImportWorkspaceBeforeReview } from '../utils/importReview';
import {
    applyPreviewFieldToWorkspace,
    buildPreviewTarget,
    matchesPreviewFilters,
} from '../utils/bomImportPreview';
import {
    buildBatchMissingComponentGroups,
    buildBatchMissingFootprintGroups,
    buildBatchDraftFromFiles,
    buildCompactImportPreviewGroups,
    buildImportPreviewItems,
    buildMissingComponentGroups,
    buildMissingFootprintGroups,
    buildSessionRows,
    decorateBatchResult,
    DEFAULT_IMPORT_FORM,
    extractImportMetadataFromFilename,
} from '../utils/bomImportWorkspace';
import { runWithConcurrencyLimit } from '../utils/concurrencyPool';
import './BomImport.css';

function BomImport({ showVisualizationAction = true }) {
    const navigate = useNavigate();
    const {
        currentBom,
        clearCurrentBom,
        importWorkspace,
        resetImportWorkspace,
        setImportedBom,
        setSelectedBomEntries,
        updateImportWorkspace,
    } = useBomSession();

    const {
        files,
        draftBatch,
        result,
        batchResults,
        error,
        form,
        componentResolutionPaused,
        footprintResolutionPaused,
        batchComponentResolutionPaused,
        batchFootprintResolutionPaused,
        pendingFootprintPrompt,
    } = importWorkspace;

    const [loading, setLoading] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
    const [dragActive, setDragActive] = useState(false);
    const [componentResolutionName, setComponentResolutionName] = useState('');
    const [componentResolutionError, setComponentResolutionError] = useState('');
    const [componentResolutionLoading, setComponentResolutionLoading] = useState(false);
    const [componentBatchDrafts, setComponentBatchDrafts] = useState({});
    const [footprintResolutionValue, setFootprintResolutionValue] = useState('');
    const [footprintResolutionError, setFootprintResolutionError] = useState('');
    const [footprintResolutionLoading, setFootprintResolutionLoading] = useState(false);
    const [footprintBatchDrafts, setFootprintBatchDrafts] = useState({});
    const [rowActionState, setRowActionState] = useState({ action: '', key: null });
    const [itemUpdateState, setItemUpdateState] = useState({ itemId: null, message: '', type: 'info' });
    const [reviewNavigationLoading, setReviewNavigationLoading] = useState(false);
    const [sessionPage, setSessionPage] = useState(0);
    const [sessionRowsPerPage, setSessionRowsPerPage] = useState(25);
    const [previewPage, setPreviewPage] = useState(0);
    const [previewRowsPerPage, setPreviewRowsPerPage] = useState(25);
    const [previewScope, setPreviewScope] = useState('selected');
    const [previewMode, setPreviewMode] = useState('raw');
    const [previewSearch, setPreviewSearch] = useState('');
    const [previewStatusFilter, setPreviewStatusFilter] = useState('all');
    const [previewFootprintDrafts, setPreviewFootprintDrafts] = useState({});

    const file = files[0] || null;
    const isBatchMode = files.length > 1;
    const hasFiles = files.length > 0;
    const hasStoredBatchResults = batchResults.length > 0;
    const uploadSummaryLabel = hasFiles
        ? (isBatchMode ? `${files.length} fichiers sélectionnés` : file.name)
        : 'Aucun fichier chargé';
    const uploadSummaryMeta = hasFiles
        ? (isBatchMode
            ? draftBatch.map((row) => row.file_name).join(' | ')
            : `${(file.size / 1024).toFixed(2)} KB`)
        : 'Formats acceptés : .txt Eagle, import unitaire ou par lot.';

    const effectiveUploadSummaryLabel = !hasFiles && hasStoredBatchResults
        ? (batchResults.length > 1 ? `${batchResults.length} BOM sauvegardées chargées` : (batchResults[0]?.file_name || 'BOM sauvegardée chargée'))
        : uploadSummaryLabel;
    const effectiveUploadSummaryMeta = !hasFiles && hasStoredBatchResults
        ? batchResults.map((entry) => entry.file_name || `${entry.reference || 'BOM'} ${entry.revision || ''}`.trim()).join(' | ')
        : uploadSummaryMeta;

    const updateWorkspace = useCallback((updater) => {
        updateImportWorkspace(updater);
    }, [updateImportWorkspace]);

    const syncResultPayload = useCallback((responseData) => {
        updateWorkspace((current) => {
            const existingRow = current.batchResults.find(
                (entry) => entry.bom_revision_id === responseData.bom_revision_id
            );
            const mergedEntry = decorateBatchResult({ ...existingRow, ...responseData }, existingRow || {});
            const nextBatchResults = current.batchResults.length
                ? current.batchResults.map((entry) => (
                    entry.bom_revision_id === responseData.bom_revision_id
                        ? decorateBatchResult({ ...entry, ...responseData }, entry)
                        : entry
                ))
                : [mergedEntry];

            return {
                ...current,
                result: mergedEntry,
                batchResults: nextBatchResults,
                error: null,
            };
        });

        setImportedBom(responseData);
    }, [setImportedBom, updateWorkspace]);

    const setWorkspaceError = useCallback((message) => {
        updateWorkspace((current) => ({
            ...current,
            error: message,
        }));
    }, [updateWorkspace]);

    const handleDraftFieldChange = useCallback((rowKey, field, value) => {
        updateWorkspace((current) => ({
            ...current,
            draftBatch: current.draftBatch.map((row) => (
                row.row_key === rowKey
                    ? { ...row, [field]: value }
                    : row
            )),
        }));
    }, [updateWorkspace]);

    const handleBatchResultFieldChange = useCallback((targetKey, field, value) => {
        updateWorkspace((current) => {
            const nextBatchResults = current.batchResults.map((entry) => {
                const rowKey = entry.bom_revision_id || entry.file_name;
                return rowKey === targetKey
                    ? { ...entry, [field]: value }
                    : entry;
            });

            const nextResult = current.result && (current.result.bom_revision_id || current.result.file_name) === targetKey
                ? { ...current.result, [field]: value }
                : current.result;

            return {
                ...current,
                batchResults: nextBatchResults,
                result: nextResult,
            };
        });
    }, [updateWorkspace]);

    const handleDrag = (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (event.type === 'dragenter' || event.type === 'dragover') {
            setDragActive(true);
            return;
        }

        setDragActive(false);
    };

    const attachFiles = (selectedFiles) => {
        const normalizedFiles = Array.from(selectedFiles || []).filter(Boolean);
        if (!normalizedFiles.length) {
            return;
        }

        const invalidFile = normalizedFiles.find((selectedFile) => !selectedFile.name.toLowerCase().endsWith('.txt'));
        if (invalidFile) {
            setWorkspaceError('Veuillez utiliser un fichier .txt');
            return;
        }

        const nextDraftBatch = buildBatchDraftFromFiles(normalizedFiles, form.revision);

        if (normalizedFiles.length === 1) {
            const inferredImport = extractImportMetadataFromFilename(normalizedFiles[0].name);
            updateWorkspace((current) => {
                const currentReference = current.form.reference.trim();
                const shouldAutofillReference = !currentReference || currentReference === current.autoDetectedImport.reference;
                const shouldAutofillSide = current.form.side === current.autoDetectedImport.side || current.form.side === DEFAULT_IMPORT_FORM.side;

                return {
                    ...current,
                    files: normalizedFiles,
                    draftBatch: nextDraftBatch,
                    result: null,
                    batchResults: [],
                    error: null,
                    form: {
                        ...current.form,
                        reference: shouldAutofillReference && inferredImport.reference
                            ? inferredImport.reference
                            : current.form.reference,
                        side: shouldAutofillSide && inferredImport.side
                            ? inferredImport.side
                            : current.form.side,
                    },
                    autoDetectedImport: inferredImport,
                    componentResolutionPaused: false,
                    footprintResolutionPaused: false,
                    batchComponentResolutionPaused: false,
                    batchFootprintResolutionPaused: false,
                    pendingFootprintPrompt: true,
                };
            });
            return;
        }

        updateWorkspace((current) => ({
            ...current,
            files: normalizedFiles,
            draftBatch: nextDraftBatch,
            result: null,
            batchResults: [],
            error: null,
            form: {
                ...current.form,
                reference: '',
            },
            autoDetectedImport: { reference: '', side: '' },
            componentResolutionPaused: false,
            footprintResolutionPaused: false,
            batchComponentResolutionPaused: false,
            batchFootprintResolutionPaused: false,
            pendingFootprintPrompt: true,
        }));
    };

    const handleDrop = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragActive(false);
        attachFiles(event.dataTransfer.files);
    };

    const handleFileChange = (event) => {
        attachFiles(event.target.files);
    };

    const selectBatchResult = useCallback(async (batchItem) => {
        const rowKey = batchItem?.bom_revision_id || batchItem?.file_name || null;
        if (!batchItem?.success || !batchItem?.bom_revision_id) {
            updateWorkspace((current) => ({
                ...current,
                result: batchItem,
                error: null,
            }));

            if (batchItem?.success) {
                setImportedBom(batchItem);
            }
            return;
        }

        setRowActionState({ action: 'load-session', key: rowKey });
        try {
            const sessionResponse = await apiClient.get(`/bom/files/${batchItem.bom_revision_id}/session`);
            syncResultPayload(sessionResponse.data);
        } catch (requestError) {
            updateWorkspace((current) => ({
                ...current,
                result: batchItem,
                error: null,
            }));
            setImportedBom(batchItem);
            setWorkspaceError(
                requestError.response?.data?.detail || requestError.message || 'Erreur lors du rechargement de la session BOM'
            );
        } finally {
            setRowActionState((current) => (
                current.key === rowKey && current.action === 'load-session'
                    ? { action: '', key: null }
                    : current
            ));
        }
    }, [setImportedBom, setWorkspaceError, syncResultPayload, updateWorkspace]);

    const refreshBatchSessions = useCallback(async (revisionIds, preferredRevisionId = null) => {
        const normalizedRevisionIds = Array.from(new Set((revisionIds || []).filter(Boolean)));
        if (!normalizedRevisionIds.length) {
            return;
        }

        // Promise.allSettled — une session qui échoue n'annule pas les autres
        const settled = await Promise.allSettled(
            normalizedRevisionIds.map(async (revisionId) => {
                const response = await apiClient.get(`/bom/files/${revisionId}/session`);
                return response.data;
            })
        );

        const sessionResponses = settled
            .filter((result) => result.status === 'fulfilled')
            .map((result) => result.value);

        updateWorkspace((current) => {
            const refreshedByRevisionId = new Map(
                sessionResponses.map((payload) => [
                    payload.bom_revision_id,
                    decorateBatchResult(
                        {
                            ...current.batchResults.find((entry) => entry.bom_revision_id === payload.bom_revision_id),
                            ...payload,
                        },
                        current.batchResults.find((entry) => entry.bom_revision_id === payload.bom_revision_id) || {}
                    ),
                ])
            );

            const nextBatchResults = current.batchResults.map((entry) => (
                refreshedByRevisionId.get(entry.bom_revision_id) || entry
            ));

            let nextResult = current.result;
            const targetRevisionId = preferredRevisionId || current.result?.bom_revision_id || normalizedRevisionIds[0];
            if (targetRevisionId && refreshedByRevisionId.has(targetRevisionId)) {
                nextResult = refreshedByRevisionId.get(targetRevisionId);
            } else if (current.result?.bom_revision_id && refreshedByRevisionId.has(current.result.bom_revision_id)) {
                nextResult = refreshedByRevisionId.get(current.result.bom_revision_id);
            }

            return {
                ...current,
                batchResults: nextBatchResults,
                result: nextResult,
                error: null,
            };
        });

        const targetRevisionId = preferredRevisionId
            || (normalizedRevisionIds.includes(result?.bom_revision_id) ? result?.bom_revision_id : null);
        const activePayload = targetRevisionId
            ? sessionResponses.find((payload) => payload.bom_revision_id === targetRevisionId)
            : null;
        if (activePayload?.success) {
            setImportedBom(activePayload);
        }
    }, [result?.bom_revision_id, setImportedBom, updateWorkspace]);

    const pauseBatchResolution = () => {
        updateWorkspace((current) => ({
            ...current,
            batchComponentResolutionPaused: true,
            batchFootprintResolutionPaused: true,
        }));
    };

    const resumeBatchResolution = () => {
        updateWorkspace((current) => ({
            ...current,
            batchComponentResolutionPaused: false,
            batchFootprintResolutionPaused: false,
        }));
    };

    const successfulBatchResults = useMemo(
        () => batchResults.filter((entry) => entry?.success && entry?.bom_revision_id),
        [batchResults]
    );
    const isBatchResolutionMode = successfulBatchResults.length > 1;
    const missingComponentGroups = useMemo(
        () => buildMissingComponentGroups(result?.items || []),
        [result]
    );
    const currentMissingComponentGroup = missingComponentGroups[0] || null;
    const missingFootprintGroups = useMemo(
        () => buildMissingFootprintGroups(result?.items || []),
        [result]
    );
    const currentMissingFootprintGroup = missingFootprintGroups[0] || null;
    const batchMissingComponentGroups = useMemo(
        () => buildBatchMissingComponentGroups(successfulBatchResults),
        [successfulBatchResults]
    );
    const currentBatchMissingComponentGroup = batchMissingComponentGroups[0] || null;
    const batchMissingFootprintGroups = useMemo(
        () => buildBatchMissingFootprintGroups(successfulBatchResults),
        [successfulBatchResults]
    );
    const currentBatchMissingFootprintGroup = batchMissingFootprintGroups[0] || null;

    useEffect(() => {
        const activeGroup = isBatchResolutionMode
            ? currentBatchMissingComponentGroup
            : currentMissingComponentGroup;

        if (!activeGroup) {
            setComponentResolutionName('');
            setComponentResolutionError('');
            return;
        }

        setComponentResolutionName(activeGroup.proposedComponentName || '');
        setComponentResolutionError('');
    }, [currentBatchMissingComponentGroup, currentMissingComponentGroup, isBatchResolutionMode]);

    useEffect(() => {
        const activeGroup = isBatchResolutionMode
            ? currentBatchMissingFootprintGroup
            : currentMissingFootprintGroup;

        if (!activeGroup) {
            setFootprintResolutionValue('');
            setFootprintResolutionError('');
            return;
        }

        setFootprintResolutionValue('');
        setFootprintResolutionError('');
    }, [currentBatchMissingFootprintGroup, currentMissingFootprintGroup, isBatchResolutionMode]);

    useEffect(() => {
        if (!isBatchResolutionMode) {
            setComponentBatchDrafts({});
            return;
        }

        setComponentBatchDrafts((current) => {
            const nextDrafts = {};
            batchMissingComponentGroups.forEach((group) => {
                nextDrafts[group.key] = current[group.key] ?? group.proposedComponentName ?? '';
            });
            return nextDrafts;
        });
    }, [batchMissingComponentGroups, isBatchResolutionMode]);

    useEffect(() => {
        if (!isBatchResolutionMode) {
            setFootprintBatchDrafts({});
            return;
        }

        setFootprintBatchDrafts((current) => {
            const nextDrafts = {};
            batchMissingFootprintGroups.forEach((group) => {
                nextDrafts[group.key] = current[group.key] ?? '';
            });
            return nextDrafts;
        });
    }, [batchMissingFootprintGroups, isBatchResolutionMode]);

    useEffect(() => {
        if (isBatchResolutionMode) {
            return;
        }

        if (!pendingFootprintPrompt) {
            return;
        }

        if (currentMissingComponentGroup) {
            return;
        }

        if (!currentMissingFootprintGroup) {
            updateImportWorkspace((current) => ({
                ...current,
                pendingFootprintPrompt: false,
            }));
            return;
        }

        updateImportWorkspace((current) => ({
            ...current,
            footprintResolutionPaused: false,
            pendingFootprintPrompt: false,
        }));
    }, [
        currentMissingComponentGroup,
        currentMissingFootprintGroup,
        isBatchResolutionMode,
        pendingFootprintPrompt,
        updateImportWorkspace,
    ]);

    const handleUpload = async () => {
        if (!files.length) {
            setWorkspaceError('Veuillez sélectionner au moins un fichier');
            return;
        }

        const importRows = draftBatch;

        if (!importRows.length) {
            setWorkspaceError('Veuillez renseigner une référence BOM');
            return;
        }

        setLoading(true);
        setBatchProgress({ current: 0, total: importRows.length });
        setItemUpdateState({ itemId: null, message: '', type: 'info' });
        updateWorkspace((current) => ({
            ...current,
            error: null,
            batchResults: [],
            result: null,
            componentResolutionPaused: false,
            footprintResolutionPaused: false,
            batchComponentResolutionPaused: false,
            batchFootprintResolutionPaused: false,
            pendingFootprintPrompt: true,
        }));

        try {
            // Prépare les tâches d'import — factories (non encore lancées) pour le pool de concurrence
            let completedCount = 0;
            const IMPORT_CONCURRENCY_LIMIT = 3; // max 3 fichiers simultanés

            const importTaskFactories = importRows.map((row) => async () => {
                const reference = String(row.reference || '').trim();
                const revision = String(row.revision || '').trim();
                const side = String(row.side || DEFAULT_IMPORT_FORM.side).trim().toUpperCase();
                const category = String(row.category || '').trim();
                const name = String(row.name || '').trim();
                const cardType = String(row.card_type || '').trim().toUpperCase();

                if (!reference) {
                    completedCount += 1;
                    setBatchProgress({ current: completedCount, total: importRows.length });
                    return decorateBatchResult({
                        success: false,
                        file_name: row.file_name,
                        reference: '',
                        revision,
                        side,
                        message: `Référence introuvable pour ${row.file_name}`,
                        item_count: 0,
                        items: [],
                        stats: {},
                        warnings: [],
                        errors: [`Référence introuvable pour ${row.file_name}`],
                    }, row);
                }

                if (!revision) {
                    completedCount += 1;
                    setBatchProgress({ current: completedCount, total: importRows.length });
                    return decorateBatchResult({
                        success: false,
                        file_name: row.file_name,
                        reference,
                        revision: '',
                        side,
                        message: `Révision manquante pour ${row.file_name}`,
                        item_count: 0,
                        items: [],
                        stats: {},
                        warnings: [],
                        errors: [`Révision manquante pour ${row.file_name}`],
                    }, row);
                }

                try {
                    const formData = new FormData();
                    formData.append('file', row.file);
                    const response = await apiClient.post(
                        `/bom/import`,
                        formData,
                        {
                            headers: { 'Content-Type': 'multipart/form-data' },
                            params: {
                                reference,
                                revision,
                                side,
                                category: category || undefined,
                                name: name || undefined,
                                card_type: cardType || undefined,
                            },
                        }
                    );
                    return decorateBatchResult(response.data, row);
                } catch (requestError) {
                    return decorateBatchResult({
                        success: false,
                        file_name: row.file_name,
                        reference,
                        revision,
                        side,
                        message:
                            requestError.code === 'ERR_NETWORK'
                                ? "Le backend n'est pas joignable pour le moment. Le shell reste utilisable, mais l'import réelle demande l'API."
                                : requestError.response?.data?.detail || requestError.message || "Erreur lors de l'import",
                        item_count: 0,
                        items: [],
                        stats: {},
                        warnings: [],
                        errors: [requestError.response?.data?.detail || requestError.message || "Erreur lors de l'import"],
                    }, row);
                } finally {
                    completedCount += 1;
                    setBatchProgress({ current: completedCount, total: importRows.length });
                }
            });

            // Pool de concurrence — max IMPORT_CONCURRENCY_LIMIT requêtes simultanées
            const importedResults = await runWithConcurrencyLimit(importTaskFactories, IMPORT_CONCURRENCY_LIMIT);

            const firstSuccessful = importedResults.find((entry) => entry.success);
            const activeResult = firstSuccessful || importedResults[0] || null;

            updateWorkspace((current) => ({
                ...current,
                batchResults: importedResults,
                result: activeResult,
                error: firstSuccessful ? null : "Aucune BOM du lot n'a pu être importée correctement.",
                componentResolutionPaused: false,
                footprintResolutionPaused: false,
                batchComponentResolutionPaused: false,
                batchFootprintResolutionPaused: false,
                pendingFootprintPrompt: true,
            }));

            if (activeResult?.success) {
                setImportedBom(activeResult);
            }
        } finally {
            setLoading(false);
            setBatchProgress({ current: 0, total: 0 });
        }
    };

    const handleDraftRowRemove = (rowKey) => {
        updateWorkspace((current) => {
            const nextDraftBatch = current.draftBatch.filter((row) => row.row_key !== rowKey);
            const nextFiles = nextDraftBatch.map((row) => row.file).filter(Boolean);

            if (nextFiles.length === 1) {
                const remainingFile = nextFiles[0];
                const inferredImport = extractImportMetadataFromFilename(remainingFile.name);

                return {
                    ...current,
                    files: nextFiles,
                    draftBatch: nextDraftBatch,
                    form: {
                        ...current.form,
                        reference: inferredImport.reference || current.form.reference,
                        side: inferredImport.side || current.form.side,
                    },
                    autoDetectedImport: inferredImport,
                };
            }

            return {
                ...current,
                files: nextFiles,
                draftBatch: nextDraftBatch,
                autoDetectedImport: nextFiles.length > 1 ? { reference: '', side: '' } : current.autoDetectedImport,
            };
        });
    };

    const handleClear = () => {
        resetImportWorkspace();
        clearCurrentBom();
        setItemUpdateState({ itemId: null, message: '', type: 'info' });
        setComponentResolutionName('');
        setComponentResolutionError('');
        setFootprintResolutionValue('');
        setFootprintResolutionError('');
    };

    const handleDeleteImportedBom = useCallback(async (batchItem) => {
        const rowKey = batchItem?.bom_revision_id || batchItem?.file_name;
        if (!rowKey) {
            return;
        }

        setRowActionState({ action: 'delete', key: rowKey });
        setItemUpdateState({ itemId: null, message: '', type: 'info' });

        try {
            if (batchItem.bom_revision_id) {
                await apiClient.delete(`/bom/files/${batchItem.bom_revision_id}`);
            }

            let nextSelectedResult = null;
            updateWorkspace((current) => {
                const nextBatchResults = current.batchResults.filter((entry) => (
                    (entry.bom_revision_id || entry.file_name) !== rowKey
                ));
                const currentResultKey = current.result?.bom_revision_id || current.result?.file_name;

                nextSelectedResult = currentResultKey === rowKey
                    ? (nextBatchResults.find((entry) => entry.success) || nextBatchResults[0] || null)
                    : current.result;

                return {
                    ...current,
                    batchResults: nextBatchResults,
                    result: nextSelectedResult,
                };
            });

            if (nextSelectedResult?.success) {
                setImportedBom(nextSelectedResult);
            } else if ((result?.bom_revision_id || result?.file_name) === rowKey) {
                clearCurrentBom();
            }
        } catch (requestError) {
            setWorkspaceError(
                requestError.response?.data?.detail || requestError.message || 'Erreur lors de la suppression de la BOM'
            );
        } finally {
            setRowActionState({ action: '', key: null });
        }
    }, [clearCurrentBom, result?.bom_revision_id, result?.file_name, setImportedBom, setWorkspaceError, updateWorkspace]);

    const handlePersistBatchMetadata = useCallback(async (batchItem) => {
        if (!batchItem?.success || !batchItem?.bom_revision_id) {
            return;
        }

        const targetKey = batchItem.bom_revision_id || batchItem.file_name;
        const reference = String(batchItem.reference || '').trim();
        const revision = String(batchItem.revision || '').trim();
        const category = String(batchItem.category || '').trim();
        const name = String(batchItem.name || '').trim();
        const cardType = String(batchItem.card_type || '').trim().toUpperCase();

        if (!reference || !revision) {
            setWorkspaceError('La référence et la révision doivent être renseignées avant sauvegarde.');
            return;
        }

        setRowActionState({ action: 'save-meta', key: targetKey });
        setItemUpdateState({ itemId: null, message: '', type: 'info' });

        try {
            const persistedEntry = await persistImportedBatchMetadata({
                batchItem: {
                    ...batchItem,
                    reference,
                    revision,
                    category,
                    name,
                    card_type: cardType,
                },
            });
            syncResultPayload(persistedEntry);
            setItemUpdateState({
                itemId: null,
                message: `Révision « ${reference} ${revision} » enregistrée en bibliothèque.`,
                type: 'success',
            });
        } catch (requestError) {
            setWorkspaceError(
                requestError.response?.data?.detail || requestError.message || 'Erreur lors de la mise à jour de la BOM'
            );
        } finally {
            setRowActionState({ action: '', key: null });
        }
    }, [setWorkspaceError, syncResultPayload]);

    const updatePreviewTargetsLocally = useCallback((targets, field, value) => {
        updateWorkspace((current) => applyPreviewFieldToWorkspace(current, targets, field, value));
    }, [updateWorkspace]);

    const persistPreviewField = useCallback(async ({ targets, field, value }) => {
        const normalizedTargets = (targets || []).filter((target) => target?.itemId && target?.bomRevisionId && target?.bomReferenceId);
        if (!normalizedTargets.length) {
            return;
        }

        const normalizedValue = typeof value === 'string' ? value : (value ?? '');
        const groupedTargets = normalizedTargets.reduce((accumulator, target) => {
            const key = `${target.bomReferenceId}:${target.bomRevisionId}`;
            if (!accumulator.has(key)) {
                accumulator.set(key, {
                    bomReferenceId: target.bomReferenceId,
                    bomRevisionId: target.bomRevisionId,
                    itemIds: [],
                });
            }

            accumulator.get(key).itemIds.push(target.itemId);
            return accumulator;
        }, new Map());

        setItemUpdateState({ itemId: normalizedTargets[0].itemId, message: '', type: 'info' });

        try {
            await Promise.all(
                Array.from(groupedTargets.values()).map((group) => apiClient.put(
                    `/bom/${group.bomReferenceId}/revisions/${group.bomRevisionId}/review`,
                    {
                        items: group.itemIds.map((itemId) => ({
                            id: itemId,
                            [field]: normalizedValue,
                        })),
                        create_mappings: field === 'footprint_pnp' && Boolean(String(normalizedValue).trim()),
                        mark_as_active: false,
                    }
                ))
            );

            await refreshBatchSessions(
                Array.from(groupedTargets.values()).map((group) => group.bomRevisionId),
                groupedTargets.has(`${result?.bom_reference_id}:${result?.bom_revision_id}`)
                    ? result?.bom_revision_id
                    : null,
            );
            setItemUpdateState({
                itemId: normalizedTargets[0].itemId,
                message: field === 'footprint_pnp'
                    ? 'Footprint PnP enregistré pour le groupe sélectionné'
                    : 'Nom / valeur harmonisée enregistré pour le groupe sélectionné',
                type: 'success',
            });
        } catch (requestError) {
            setWorkspaceError(
                requestError.response?.data?.detail
                || requestError.message
                || (field === 'footprint_pnp'
                    ? 'Erreur lors de la mise à jour du footprint'
                    : 'Erreur lors de la mise à jour du nom du composant')
            );
            setItemUpdateState({
                itemId: normalizedTargets[0].itemId,
                message: '',
                type: 'error',
            });
        }
    }, [refreshBatchSessions, result?.bom_reference_id, result?.bom_revision_id, setWorkspaceError]);

    const handleInlineFootprintSave = useCallback(async (item) => {
        await persistPreviewField({
            targets: [buildPreviewTarget(item)],
            field: 'footprint_pnp',
            value: item.footprint_pnp || '',
        });
    }, [persistPreviewField]);

    const handleInlineValueSave = useCallback(async (item) => {
        await persistPreviewField({
            targets: [buildPreviewTarget(item)],
            field: 'value_harmonized',
            value: item.value_harmonized || '',
        });
    }, [persistPreviewField]);

    const handleCompactGroupValueSave = useCallback(async (group, value) => {
        await persistPreviewField({
            targets: group.targets,
            field: 'value_harmonized',
            value,
        });
    }, [persistPreviewField]);

    const handleCompactGroupFootprintSave = useCallback(async (group, value) => {
        await persistPreviewField({
            targets: group.targets,
            field: 'footprint_pnp',
            value,
        });
    }, [persistPreviewField]);

    const applyResolutionResponse = (responseData) => {
        setComponentResolutionError('');
        setFootprintResolutionError('');
        updateWorkspace((current) => ({
            ...current,
            componentResolutionPaused: false,
            footprintResolutionPaused: false,
            batchComponentResolutionPaused: false,
            batchFootprintResolutionPaused: false,
            pendingFootprintPrompt: true,
        }));
        syncResultPayload(responseData);
    };

    const processBatchComponentGroup = async (group, componentName, action = 'register') => {
        const revisionGroups = group?.revisionGroups || [];
        if (!revisionGroups.length) {
            return [];
        }

        if (action === 'register') {
            const targetGroup = revisionGroups[0];
            await apiClient.post(
                `/bom/${targetGroup.bomReferenceId}/revisions/${targetGroup.bomRevisionId}/missing-components/resolve`,
                {
                    action,
                    item_ids: targetGroup.itemIds,
                    component_name: componentName,
                }
            );
        } else {
            await Promise.all(
                revisionGroups.map((revisionGroup) => apiClient.post(
                    `/bom/${revisionGroup.bomReferenceId}/revisions/${revisionGroup.bomRevisionId}/missing-components/resolve`,
                    {
                        action,
                        item_ids: revisionGroup.itemIds,
                        component_name: null,
                    }
                ))
            );
        }

        return revisionGroups.map((revisionGroup) => revisionGroup.bomRevisionId);
    };

    const processBatchFootprintGroup = async (group, footprintPnp) => {
        const revisionGroups = group?.revisionGroups || [];
        if (!revisionGroups.length) {
            return [];
        }

        const targetGroup = revisionGroups[0];
        await apiClient.post(
            `/bom/${targetGroup.bomReferenceId}/revisions/${targetGroup.bomRevisionId}/missing-footprints/resolve`,
            {
                item_ids: targetGroup.itemIds,
                footprint_pnp: footprintPnp,
            }
        );

        return revisionGroups.map((revisionGroup) => revisionGroup.bomRevisionId);
    };

    const handleResolveMissingComponents = async (action) => {
        const componentName = componentResolutionName.trim();
        if (action === 'register' && !componentName) {
            setComponentResolutionError('Veuillez renseigner un nom de composant.');
            return;
        }

        setComponentResolutionLoading(true);
        setComponentResolutionError('');

        try {
            if (isBatchResolutionMode) {
                if (!currentBatchMissingComponentGroup) {
                    return;
                }
                const revisionIds = await processBatchComponentGroup(
                    currentBatchMissingComponentGroup,
                    componentName,
                    action,
                );

                await refreshBatchSessions(
                    revisionIds,
                    currentBatchMissingComponentGroup.revisionGroups.some((revisionGroup) => revisionGroup.bomRevisionId === result?.bom_revision_id)
                        ? result?.bom_revision_id
                        : null,
                );
                setComponentResolutionError('');
                return;
            }

            if (!result?.bom_reference_id || !result?.bom_revision_id || !currentMissingComponentGroup) {
                return;
            }

            const response = await apiClient.post(
                `/bom/${result.bom_reference_id}/revisions/${result.bom_revision_id}/missing-components/resolve`,
                {
                    action,
                    item_ids: currentMissingComponentGroup.itemIds,
                    component_name: action === 'register' ? componentName : null,
                }
            );

            applyResolutionResponse(response.data);
        } catch (requestError) {
            setComponentResolutionError(
                requestError.response?.data?.detail || requestError.message || 'Erreur lors de la résolution du composant'
            );
        } finally {
            setComponentResolutionLoading(false);
        }
    };

    const handleResolveMissingFootprints = async () => {
        const footprintPnp = footprintResolutionValue.trim();
        if (!footprintPnp) {
            setFootprintResolutionError('Veuillez renseigner une empreinte PnP.');
            return;
        }

        setFootprintResolutionLoading(true);
        setFootprintResolutionError('');

        try {
            if (isBatchResolutionMode) {
                if (!currentBatchMissingFootprintGroup) {
                    return;
                }
                const revisionIds = await processBatchFootprintGroup(
                    currentBatchMissingFootprintGroup,
                    footprintPnp,
                );

                await refreshBatchSessions(
                    revisionIds,
                    currentBatchMissingFootprintGroup.revisionGroups.some(
                        (revisionGroup) => revisionGroup.bomRevisionId === result?.bom_revision_id
                    )
                        ? result?.bom_revision_id
                        : null,
                );
                setFootprintResolutionError('');
                return;
            }

            if (!result?.bom_reference_id || !result?.bom_revision_id || !currentMissingFootprintGroup) {
                return;
            }

            const response = await apiClient.post(
                `/bom/${result.bom_reference_id}/revisions/${result.bom_revision_id}/missing-footprints/resolve`,
                {
                    item_ids: currentMissingFootprintGroup.itemIds,
                    footprint_pnp: footprintPnp,
                }
            );

            applyResolutionResponse(response.data);
        } catch (requestError) {
            setFootprintResolutionError(
                requestError.response?.data?.detail || requestError.message || 'Erreur lors de la sauvegarde du footprint PnP'
            );
        } finally {
            setFootprintResolutionLoading(false);
        }
    };

    const handleResolveBatchMissingComponents = async () => {
        const groupsToSave = batchMissingComponentGroups
            .map((group) => ({
                group,
                componentName: String(componentBatchDrafts[group.key] || '').trim(),
            }))
            .filter((entry) => entry.componentName);

        if (!groupsToSave.length) {
            setComponentResolutionError('Renseigne au moins une ligne pour enregistrer la liste des composants.');
            return;
        }

        setComponentResolutionLoading(true);
        setComponentResolutionError('');

        try {
            const affectedRevisionIds = [];
            for (const entry of groupsToSave) {
                const revisionIds = await processBatchComponentGroup(entry.group, entry.componentName, 'register');
                affectedRevisionIds.push(...revisionIds);
            }

            await refreshBatchSessions(
                affectedRevisionIds,
                affectedRevisionIds.includes(result?.bom_revision_id) ? result?.bom_revision_id : null,
            );
            setItemUpdateState({
                itemId: null,
                message: `${groupsToSave.length} type(s) de composant enregistré(s) pour le lot.`,
                type: 'success',
            });
        } catch (requestError) {
            setComponentResolutionError(
                requestError.response?.data?.detail || requestError.message || 'Erreur lors de la sauvegarde de la liste des composants'
            );
        } finally {
            setComponentResolutionLoading(false);
        }
    };

    const handleDeleteBatchMissingComponentGroup = async (group) => {
        if (!group) {
            return;
        }

        setComponentResolutionLoading(true);
        setComponentResolutionError('');

        try {
            const affectedRevisionIds = await processBatchComponentGroup(group, null, 'delete');
            await refreshBatchSessions(
                affectedRevisionIds,
                affectedRevisionIds.includes(result?.bom_revision_id) ? result?.bom_revision_id : null,
            );
            setItemUpdateState({
                itemId: null,
                message: `${group.componentValue} supprimé de toutes les BOM concernées.`,
                type: 'success',
            });
        } catch (requestError) {
            setComponentResolutionError(
                requestError.response?.data?.detail || requestError.message || 'Erreur lors de la suppression du composant du lot'
            );
        } finally {
            setComponentResolutionLoading(false);
        }
    };

    const handleResolveBatchMissingFootprints = async () => {
        const groupsToSave = batchMissingFootprintGroups
            .map((group) => ({
                group,
                footprintPnp: String(footprintBatchDrafts[group.key] || '').trim(),
            }))
            .filter((entry) => entry.footprintPnp);

        if (!groupsToSave.length) {
            setFootprintResolutionError('Renseigne au moins une ligne pour enregistrer la liste des footprints.');
            return;
        }

        setFootprintResolutionLoading(true);
        setFootprintResolutionError('');

        try {
            const affectedRevisionIds = [];
            for (const entry of groupsToSave) {
                const revisionIds = await processBatchFootprintGroup(entry.group, entry.footprintPnp);
                affectedRevisionIds.push(...revisionIds);
            }

            await refreshBatchSessions(
                affectedRevisionIds,
                affectedRevisionIds.includes(result?.bom_revision_id) ? result?.bom_revision_id : null,
            );
            setItemUpdateState({
                itemId: null,
                message: `${groupsToSave.length} mapping(s) footprint enregistré(s) pour le lot.`,
                type: 'success',
            });
        } catch (requestError) {
            setFootprintResolutionError(
                requestError.response?.data?.detail || requestError.message || 'Erreur lors de la sauvegarde de la liste des footprints'
            );
        } finally {
            setFootprintResolutionLoading(false);
        }
    };

    const handleOpenVisualization = async () => {
        if (!currentBom && !result) {
            return;
        }

        setReviewNavigationLoading(true);
        try {
            const { settledResults, activeRevisionMeta } = await persistImportWorkspaceBeforeReview({
                importWorkspace,
                currentBom,
                setImportedBom,
            });
            // T-003 : charger TOUTES les faces persistées du lot dans la session de
            // revue (une carte recto/verso doit garder ses 2 faces TOP+BOT et les lier
            // à la production), pas seulement la BOM active. Sans ça, la session de
            // revue retombe sur la seule `currentBom` et la 2e face est perdue.
            const reviewEntries = buildReviewSelectionFromSettled({
                settledResults,
                activeRevisionId: activeRevisionMeta?.bom_revision_id
                    || currentBom?.bomRevisionId
                    || result?.bom_revision_id
                    || null,
            });
            if (reviewEntries.length > 0) {
                setSelectedBomEntries(reviewEntries);
            }
            navigate('/bom');
        } catch (requestError) {
            setWorkspaceError(
                requestError.response?.data?.detail || requestError.message || 'Erreur lors de la sauvegarde avant revue'
            );
        } finally {
            setReviewNavigationLoading(false);
        }
    };

    const stats = useMemo(() => result?.stats || {}, [result?.stats]);
    const sessionRows = useMemo(() => buildSessionRows(draftBatch, batchResults), [draftBatch, batchResults]);
    const effectivePreviewScope = previewScope === 'batch' && successfulBatchResults.length > 1
        ? 'batch'
        : 'selected';
    const previewSourceItems = useMemo(
        () => buildImportPreviewItems({
            result,
            batchResults,
            scope: effectivePreviewScope,
        }),
        [batchResults, effectivePreviewScope, result]
    );
    const compactPreviewGroups = useMemo(
        () => buildCompactImportPreviewGroups(previewSourceItems),
        [previewSourceItems]
    );
    const normalizedPreviewSearch = previewSearch.trim().toLowerCase();
    const previewFilterState = useMemo(() => ({
        normalizedSearch: normalizedPreviewSearch,
        statusFilter: previewStatusFilter,
    }), [normalizedPreviewSearch, previewStatusFilter]);
    const filteredRawPreviewItems = useMemo(
        () => previewSourceItems.filter((entry) => matchesPreviewFilters(entry, previewFilterState)),
        [previewFilterState, previewSourceItems]
    );
    const filteredCompactPreviewGroups = useMemo(
        () => compactPreviewGroups.filter((entry) => matchesPreviewFilters(entry, previewFilterState)),
        [compactPreviewGroups, previewFilterState]
    );
    const previewRows = previewMode === 'compact' ? filteredCompactPreviewGroups : filteredRawPreviewItems;
    const paginatedSessionRows = useMemo(() => {
        const start = sessionPage * sessionRowsPerPage;
        return sessionRows.slice(start, start + sessionRowsPerPage);
    }, [sessionRows, sessionPage, sessionRowsPerPage]);
    const paginatedItems = useMemo(() => {
        const start = previewPage * previewRowsPerPage;
        return previewRows.slice(start, start + previewRowsPerPage);
    }, [previewPage, previewRows, previewRowsPerPage]);

    useEffect(() => {
        const maxPage = Math.max(0, Math.ceil(sessionRows.length / sessionRowsPerPage) - 1);
        if (sessionPage > maxPage) {
            setSessionPage(maxPage);
        }
    }, [sessionPage, sessionRows.length, sessionRowsPerPage]);

    useEffect(() => {
        const maxPage = Math.max(0, Math.ceil(previewRows.length / previewRowsPerPage) - 1);
        if (previewPage > maxPage) {
            setPreviewPage(maxPage);
        }
    }, [previewPage, previewRows.length, previewRowsPerPage]);

    useEffect(() => {
        setPreviewPage(0);
    }, [effectivePreviewScope, previewMode, previewSearch, previewStatusFilter, result?.bom_revision_id, result?.file_name]);

    useEffect(() => {
        setPreviewFootprintDrafts({});
    }, [effectivePreviewScope, previewMode, result?.bom_revision_id, result?.file_name]);

    useEffect(() => {
        if (successfulBatchResults.length <= 1 && previewScope === 'batch') {
            setPreviewScope('selected');
        }
    }, [previewScope, successfulBatchResults.length]);

    const showBatchProgress = loading && batchProgress.total > 1;
    const batchProgressPercent = showBatchProgress
        ? Math.round((batchProgress.current / batchProgress.total) * 100)
        : 0;

    return (
        <Box sx={{ width: '100%' }}>
            {showBatchProgress && (
                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ color: '#a1a1aa', mb: 0.5 }}>
                        Importation {batchProgress.current}/{batchProgress.total} fichiers…
                    </Typography>
                    <LinearProgress
                        variant="determinate"
                        value={batchProgressPercent}
                        sx={{ borderRadius: 1, height: 6 }}
                    />
                </Box>
            )}
            <BomImportWorkspaceCard
                dragActive={dragActive}
                handleDrag={handleDrag}
                handleDrop={handleDrop}
                handleFileChange={handleFileChange}
                uploadSummaryLabel={effectiveUploadSummaryLabel}
                uploadSummaryMeta={effectiveUploadSummaryMeta}
                hasFiles={hasFiles}
                isBatchMode={isBatchMode}
                sessionRows={sessionRows}
                paginatedSessionRows={paginatedSessionRows}
                sessionPage={sessionPage}
                sessionRowsPerPage={sessionRowsPerPage}
                setSessionPage={setSessionPage}
                setSessionRowsPerPage={setSessionRowsPerPage}
                result={result}
                rowActionState={rowActionState}
                handleBatchResultFieldChange={handleBatchResultFieldChange}
                handleDraftFieldChange={handleDraftFieldChange}
                selectBatchResult={selectBatchResult}
                handlePersistBatchMetadata={handlePersistBatchMetadata}
                handleDeleteImportedBom={handleDeleteImportedBom}
                handleDraftRowRemove={handleDraftRowRemove}
                hasWorkspaceContent={Boolean(file || result || batchResults.length > 0)}
                handleClear={handleClear}
                handleUpload={handleUpload}
                loading={loading}
                showVisualizationAction={showVisualizationAction}
                handleOpenVisualization={handleOpenVisualization}
                reviewNavigationLoading={reviewNavigationLoading}
            />

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setWorkspaceError(null)}>
                    {error}
                </Alert>
            )}

            {result && (
                <Box>
                    <Alert severity={result.success ? 'success' : 'error'} sx={{ mb: 2 }}>
                        {result.message}
                    </Alert>

                    {isBatchResolutionMode && batchMissingComponentGroups.length > 0 && (
                        <Alert
                            severity={batchComponentResolutionPaused ? 'warning' : 'info'}
                            sx={{ mb: 2 }}
                            action={(
                                <Button color="inherit" size="small" onClick={resumeBatchResolution}>
                                    Traiter le lot
                                </Button>
                            )}
                        >
                            {batchMissingComponentGroups.length} type(s) de composant absent(s) sur l'ensemble du lot importé.
                        </Alert>
                    )}

                    {isBatchResolutionMode && batchMissingComponentGroups.length === 0 && batchMissingFootprintGroups.length > 0 && (
                        <Alert
                            severity={batchFootprintResolutionPaused ? 'warning' : 'info'}
                            sx={{ mb: 2 }}
                            action={(
                                <Button color="inherit" size="small" onClick={resumeBatchResolution}>
                                    Traiter le lot
                                </Button>
                            )}
                        >
                            {batchMissingFootprintGroups.length} empreinte(s) Eagle sans footprint PnP sur l'ensemble du lot importé.
                        </Alert>
                    )}

                    <BomImportOverviewPanel
                        missingComponentGroups={missingComponentGroups}
                        missingFootprintGroups={missingFootprintGroups}
                        itemUpdateState={itemUpdateState}
                        result={result}
                        stats={stats}
                        updateWorkspace={updateWorkspace}
                        warnings={result.warnings || []}
                        errors={result.errors || []}
                    />
                    <BomImportResolutionDialogs
                        result={result}
                        isBatchResolutionMode={isBatchResolutionMode}
                        currentMissingComponentGroup={currentMissingComponentGroup}
                        componentResolutionPaused={componentResolutionPaused}
                        componentResolutionLoading={componentResolutionLoading}
                        updateWorkspace={updateWorkspace}
                        componentResolutionName={componentResolutionName}
                        setComponentResolutionName={setComponentResolutionName}
                        componentResolutionError={componentResolutionError}
                        handleResolveMissingComponents={handleResolveMissingComponents}
                        missingComponentGroups={missingComponentGroups}
                        currentMissingFootprintGroup={currentMissingFootprintGroup}
                        footprintResolutionPaused={footprintResolutionPaused}
                        footprintResolutionLoading={footprintResolutionLoading}
                        footprintResolutionValue={footprintResolutionValue}
                        setFootprintResolutionValue={setFootprintResolutionValue}
                        footprintResolutionError={footprintResolutionError}
                        handleResolveMissingFootprints={handleResolveMissingFootprints}
                        batchComponentResolutionPaused={batchComponentResolutionPaused}
                        batchMissingComponentGroups={batchMissingComponentGroups}
                        pauseBatchResolution={pauseBatchResolution}
                        componentBatchDrafts={componentBatchDrafts}
                        setComponentBatchDrafts={setComponentBatchDrafts}
                        handleDeleteBatchMissingComponentGroup={handleDeleteBatchMissingComponentGroup}
                        handleResolveBatchMissingComponents={handleResolveBatchMissingComponents}
                        currentBatchMissingComponentGroup={currentBatchMissingComponentGroup}
                        batchFootprintResolutionPaused={batchFootprintResolutionPaused}
                        currentBatchMissingFootprintGroup={currentBatchMissingFootprintGroup}
                        batchMissingFootprintGroups={batchMissingFootprintGroups}
                        footprintBatchDrafts={footprintBatchDrafts}
                        setFootprintBatchDrafts={setFootprintBatchDrafts}
                        handleResolveBatchMissingFootprints={handleResolveBatchMissingFootprints}
                    />
                    <BomImportPreviewCard
                        effectivePreviewScope={effectivePreviewScope}
                        previewMode={previewMode}
                        setPreviewMode={setPreviewMode}
                        setPreviewScope={setPreviewScope}
                        previewStatusFilter={previewStatusFilter}
                        setPreviewStatusFilter={setPreviewStatusFilter}
                        previewSearch={previewSearch}
                        setPreviewSearch={setPreviewSearch}
                        previewRows={previewRows}
                        paginatedItems={paginatedItems}
                        previewPage={previewPage}
                        setPreviewPage={setPreviewPage}
                        previewRowsPerPage={previewRowsPerPage}
                        setPreviewRowsPerPage={setPreviewRowsPerPage}
                        successfulBatchCount={successfulBatchResults.length}
                        result={result}
                        previewFootprintDrafts={previewFootprintDrafts}
                        setPreviewFootprintDrafts={setPreviewFootprintDrafts}
                        updatePreviewTargetsLocally={updatePreviewTargetsLocally}
                        handleInlineFootprintSave={handleInlineFootprintSave}
                        handleInlineValueSave={handleInlineValueSave}
                        handleCompactGroupValueSave={handleCompactGroupValueSave}
                        handleCompactGroupFootprintSave={handleCompactGroupFootprintSave}
                    />
                </Box>
            )}
        </Box>
    );
}

export default BomImport;
