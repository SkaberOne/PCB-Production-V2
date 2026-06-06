import React from 'react';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Grid,
    Stack,
    Tab,
    Tabs,
} from '@mui/material';
import apiClient from '../api/client';
import { useNavigate, useSearchParams } from 'react-router-dom';

// ── Sub-components ────────────────────────────────────────────────────────────
import BomQuantityPanel from '../components/bom/BomQuantityPanel';
import BomSelectionPanel from '../components/bom/BomSelectionPanel';
import BomReviewTab from '../components/bom/BomReviewTab';
import BomStockDialog from '../components/bom/BomStockDialog';
import BomStockTab from '../components/bom/BomStockTab';
import ConfirmDialog from '../components/common/ConfirmDialog';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';

// ── Context + utils ───────────────────────────────────────────────────────────
import { useBomSession } from '../context/BomSessionContext';
import { normalizeBomWorkspaceEntry } from '../utils/bomWorkspace';
import {
    buildAggregatedComponentPreview,
    buildReviewPayload,
    getQuantityRows,
    getSelectedEntries,
} from '../utils/bomReviewView';
import {
    areSelectedCommandEntriesLoaded,
    countLoadedCommandEntries,
} from '../utils/commandPlanning';

// ─── Static style constants (#17) ─────────────────────────────────────────────
const PANEL_CARD_SX = {
    backgroundColor: '#18181b',
    border: '1px solid #27272a',
};

const TAB_SX = {
    '& .MuiTab-root': {
        color: '#a1a1aa',
        textTransform: 'none',
        fontWeight: 600,
    },
    '& .Mui-selected': {
        color: '#f4f4f5',
    },
};

// ─── Helper: download file (#11 CSV export) ────────────────────────────────────
// ─── BomViewerPage ─────────────────────────────────────────────────────────────
function BomViewerPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const {
        currentBom,
        bomWorkspace,
        activeProduction,
        setImportedBom,
        setActiveProduction,
        clearCurrentBom,
        setSelectedBomEntries,
        setActiveBomRevision,
        cacheBomRevision,
        updateBomWorkspaceItem,
        updateBomWorkspaceItems,
        updateBomWorkspaceQuantity,
        updateBomWorkspaceStockDraft,
        setBomWorkspaceActiveTab,
        setBomWorkspaceStockValidated,
        removeBomWorkspaceRevision,
    } = useBomSession();

    // selectedBomEntries est stocké dans bomWorkspace, pas directement dans le context
    const selectedBomEntries = bomWorkspace.selectedRevisionEntries ?? [];

    const [saveState, setSaveState] = React.useState({ loading: false, type: 'info', message: '' });
    const [loadingRevisionId, setLoadingRevisionId] = React.useState(null);
    const [selectionFeedback, setSelectionFeedback] = React.useState({ type: 'info', message: '' });
    const [stockDialogKey, setStockDialogKey] = React.useState(null);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
    const [undoStack, setUndoStack] = React.useState([]); // (#22)
    const reviewCardRef = React.useRef(null); // (#14)

    // ── Derived state ─────────────────────────────────────────────────────────
    const selectedEntries = React.useMemo(
        () => getSelectedEntries(selectedBomEntries, currentBom),
        [selectedBomEntries, currentBom],
    );
    const activeTab = bomWorkspace.activeTab || 'review';
    const activeRevisionId = bomWorkspace.activeRevisionId
        || selectedEntries[0]?.bom_revision_id
        || currentBom?.bomRevisionId
        || null;

    React.useEffect(() => {
        if (!selectedBomEntries.length && currentBom?.bomRevisionId) {
            setSelectedBomEntries([normalizeBomWorkspaceEntry(currentBom)]);
        }
    }, [currentBom, selectedBomEntries.length, setSelectedBomEntries]);

    React.useEffect(() => {
        if (currentBom?.bomRevisionId) {
            cacheBomRevision(currentBom);
        }
    }, [currentBom, cacheBomRevision]);

    const pruneMissingRevision = React.useCallback((entry) => {
        if (!entry?.bom_revision_id) return;
        removeBomWorkspaceRevision(entry.bom_revision_id);
        if (currentBom?.bomRevisionId === entry.bom_revision_id) clearCurrentBom();
    }, [clearCurrentBom, currentBom?.bomRevisionId, removeBomWorkspaceRevision]);

    const loadRevisionSession = React.useCallback(async (entry, shouldActivate = false) => {
        if (!entry?.bom_revision_id) return null;
        setLoadingRevisionId(entry.bom_revision_id);
        try {
            const response = await apiClient.get(`/bom/files/${entry.bom_revision_id}/session`);
            const payload = { ...response.data, file_name: entry.file_name };
            cacheBomRevision(payload);
            if (shouldActivate) {
                setImportedBom(payload);
                setActiveBomRevision(entry.bom_revision_id);
            }
            return payload;
        } catch (requestError) {
            if (requestError.response?.status === 404) pruneMissingRevision(entry);
            throw requestError;
        } finally {
            setLoadingRevisionId(null);
        }
    }, [cacheBomRevision, pruneMissingRevision, setActiveBomRevision, setImportedBom]);

    // ── Parallel prefetch (#5) ────────────────────────────────────────────────
    React.useEffect(() => {
        if (!selectedEntries.length) return;
        let cancelled = false;

        const prefetch = async () => {
            const toFetch = selectedEntries.filter(
                (entry) => !bomWorkspace.revisionsById[entry.bom_revision_id],
            );
            const results = await Promise.allSettled(
                toFetch.map((entry) => loadRevisionSession(entry, false)),
            );
            if (cancelled) return;
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    const entry = toFetch[index];
                    const requestError = result.reason;
                    setSelectionFeedback({
                        type: 'warning',
                        message: requestError.response?.status === 404
                            ? `${entry.reference || 'Cette BOM'} ${entry.revision || ''} ${entry.side || ''}`.trim()
                                + " a été retirée de la session car elle n'existe plus dans les fichiers."
                            : `Impossible de précharger ${entry.reference || 'BOM'} ${entry.revision || ''} ${entry.side || ''}`.trim(),
                    });
                }
            });
        };

        prefetch();
        return () => { cancelled = true; };
    }, [selectedEntries, bomWorkspace.revisionsById, loadRevisionSession]);

    // ── Ouverture d'une révision via le paramètre d'URL ?revision= ────────────
    // (déclenché par le bouton « Ouvrir » de la bibliothèque BOM enregistrées)
    const processedRevisionRef = React.useRef(null);
    React.useEffect(() => {
        const revId = Number(searchParams.get('revision'));
        if (!revId || processedRevisionRef.current === revId) return;
        processedRevisionRef.current = revId;

        const alreadySelected = selectedBomEntries.some(
            (entry) => entry.bom_revision_id === revId,
        );
        if (alreadySelected) {
            setActiveBomRevision(revId);
        } else {
            loadRevisionSession({ bom_revision_id: revId }, true).catch((requestError) => {
                setSelectionFeedback({
                    type: 'error',
                    message: requestError.response?.status === 404
                        ? `La révision ${revId} n'existe plus dans les fichiers.`
                        : `Impossible de charger la révision ${revId}.`,
                });
            });
        }

        // Nettoie le paramètre pour éviter un rechargement sur refresh/navigation.
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('revision');
        setSearchParams(nextParams, { replace: true });
    }, [searchParams, selectedBomEntries, loadRevisionSession, setActiveBomRevision, setSearchParams]);

    // ── Active BOM + computed values ──────────────────────────────────────────
    const activeBom = bomWorkspace.revisionsById[activeRevisionId]
        || (currentBom?.bomRevisionId === activeRevisionId ? currentBom : null);

    // O(1) item lookup — avoids linear scan on every field change
    const activeBomItemsById = React.useMemo(() => {
        const map = {};
        (activeBom?.items || []).forEach((item) => { map[item.id] = item; });
        return map;
    }, [activeBom?.items]);

    const quantityRows = React.useMemo(
        () => getQuantityRows(selectedEntries, bomWorkspace.quantitiesByReference),
        [selectedEntries, bomWorkspace.quantitiesByReference],
    );
    const stockValidation = bomWorkspace.stockValidation || { isValidated: false, validatedAt: null };
    const loadedEntryCount = React.useMemo(
        () => countLoadedCommandEntries(selectedEntries, bomWorkspace.revisionsById, currentBom),
        [selectedEntries, bomWorkspace.revisionsById, currentBom],
    );
    const isStockReviewReady = React.useMemo(
        () => areSelectedCommandEntriesLoaded(selectedEntries, bomWorkspace.revisionsById, currentBom),
        [selectedEntries, bomWorkspace.revisionsById, currentBom],
    );
    const aggregatedPreview = React.useMemo(
        () => buildAggregatedComponentPreview(
            bomWorkspace.revisionsById,
            bomWorkspace.quantitiesByReference,
            bomWorkspace.stockDraftByComponentKey,
        ),
        [bomWorkspace.revisionsById, bomWorkspace.quantitiesByReference, bomWorkspace.stockDraftByComponentKey],
    );
    const canValidateStock = Boolean(aggregatedPreview.length) && isStockReviewReady;
    const activeStockLine = React.useMemo(
        () => aggregatedPreview.find((line) => line.key === stockDialogKey) || null,
        [aggregatedPreview, stockDialogKey],
    );

    // ── Undo stack (#22) ──────────────────────────────────────────────────────
    const pushUndo = React.useCallback((operation) => {
        setUndoStack((prev) => [...prev.slice(-49), operation]);
    }, []);

    const applyUndo = React.useCallback(() => {
        setUndoStack((prev) => {
            if (!prev.length) return prev;
            const last = prev[prev.length - 1];
            updateBomWorkspaceItem(last.revisionId, last.itemId, { [last.field]: last.previousValue });
            return prev.slice(0, -1);
        });
    }, [updateBomWorkspaceItem]);

    // ── Quantity handlers ─────────────────────────────────────────────────────
    const buildProductionQuantityItems = React.useCallback((rows, productionDetail = activeProduction) => {
        const sourceRows = Array.isArray(rows) ? rows : [rows];
        const productionBomRevisions = Array.isArray(productionDetail?.bomRevisions)
            ? productionDetail.bomRevisions
            : (Array.isArray(productionDetail?.bom_revisions) ? productionDetail.bom_revisions : []);
        const productionRevisionIds = new Set(
            productionBomRevisions
                .map((entry) => Number(entry?.bom_revision_id || 0))
                .filter((id) => id > 0),
        );
        return sourceRows.flatMap((row) => {
            const parsedQty = Number(row?.quantityToProduce || 1);
            const qty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
            return (Array.isArray(row?.bomRevisionIds) ? row.bomRevisionIds : [])
                .map((id) => Number(id || 0))
                .filter((id) => productionRevisionIds.has(id))
                .map((id) => ({ bom_revision_id: id, quantity_to_produce: qty }));
        });
    }, [activeProduction]);

    const persistProductionBomQuantities = React.useCallback(async (rows, productionDetail = activeProduction) => {
        if (!productionDetail?.id) return productionDetail;
        const items = buildProductionQuantityItems(rows, productionDetail);
        if (!items.length) return productionDetail;
        const response = await apiClient.patch(
            `/marketplace/productions/${productionDetail.id}/bom-quantities`,
            { items },
        );
        setActiveProduction(response.data);
        return response.data;
    }, [activeProduction, buildProductionQuantityItems, setActiveProduction]);

    const handleQuantityChange = React.useCallback((row) => (event) => {
        const parsed = Number(event.target.value || 1);
        const qty = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        updateBomWorkspaceQuantity({ reference: row.reference, revision: row.revision, quantityToProduce: qty });
    }, [updateBomWorkspaceQuantity]);

    const handleQuantityBlur = React.useCallback((row) => async (event) => {
        const parsed = Number(event.target.value || 1);
        const qty = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        if (!activeProduction?.id) return;
        try {
            await persistProductionBomQuantities({ ...row, quantityToProduce: qty }, activeProduction);
        } catch (requestError) {
            setSelectionFeedback({
                type: 'error',
                message: requestError.response?.data?.detail || requestError.message
                    || 'Impossible de synchroniser cette quantité avec la production active',
            });
        }
    }, [activeProduction, persistProductionBomQuantities]);

    // ── BOM item handlers (with undo push) ────────────────────────────────────
    const handleValueChange = React.useCallback((itemId, nextValue) => {
        if (!activeRevisionId) return;
        const currentItem = activeBomItemsById[itemId];
        if (currentItem) pushUndo({ revisionId: activeRevisionId, itemId, field: 'value_harmonized', previousValue: currentItem.value_harmonized });
        updateBomWorkspaceItem(activeRevisionId, itemId, { value_harmonized: nextValue });
    }, [activeRevisionId, activeBomItemsById, updateBomWorkspaceItem, pushUndo]);

    const handleDnpChange = React.useCallback((itemId, checked) => {
        if (!activeRevisionId) return;
        const currentItem = activeBomItemsById[itemId];
        if (currentItem) pushUndo({ revisionId: activeRevisionId, itemId, field: 'dnp', previousValue: currentItem.dnp });
        updateBomWorkspaceItem(activeRevisionId, itemId, { dnp: checked });
    }, [activeRevisionId, activeBomItemsById, updateBomWorkspaceItem, pushUndo]);

    const handleComponentTypeChange = React.useCallback((itemId, nextType) => {
        if (!activeRevisionId) return;
        const currentItem = activeBomItemsById[itemId];
        if (currentItem) pushUndo({ revisionId: activeRevisionId, itemId, field: 'component_type', previousValue: currentItem.component_type });
        updateBomWorkspaceItem(activeRevisionId, itemId, {
            component_type: nextType,
            component_type_confirmed: true,
            component_type_requires_confirmation: false,
        });
    }, [activeRevisionId, activeBomItemsById, updateBomWorkspaceItem, pushUndo]);

    const handleFootprintChange = React.useCallback((item, nextFootprint) => {
        if (!activeRevisionId || !activeBom?.items?.length) return;
        const normalizedFp = String(item.footprint_eagle || '').trim().toUpperCase();
        const matchingIds = activeBom.items
            .filter((c) => normalizedFp
                ? String(c.footprint_eagle || '').trim().toUpperCase() === normalizedFp
                : c.id === item.id)
            .map((c) => c.id);
        updateBomWorkspaceItems(activeRevisionId, matchingIds, { footprint_pnp: nextFootprint });
    }, [activeBom?.items, activeRevisionId, updateBomWorkspaceItems]);

    // #8 — Notes column handler
    const handleNotesChange = React.useCallback((itemId, nextNotes) => {
        if (!activeRevisionId) return;
        updateBomWorkspaceItem(activeRevisionId, itemId, { notes: nextNotes });
    }, [activeRevisionId, updateBomWorkspaceItem]);

    // #20 — Bulk type assign
    const handleBulkTypeChange = React.useCallback((itemIds, nextType) => {
        if (!activeRevisionId || !itemIds?.length) return;
        updateBomWorkspaceItems(activeRevisionId, itemIds, {
            component_type: nextType,
            component_type_confirmed: true,
            component_type_requires_confirmation: false,
        });
    }, [activeRevisionId, updateBomWorkspaceItems]);

    // ── Persist revision ──────────────────────────────────────────────────────
    const persistRevision = React.useCallback(async (entry, options = {}) => {
        if (!entry?.bom_revision_id) return null;
        const markAsActive = options.markAsActive !== false;
        let revision = bomWorkspace.revisionsById[entry.bom_revision_id];
        if (!revision) revision = await loadRevisionSession(entry, false);
        if (!revision?.bomReferenceId || !revision?.bomRevisionId) {
            throw new Error('Revision BOM introuvable pour la sauvegarde');
        }
        const response = await apiClient.put(
            `/bom/${revision.bomReferenceId}/revisions/${revision.bomRevisionId}/review`,
            buildReviewPayload(revision, { markAsActive }),
        );
        const persistedItems = markAsActive
            ? (response.data?.items || [])
            : (response.data?.items || []).map((item) => ({
                ...item,
                component_type_confirmed: Boolean(item.component_type),
                component_type_requires_confirmation: false,
            }));
        const persistedPayload = {
            ...response.data,
            items: persistedItems,
            reference: entry.reference || revision.reference || '',
            revision: entry.revision || revision.revision || '',
            side: entry.side || revision.side || 'TOP',
            status: response.data?.revision_status || revision.status || 'ACTIVE',
            file_name: entry.file_name || revision.fileName || '',
        };
        cacheBomRevision(persistedPayload);
        if (activeRevisionId === entry.bom_revision_id) setImportedBom(persistedPayload);
        return persistedPayload;
    }, [activeRevisionId, bomWorkspace.revisionsById, cacheBomRevision, loadRevisionSession, setImportedBom]);

    // ── Save all (parallel with progress counter) (#4, #12) ──────────────────
    const handleSaveAll = async (mode = 'draft') => {
        if (!selectedEntries.length) return;
        const markAsActive = mode === 'validate';

        if (markAsActive) {
            const unresolved = selectedEntries.reduce((acc, entry) => {
                const rev = bomWorkspace.revisionsById[entry.bom_revision_id];
                const count = (rev?.items || []).filter(
                    (item) => item.component_type_requires_confirmation && !item.component_type_confirmed,
                ).length;
                if (count > 0) acc.push(`${entry.reference || 'BOM'} ${entry.revision || ''} ${entry.side || ''}`.trim());
                return acc;
            }, []);
            if (unresolved.length) {
                setSaveState({
                    loading: false, type: 'error',
                    message: `Validation bloquée : confirme les types ambigus dans ${unresolved.join(', ')} ou passe d'abord par "Sauvegarder brouillon".`,
                });
                return;
            }
        }

        setSaveState({ loading: true, type: 'info', message: `0 / ${selectedEntries.length} BOM sauvegardées…` });

        try {
            let savedCount = 0;
            const CHUNK = 3; // concurrency limit
            for (let i = 0; i < selectedEntries.length; i += CHUNK) {
                const chunk = selectedEntries.slice(i, i + CHUNK);
                await Promise.all(chunk.map((entry) => persistRevision(entry, { markAsActive })));
                savedCount += chunk.length;
                setSaveState({
                    loading: true, type: 'info',
                    message: `${savedCount} / ${selectedEntries.length} BOM sauvegardées…`,
                });
            }

            if (activeProduction?.id) {
                const attachResponse = await apiClient.post(
                    `/marketplace/productions/${activeProduction.id}/bom-revisions`,
                    {
                        bom_revision_ids: Array.from(new Set(
                            selectedEntries.map((e) => e.bom_revision_id).filter(Boolean),
                        )),
                    },
                );
                const synced = await persistProductionBomQuantities(quantityRows, attachResponse.data);
                setActiveProduction(synced);
            }

            setUndoStack([]); // Clear undo stack after successful save
            setSaveState({
                loading: false,
                type: 'success',
                message: activeProduction?.id
                    ? `${savedCount} BOM ${markAsActive ? 'validée(s)' : 'sauvegardée(s) en brouillon'} et reliée(s) à la production active.`
                    : `${savedCount} BOM ${markAsActive ? 'validée(s)' : 'sauvegardée(s) en brouillon'} avec succès.`,
            });
        } catch (requestError) {
            setSaveState({
                loading: false, type: 'error',
                message: requestError.response?.data?.detail || requestError.message
                    || `Erreur lors de la ${markAsActive ? 'validation' : 'sauvegarde'} multi-BOM`,
            });
        }
    };

    // ── Activate entry (#14 scroll to review card) ────────────────────────────
    const handleActivateEntry = async (entry) => {
        if (!entry?.bom_revision_id) return;
        setSelectionFeedback({ type: 'info', message: '' });

        const cached = bomWorkspace.revisionsById[entry.bom_revision_id];
        if (cached) {
            setActiveBomRevision(entry.bom_revision_id);
            setImportedBom({ ...cached, file_name: entry.file_name || cached.fileName || '' });
            setTimeout(() => reviewCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
            return;
        }
        try {
            await loadRevisionSession(entry, true);
            setTimeout(() => reviewCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
        } catch (requestError) {
            setSelectionFeedback({
                type: requestError.response?.status === 404 ? 'warning' : 'error',
                message: requestError.response?.status === 404
                    ? `${entry.reference || 'Cette BOM'} ${entry.revision || ''} ${entry.side || ''}`.trim()
                        + " a été retirée de la session car elle n'existe plus."
                    : requestError.response?.data?.detail || requestError.message || 'Impossible de charger cette BOM',
            });
        }
    };

    // ── Delete BOM (with confirm dialog) (#1) ─────────────────────────────────
    const handleConfirmDeleteBom = async () => {
        setConfirmDeleteOpen(false);
        if (!activeRevisionId) return;
        const removedEntry = selectedEntries.find((e) => e.bom_revision_id === activeRevisionId);
        const label = `${removedEntry?.reference || 'La BOM'} ${removedEntry?.revision || ''} ${removedEntry?.side || ''}`.trim();
        try {
            if (activeProduction?.id) {
                const resp = await apiClient.post(
                    `/marketplace/productions/${activeProduction.id}/bom-revisions/detach`,
                    { bom_revision_ids: [activeRevisionId] },
                );
                setActiveProduction(resp.data);
            }
            removeBomWorkspaceRevision(activeRevisionId);
            setSelectionFeedback({
                type: 'success',
                message: activeProduction?.id
                    ? `${label} retirée de la session et de la production active.`
                    : `${label} retirée de la session.`,
            });
            setSaveState({ loading: false, type: 'info', message: '' });
        } catch (requestError) {
            setSelectionFeedback({
                type: 'error',
                message: requestError.response?.data?.detail || requestError.message
                    || 'Impossible de retirer cette BOM de la production active',
            });
        }
    };

    // ── Stock draft handlers ──────────────────────────────────────────────────
    const handleStockDraftChange = React.useCallback(
        (componentKey, field, asNumber = false) => async (event) => {
            const value = event.target.value;
            updateBomWorkspaceStockDraft(componentKey, {
                [field]: asNumber && value !== '' ? Number(value) : value,
            });
        },
        [updateBomWorkspaceStockDraft],
    );

    // #3 — PATCH pitch instead of GET+PUT
    const persistComponentPitch = React.useCallback(async (componentId, pitchMm) => {
        if (!componentId || pitchMm === '' || pitchMm === null || pitchMm === undefined) return;
        await apiClient.patch(`/bom/components/${componentId}/pitch`, { pitch_mm: Number(pitchMm) });
    }, []);

    const handlePitchBlur = React.useCallback((line) => async () => {
        if (!line.componentLibraryId) return;
        const nextPitch = bomWorkspace.stockDraftByComponentKey?.[line.key]?.pitch_mm;
        if (nextPitch === '' || nextPitch === null || nextPitch === undefined) return;
        try {
            await persistComponentPitch(line.componentLibraryId, nextPitch);
        } catch (requestError) {
            setSelectionFeedback({
                type: 'warning',
                message: requestError.response?.data?.detail || requestError.message
                    || 'Impossible de sauvegarder le pitch dans la bibliothèque composants',
            });
        }
    }, [bomWorkspace.stockDraftByComponentKey, persistComponentPitch]);

    const handleValidateStock = () => {
        if (!canValidateStock) {
            setSelectionFeedback({
                type: 'warning',
                message: `Attends le chargement complet des BOM avant validation (${loadedEntryCount}/${selectedEntries.length || 0}).`,
            });
            return;
        }
        setSelectionFeedback({ type: 'info', message: '' });
        setBomWorkspaceStockValidated(true);
    };

    const handleOpenCommandPage = () => {
        if (!canValidateStock) {
            setSelectionFeedback({
                type: 'warning',
                message: `Charge toutes les BOM sélectionnées avant d'ouvrir Commande Composant (${loadedEntryCount}/${selectedEntries.length || 0}).`,
            });
            return;
        }
        setSelectionFeedback({ type: 'info', message: '' });
        setBomWorkspaceStockValidated(true);
        navigate('/commande-composant');
    };

    const handleOpenStockDialog = React.useCallback((key) => setStockDialogKey(key), []);
    const handleCloseStockDialog = React.useCallback(() => setStockDialogKey(null), []);

    // ── Confirm dialog label ──────────────────────────────────────────────────
    const activeEntryLabel = React.useMemo(() => {
        const e = selectedEntries.find((entry) => entry.bom_revision_id === activeRevisionId);
        return `${e?.reference || 'cette BOM'} ${e?.revision || ''} ${e?.side || ''}`.trim();
    }, [selectedEntries, activeRevisionId]);

    // ── Render ────────────────────────────────────────────────────────────────
    if (!activeProduction?.id) {
        return (
            <Stack spacing={4}>
                <PageHeader
                    eyebrow="Revue multi-BOM"
                    title="BOM"
                    description="La revue BOM est liée à une production active."
                />
                <EmptyState
                    eyebrow="Aucune production active"
                    title="Sélectionnez une production"
                    description="Activez ou créez une production depuis l'onglet Productions pour charger ses BOM et lancer la revue."
                    navigateTo="/dashboard"
                    navigateLabel="Aller aux productions"
                />
            </Stack>
        );
    }

    return (
        <Stack spacing={4}>
            <PageHeader
                eyebrow="Revue multi-BOM"
                title="BOM"
                description="Sélectionne une BOM active à la fois, renseigne les quantités à produire par référence, puis finalise la revue avant de basculer vers la préparation composants."
                actions={(
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Button
                            variant="outlined"
                            color="error"
                            startIcon={<DeleteOutlineRoundedIcon />}
                            disabled={!activeBom}
                            onClick={() => setConfirmDeleteOpen(true)}
                        >
                            Supprimer BOM active
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<SaveRoundedIcon />}
                            disabled={!selectedEntries.length || saveState.loading}
                            onClick={() => handleSaveAll('draft')}
                        >
                            Sauvegarder brouillon
                        </Button>
                        <Button
                            variant="contained"
                            startIcon={<SaveRoundedIcon />}
                            disabled={!selectedEntries.length || saveState.loading}
                            onClick={() => handleSaveAll('validate')}
                        >
                            Valider les BOM
                        </Button>
                    </Stack>
                )}
            />

            {/* Alerts */}
            {saveState.message ? <Alert severity={saveState.type}>{saveState.message}</Alert> : null}
            {selectionFeedback.message ? <Alert severity={selectionFeedback.type}>{selectionFeedback.message}</Alert> : null}

            {/* ── Top panels: Quantities + BOM Selection ─────────────────── */}
            <Grid container spacing={3}>
                <Grid item xs={12} lg={5}>
                    <BomQuantityPanel
                        quantityRows={quantityRows}
                        activeProduction={activeProduction}
                        onQuantityChange={handleQuantityChange}
                        onQuantityBlur={handleQuantityBlur}
                    />
                </Grid>
                <Grid item xs={12} lg={7}>
                    <BomSelectionPanel
                        selectedEntries={selectedEntries}
                        activeRevisionId={activeRevisionId}
                        loadingRevisionId={loadingRevisionId}
                        bomWorkspace={bomWorkspace}
                        onActivateEntry={handleActivateEntry}
                    />
                </Grid>
            </Grid>

            {/* ── Main review card ───────────────────────────────────────── */}
            <Card sx={PANEL_CARD_SX} ref={reviewCardRef}>
                <Box sx={{ px: 3, pt: 2.5, borderBottom: '1px solid #27272a' }}>
                    <Tabs
                        value={activeTab}
                        onChange={(_, v) => setBomWorkspaceActiveTab(v)}
                        textColor="inherit"
                        indicatorColor="primary"
                        sx={TAB_SX}
                    >
                        <Tab value="review" label="Revue BOM" />
                        <Tab value="components" label="Composants et stock" />
                    </Tabs>
                </Box>

                <CardContent sx={{ pt: 3 }}>
                    {activeTab === 'review' ? (
                        <BomReviewTab
                            activeBom={activeBom}
                            activeRevisionId={activeRevisionId}
                            undoStackLength={undoStack.length}
                            onValueChange={handleValueChange}
                            onFootprintChange={handleFootprintChange}
                            onComponentTypeChange={handleComponentTypeChange}
                            onDnpChange={handleDnpChange}
                            onNotesChange={handleNotesChange}
                            onBulkTypeChange={handleBulkTypeChange}
                            onUndo={applyUndo}
                        />
                    ) : (
                        <BomStockTab
                            aggregatedPreview={aggregatedPreview}
                            stockValidation={stockValidation}
                            loadedEntryCount={loadedEntryCount}
                            selectedEntries={selectedEntries}
                            canValidateStock={canValidateStock}
                            onValidateStock={handleValidateStock}
                            onOpenCommandPage={handleOpenCommandPage}
                            onOpenStockDialog={handleOpenStockDialog}
                        />
                    )}
                </CardContent>
            </Card>

            {/* ── Dialogs ────────────────────────────────────────────────── */}
            <BomStockDialog
                line={activeStockLine}
                open={Boolean(activeStockLine)}
                onClose={handleCloseStockDialog}
                onStockDraftChange={handleStockDraftChange}
                onPitchBlur={handlePitchBlur}
            />

            <ConfirmDialog
                open={confirmDeleteOpen}
                title="Supprimer la BOM active ?"
                message={`Retirer ${activeEntryLabel} de la session${activeProduction?.id ? ' et de la production active' : ''}. Tu peux la recharger depuis Fichier BOM.`}
                confirmLabel="Supprimer"
                cancelLabel="Annuler"
                onConfirm={handleConfirmDeleteBom}
                onClose={() => setConfirmDeleteOpen(false)}
                severity="error"
            />
        </Stack>
    );
}

export default BomViewerPage;
