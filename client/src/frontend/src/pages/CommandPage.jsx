import React from 'react';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Grid,
    InputAdornment,
    Stack,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    TableSortLabel,
    Tabs,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import apiClient from '../api/client';
import { useNavigate } from 'react-router-dom';
import EmptyState from '../components/common/EmptyState';
import GuideBanner from '../components/common/GuideBanner';
import PageHeader from '../components/common/PageHeader';
import ErpContextForm, { EMPTY_ERP } from '../components/command/ErpContextForm';
import ProcurementTable from '../components/command/ProcurementTable';
import StockStatusChip from '../components/command/StockStatusChip';
import MpnEnrichmentPanel from '../components/library/MpnEnrichmentPanel';
import { useBomSession } from '../context/BomSessionContext';
import { colors } from '../theme';
import {
    areSelectedCommandEntriesLoaded,
    buildCommandGenerationItems,
    buildCommandContextSignature,
    buildCommandSummarySignature,
    buildDefaultCommandName,
    buildPlanningLines,
    buildSelectionLabel,
    countLoadedCommandEntries,
    getSelectedCommandEntries,
    isCommandSummaryCurrent,
    mergeCommandLinesWithPlanning,
} from '../utils/commandPlanning';
import {
    compactPaginationSx,
    compactTableContainerSx,
    compactTableSx,
} from '../utils/compactTable';

// ─── Constants ───────────────────────────────────────────────────────────────
// EMPTY_ERP et ERP_STATUT_OPTIONS vivent désormais dans components/command/ErpContextForm.jsx

const CARD_SX = {
    backgroundColor: colors.surfaceCard,
    border: `1px solid ${colors.border}`,
};

const SORTABLE_COLUMNS = [
    { key: 'componentName', label: 'Composant' },
    { key: 'value', label: 'Valeur' },
    { key: 'footprint', label: 'Empreinte' },
    { key: 'requiredQuantity', label: 'Besoin' },
    { key: 'stockAvailableQty', label: 'Stock' },
    { key: 'quantityToOrder', label: 'Commande ✎' },
    { key: 'manualPlacement', label: 'Pose' },
    { key: 'sources', label: 'Source' },
];

// ─── Main component ───────────────────────────────────────────────────────────

function CommandPage() {
    const navigate = useNavigate();
    const {
        activeProduction,
        currentBom,
        bomWorkspace,
        cacheBomRevision,
        removeBomWorkspaceRevision,
    } = useBomSession();

    // selectedBomEntries est stocké dans bomWorkspace, pas directement dans le context
    const selectedBomEntries = bomWorkspace.selectedRevisionEntries ?? [];

    // ── State ──
    const [commandName, setCommandName] = React.useState('');
    const [commandSummary, setCommandSummary] = React.useState(null);
    const [commandTab, setCommandTab] = React.useState(0); // 0 = à commander, 1 = enrichissement MPN
    const [feedback, setFeedback] = React.useState({ type: 'info', message: '' });
    const [isGenerating, setIsGenerating] = React.useState(false);
    const [isExporting, setIsExporting] = React.useState(false);
    const [refreshNonce, setRefreshNonce] = React.useState(0);
    const [refreshState, setRefreshState] = React.useState({ loading: false, error: null });
    const [isLoadingCommand, setIsLoadingCommand] = React.useState(false);
    const [planningSyncState, setPlanningSyncState] = React.useState({ loading: false, type: 'info', message: '' });
    const [page, setPage] = React.useState(0);
    const [rowsPerPage, setRowsPerPage] = React.useState(25);
    const [filterText, setFilterText] = React.useState('');
    const [sortConfig, setSortConfig] = React.useState({ column: 'quantityToOrder', direction: 'desc' });
    const [quantityOverrides, setQuantityOverrides] = React.useState({});

    // ERP context — persisted server-side per production
    const erpDebounceRef = React.useRef(null);
    const commandLoadDebounceRef = React.useRef(null);

    const [exportContext, setExportContext] = React.useState(() => {
        const ctx = activeProduction?.erp_context;
        return (ctx && typeof ctx === 'object') ? { ...EMPTY_ERP, ...ctx } : EMPTY_ERP;
    });

    // ── Memos ──
    const selectedEntries = React.useMemo(
        () => getSelectedCommandEntries(selectedBomEntries, currentBom),
        [selectedBomEntries, currentBom],
    );

    const commandContextSignature = React.useMemo(
        () => buildCommandContextSignature(selectedEntries, bomWorkspace.quantitiesByReference),
        [selectedEntries, bomWorkspace.quantitiesByReference],
    );

    const loadedEntryCount = React.useMemo(
        () => countLoadedCommandEntries(selectedEntries, bomWorkspace.revisionsById, currentBom),
        [selectedEntries, bomWorkspace.revisionsById, currentBom],
    );

    const isPlanningReady = React.useMemo(
        () => areSelectedCommandEntriesLoaded(selectedEntries, bomWorkspace.revisionsById, currentBom),
        [selectedEntries, bomWorkspace.revisionsById, currentBom],
    );

    const planningLines = React.useMemo(
        () => buildPlanningLines(bomWorkspace),
        [bomWorkspace],
    );

    const isCommandCurrent = React.useMemo(
        () => isCommandSummaryCurrent(commandSummary, selectedEntries, bomWorkspace.quantitiesByReference),
        [commandSummary, selectedEntries, bomWorkspace.quantitiesByReference],
    );

    const effectiveSummaryLines = React.useMemo(
        () => (isCommandCurrent ? (commandSummary?.aggregated_components || []) : []),
        [commandSummary, isCommandCurrent],
    );

    const commandLines = React.useMemo(
        () => mergeCommandLinesWithPlanning(effectiveSummaryLines, planningLines),
        [effectiveSummaryLines, planningLines],
    );

    const selectionLabel = React.useMemo(
        () => buildSelectionLabel(selectedEntries),
        [selectedEntries],
    );

    const missingEntries = React.useMemo(() => {
        const seenRevisionIds = new Set();
        const entries = [];

        selectedEntries.forEach((entry) => {
            const revisionId = entry?.bom_revision_id;
            if (!revisionId || bomWorkspace.revisionsById?.[revisionId] || seenRevisionIds.has(revisionId)) {
                return;
            }

            seenRevisionIds.add(revisionId);
            entries.push(entry);
        });

        return entries;
    }, [bomWorkspace.revisionsById, selectedEntries]);

    // Filter + sort applied to commandLines
    const filteredSortedLines = React.useMemo(() => {
        const needle = filterText.toLowerCase().trim();

        let lines = needle
            ? commandLines.filter((line) => {
                  const sourcesStr = (line.sources || []).join(' ').toLowerCase();
                  return (
                      (line.componentName || '').toLowerCase().includes(needle) ||
                      (line.value || '').toLowerCase().includes(needle) ||
                      (line.footprint || '').toLowerCase().includes(needle) ||
                      sourcesStr.includes(needle)
                  );
              })
            : [...commandLines];

        const { column, direction } = sortConfig;
        const mult = direction === 'asc' ? 1 : -1;

        lines.sort((a, b) => {
            const av = a[column];
            const bv = b[column];

            if (typeof av === 'number' && typeof bv === 'number') {
                return (av - bv) * mult;
            }

            if (typeof av === 'boolean' && typeof bv === 'boolean') {
                return ((av ? 1 : 0) - (bv ? 1 : 0)) * mult;
            }

            const as = String(av ?? '').toLowerCase();
            const bs = String(bv ?? '').toLowerCase();
            return as.localeCompare(bs) * mult;
        });

        return lines;
    }, [commandLines, filterText, sortConfig]);

    const paginatedCommandLines = React.useMemo(() => {
        const start = page * rowsPerPage;
        return filteredSortedLines.slice(start, start + rowsPerPage);
    }, [filteredSortedLines, page, rowsPerPage]);

    const totalRequiredQuantity = React.useMemo(
        () => commandLines.reduce((sum, line) => sum + line.requiredQuantity, 0),
        [commandLines],
    );

    const totalOrderQuantity = React.useMemo(
        () => commandLines.reduce((sum, line) => sum + (quantityOverrides[line.key] ?? line.quantityToOrder), 0),
        [commandLines, quantityOverrides],
    );

    const stockValidation = bomWorkspace.stockValidation || { isValidated: false, validatedAt: null };

    const canGenerateCommand = (
        Boolean(selectedEntries.length)
        && stockValidation.isValidated
        && isPlanningReady
        && !planningSyncState.loading
    );

    const canExportCommand = (
        Boolean(commandSummary?.id)
        && !isExporting
        && stockValidation.isValidated
        && isPlanningReady
        && isCommandCurrent
        && !planningSyncState.loading
    );

    const stockValidationHelperText = React.useMemo(() => {
        if (planningSyncState.loading) {
            return 'Les révisions BOM sont rechargées pour recalculer les quantités avant commande.';
        }

        if (selectedEntries.length && !isPlanningReady) {
            return `BOM chargées : ${loadedEntryCount}/${selectedEntries.length}. Attends le chargement complet avant génération.`;
        }

        if (stockValidation.isValidated) {
            return 'La commande prendra en compte le stock vérifié.';
        }

        return 'Retourne dans BOM > Composants et stock pour valider avant génération.';
    }, [
        isPlanningReady,
        loadedEntryCount,
        planningSyncState.loading,
        selectedEntries.length,
        stockValidation.isValidated,
    ]);

    const backendCommandLabel = React.useMemo(() => {
        if (isLoadingCommand) return '…';
        if (!commandSummary) return 'Non générée';
        if (!stockValidation.isValidated) return `${commandSummary.name} (#${commandSummary.id}) - stock à revalider`;
        return `${commandSummary.name} (#${commandSummary.id})`;
    }, [commandSummary, isLoadingCommand, stockValidation.isValidated]);

    // ── Effects ──

    // Cleanup ERP debounce on unmount
    React.useEffect(() => {
        return () => {
            if (erpDebounceRef.current) clearTimeout(erpDebounceRef.current);
            if (commandLoadDebounceRef.current) clearTimeout(commandLoadDebounceRef.current);
        };
    }, []);

    // Reset when production or entries change
    React.useEffect(() => {
        setCommandName(buildDefaultCommandName(selectedEntries));
        setCommandSummary(null);
        setQuantityOverrides({});
        const ctx = activeProduction?.erp_context;
        setExportContext((ctx && typeof ctx === 'object') ? { ...EMPTY_ERP, ...ctx } : EMPTY_ERP);
        setFeedback({ type: 'info', message: '' });
    }, [activeProduction?.id, selectedEntries]); // eslint-disable-line react-hooks/exhaustive-deps

    // Invalidate summary if context signature changes
    React.useEffect(() => {
        setCommandSummary((current) => {
            if (!current?.id) return current;
            return buildCommandSummarySignature(current) === commandContextSignature ? current : null;
        });
    }, [commandContextSignature]);

    // Reload missing BOM revisions
    React.useEffect(() => {
        if (!missingEntries.length) {
            setPlanningSyncState((current) => (
                current.loading || current.message
                    ? { loading: false, type: 'info', message: '' }
                    : current
            ));
            return undefined;
        }

        let cancelled = false;
        setPlanningSyncState({
            loading: true,
            type: 'info',
            message: 'Rechargement des révisions BOM nécessaires au calcul stock...',
        });

        const hydratePlanning = async () => {
            try {
                const results = await Promise.allSettled(
                    missingEntries.map(async (entry) => {
                        try {
                            const sessionResponse = await apiClient.get(`/bom/files/${entry.bom_revision_id}/session`);
                            return { entry, session: sessionResponse.data };
                        } catch (requestError) {
                            const wrappedError = new Error(
                                requestError?.message || 'Impossible de recharger une révision BOM pour la commande.',
                            );
                            wrappedError.entry = entry;
                            wrappedError.requestError = requestError;
                            throw wrappedError;
                        }
                    }),
                );

                if (cancelled) return;

                let warningMessage = '';
                for (const result of results) {
                    if (cancelled) return;

                    if (result.status === 'fulfilled') {
                        cacheBomRevision({
                            ...result.value.session,
                            file_name: result.value.entry.file_name,
                        });
                        continue;
                    }

                    const failedEntry = result.reason?.entry;
                    const requestError = result.reason?.requestError || result.reason;

                    if (requestError?.response?.status === 404 && failedEntry?.bom_revision_id) {
                        removeBomWorkspaceRevision(failedEntry.bom_revision_id);
                        if (!warningMessage) {
                            warningMessage = `${failedEntry.reference || 'Une BOM'} ${failedEntry.revision || ''} ${failedEntry.side || ''}`.trim() + " a été retirée de la session car elle n'existe plus.";
                        }
                        continue;
                    }

                    setPlanningSyncState({
                        loading: false,
                        type: 'error',
                        message: requestError?.response?.data?.detail || requestError?.message || 'Impossible de recharger les révisions BOM pour la commande.',
                    });
                    return;
                }

                setPlanningSyncState(
                    warningMessage
                        ? { loading: false, type: 'warning', message: warningMessage }
                        : { loading: false, type: 'info', message: '' },
                );
            } catch (requestError) {
                if (!cancelled) {
                    setPlanningSyncState({
                        loading: false,
                        type: 'error',
                        message: requestError.response?.data?.detail || requestError.message || 'Impossible de préparer la vue commande.',
                    });
                }
            }
        };

        hydratePlanning();
        return () => { cancelled = true; };
    }, [cacheBomRevision, missingEntries, removeBomWorkspaceRevision]);

    // Load latest matching command — debounced 300ms, sequential with early exit
    React.useEffect(() => {
        if (commandLoadDebounceRef.current) clearTimeout(commandLoadDebounceRef.current);

        if (!activeProduction?.id || !commandContextSignature) {
            setCommandSummary(null);
            setIsLoadingCommand(false);
            return undefined;
        }

        let cancelled = false;
        setIsLoadingCommand(true);

        commandLoadDebounceRef.current = setTimeout(async () => {
            try {
                // Charge la commande implicite canonique de la production (même ancre que le backend).
                const response = await apiClient.get(`/marketplace/productions/${activeProduction.id}/command`);
                const summary = response?.data;
                if (!cancelled) {
                    setCommandSummary(summary || null);
                    if (summary?.name) setCommandName(summary.name);
                }
            } catch {
                if (!cancelled) setCommandSummary(null);
            } finally {
                if (!cancelled) setIsLoadingCommand(false);
            }
        }, 300);

        return () => {
            cancelled = true;
            setIsLoadingCommand(false);
        };
    }, [activeProduction?.id, commandContextSignature, selectedEntries]);

    // Page boundary guard
    React.useEffect(() => {
        const maxPage = Math.max(0, Math.ceil(filteredSortedLines.length / rowsPerPage) - 1);
        if (page > maxPage) setPage(maxPage);
    }, [filteredSortedLines.length, page, rowsPerPage]);

    // ── Handlers ──

    const handleSortChange = (column) => {
        setSortConfig((current) => ({
            column,
            direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const handleQuantityOverride = React.useCallback((key, value) => {
        setQuantityOverrides((current) => ({ ...current, [key]: value }));
    }, []);

    const handleExportContextChange = (field) => (event) => {
        const value = typeof event === 'string' ? event : event?.target?.value ?? '';
        setExportContext((current) => {
            const next = { ...current, [field]: value };
            if (activeProduction?.id) {
                if (erpDebounceRef.current) clearTimeout(erpDebounceRef.current);
                erpDebounceRef.current = setTimeout(() => {
                    apiClient.patch(
                        `/marketplace/productions/${activeProduction.id}/erp-context`,
                        { erp_context: next },
                    ).catch(() => { /* silent — non-critical */ });
                }, 800);
            }
            return next;
        });
    };

    const readErrorMessage = async (requestError) => {
        const errorData = requestError.response?.data;
        if (errorData instanceof Blob) {
            try {
                const errorText = await errorData.text();
                const parsedError = JSON.parse(errorText);
                return parsedError.detail || parsedError.message || errorText || requestError.message;
            } catch {
                return requestError.message;
            }
        }
        return errorData?.detail || errorData?.message || requestError.message || 'Erreur inconnue';
    };

    // Synchronise la commande implicite de la production (remplace « Générer »).
    const syncCommand = React.useCallback(async () => {
        if (!activeProduction?.id || !selectedEntries.length) return;
        if (!stockValidation.isValidated || !isPlanningReady || planningSyncState.loading) return;
        setIsGenerating(true);
        try {
            const response = await apiClient.post(
                `/marketplace/productions/${activeProduction.id}/command/sync`,
                { items: buildCommandGenerationItems(selectedEntries, bomWorkspace.quantitiesByReference) },
            );
            setCommandSummary(response.data);
        } catch (requestError) {
            setFeedback({
                type: 'error',
                message: requestError.response?.data?.detail || requestError.message || 'Erreur lors de la synchronisation de la commande',
            });
        } finally {
            setIsGenerating(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeProduction?.id, selectedEntries, stockValidation.isValidated, isPlanningReady, planningSyncState.loading, bomWorkspace.quantitiesByReference]);

    // Auto-synchronise la commande implicite dès que le stock est validé.
    const lastSyncedSignature = React.useRef(null);
    React.useEffect(() => {
        if (!stockValidation.isValidated || !selectedEntries.length || !isPlanningReady || planningSyncState.loading) {
            return;
        }
        if (isCommandCurrent || isGenerating) return;
        if (lastSyncedSignature.current === commandContextSignature) return;
        lastSyncedSignature.current = commandContextSignature;
        syncCommand();
    }, [
        stockValidation.isValidated, selectedEntries.length, isPlanningReady, planningSyncState.loading,
        isCommandCurrent, isGenerating, commandContextSignature, syncCommand,
    ]);

    // Préremplit le formulaire ERP avec les valeurs par défaut (champs vides seulement).
    React.useEffect(() => {
        let cancelled = false;
        apiClient.get('/marketplace/erp-defaults').then((res) => {
            if (cancelled) return;
            const d = res.data || {};
            setExportContext((cur) => ({
                ...cur,
                projet: cur.projet || d.project || '',
                delai: cur.delai || d.delay || '',
                remarque: cur.remarque || d.remark || '',
                validateur: cur.validateur || d.validator || '',
                fournisseurParDefaut: cur.fournisseurParDefaut || d.default_supplier || '',
            }));
        }).catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const procurementRows = React.useMemo(() => {
        const byKey = new Map(commandLines.map((line) => [line.key, line]));
        return effectiveSummaryLines.map((line) => {
            const merged = byKey.get(line.key);
            return {
                key: line.key,
                // Colonne « Composant » : la valeur du composant (identité stable et
                // lisible). NE PAS utiliser component_name qui vaut « mpn or value »
                // côté backend — sinon saisir un MPN change cette colonne, alors que
                // seule la colonne MPN doit refléter le MPN (bug remonté 2026-07-07).
                componentName: line.value || line.component_reference,
                value: line.value,
                footprint: line.footprint,
                requiredQuantity: merged?.requiredQuantity ?? line.quantity ?? 0,
                stockAvailableQty: merged?.stockAvailableQty ?? 0,
                quantityToOrder: quantityOverrides[line.key]
                    ?? line.quantity_to_order_override
                    ?? merged?.quantityToOrder
                    ?? line.quantity
                    ?? 0,
                componentLibraryId: line.component_library_id,
                mpn: line.component_mpn,
                note: line.note || '',
                manualOffer: line.manual_offer || null,
                qtyReceived: line.qty_received ?? 0,
            };
        });
    }, [effectiveSummaryLines, commandLines, quantityOverrides]);

    // Rafraîchit la commande implicite après une complétion manuelle de ligne.
    // set_line_detail renvoie déjà le summary à jour : on l'applique directement.
    const handleLineSaved = React.useCallback((summary) => {
        if (summary?.id) setCommandSummary(summary);
    }, []);

    // Recharge le résumé commande (colonne MPN + données dérivées) depuis le backend.
    const reloadCommandSummary = React.useCallback(async () => {
        if (!activeProduction?.id) return;
        try {
            const response = await apiClient.get(`/marketplace/productions/${activeProduction.id}/command`);
            if (response?.data) {
                setCommandSummary(response.data);
                if (response.data.name) setCommandName(response.data.name);
            }
        } catch { /* silencieux : on garde l'affichage courant */ }
    }, [activeProduction?.id]);

    // Bouton « Actualiser » : recharge le résumé (pour refléter les MPN mis à jour
    // manuellement ou via la section MPN) PUIS ré-actualise les offres/prix (le
    // refresh backend ré-interroge les fournisseurs avec le MPN à jour).
    const handleRefreshCommand = React.useCallback(() => {
        reloadCommandSummary();
        setRefreshNonce((n) => n + 1);
    }, [reloadCommandSummary]);

    const exportCommandToErp = async () => {
        if (!stockValidation.isValidated) {
            setFeedback({ type: 'error', message: 'Le stock ou les quantités ont changé depuis la dernière validation. Revalide dans BOM avant export.' });
            return;
        }
        if (!commandSummary?.id) {
            setFeedback({ type: 'error', message: "La commande doit être générée avant de lancer l'export ERP." });
            return;
        }
        if (!isPlanningReady || planningSyncState.loading) {
            setFeedback({ type: 'error', message: 'Les données BOM nécessaires au calcul des quantités à commander ne sont pas encore rechargées.' });
            return;
        }
        if (!isCommandCurrent) {
            setFeedback({ type: 'error', message: 'La commande backend ne correspond plus à la sélection ou aux quantités courantes. Régénère-la avant export.' });
            return;
        }
        // Les champs ERP non renseignés sont complétés par les valeurs par défaut côté backend.

        setIsExporting(true);
        setFeedback({ type: 'info', message: '' });

        try {
            const response = await apiClient.post(
                `/marketplace/commands/${commandSummary.id}/erp-export`,
                {
                    project: exportContext.projet.trim(),
                    erp_status: exportContext.statut.trim(),
                    delay: exportContext.delai.trim(),
                    remark: exportContext.remarque.trim(),
                    validator: exportContext.validateur.trim(),
                    default_supplier: exportContext.fournisseurParDefaut.trim() || null,
                    line_overrides: commandLines.map((line) => ({
                        key: line.key,
                        quantity_to_order: quantityOverrides[line.key] ?? line.quantityToOrder,
                    })),
                },
                { responseType: 'blob' },
            );

            const blob = response.data;
            const contentDisposition = response.headers?.['content-disposition'] || '';
            const fileNameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i);
            const fileName = decodeURIComponent(
                fileNameMatch?.[1] || fileNameMatch?.[2] || `${commandSummary.name || 'commande'}_erp_export.xlsx`,
            );
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);

            setFeedback({ type: 'success', message: `Export ERP généré pour ${commandSummary.name || 'la commande'}.` });
        } catch (requestError) {
            const errorMessage = await readErrorMessage(requestError);
            setFeedback({ type: 'error', message: errorMessage || "Erreur lors de l'export ERP" });
        } finally {
            setIsExporting(false);
        }
    };

    const handleResetCommandSection = async () => {
        // Always attempt to delete backend command if one exists (current or stale)
        const existingCommandId = commandSummary?.id || null;

        try {
            if (existingCommandId) {
                await apiClient.delete(`/marketplace/commands/${existingCommandId}`);
            }

            setCommandSummary(null);
            setCommandName(buildDefaultCommandName(selectedEntries));
            setExportContext(EMPTY_ERP);
            setQuantityOverrides({});
            setPage(0);
            setFilterText('');

            setFeedback({
                type: 'success',
                message: existingCommandId
                    ? 'Commande et contexte export ERP réinitialisés.'
                    : 'Contexte export ERP réinitialisé.',
            });
        } catch (requestError) {
            setFeedback({
                type: 'error',
                message: requestError.response?.data?.detail || requestError.message || 'Erreur lors de la réinitialisation de la commande',
            });
        }
    };

    // ── Render ──

    const overridesCount = Object.keys(quantityOverrides).length;

    if (!activeProduction?.id) {
        return (
            <Stack spacing={4}>
                <PageHeader
                    eyebrow="Préparation achat"
                    title="Préparation commande composants"
                    description="La préparation de commande est liée à une production active."
                />
                <EmptyState
                    eyebrow="Aucune production active"
                    title="Sélectionnez une production"
                    description="Activez ou créez une production depuis l'onglet Productions pour préparer une commande de composants."
                    navigateTo="/dashboard"
                    navigateLabel="Aller aux productions"
                />
            </Stack>
        );
    }

    return (
        <Stack spacing={4}>
            <PageHeader
                eyebrow="Préparation achat"
                title="Préparation commande composants"
                actions={(
                    <Stack direction="row" spacing={1}>
                        <Button
                            variant="contained"
                            startIcon={<DownloadRoundedIcon />}
                            disabled={!canExportCommand}
                            onClick={exportCommandToErp}
                        >
                            {isExporting ? 'Export...' : 'Exporter ERP'}
                        </Button>
                        <Button
                            variant="contained"
                            color="secondary"
                            startIcon={<RefreshRoundedIcon />}
                            disabled={!isCommandCurrent || refreshState.loading}
                            onClick={handleRefreshCommand}
                        >
                            {refreshState.loading ? 'Actualisation...' : 'Actualiser'}
                        </Button>
                        <Button
                            variant="outlined"
                            color="inherit"
                            startIcon={<RestartAltRoundedIcon />}
                            disabled={isGenerating || isExporting}
                            onClick={handleResetCommandSection}
                        >
                            Réinitialiser
                        </Button>
                    </Stack>
                )}
            />

            {!selectedBomEntries.length && (
                <GuideBanner
                    message="Aucune BOM sélectionnée — revenez à la Revue BOM pour préparer vos entrées de commande."
                    ctaLabel="Revue BOM"
                    ctaPath="/bom"
                    storageKey="command_no_entries"
                />
            )}

            {feedback.message ? <Alert severity={feedback.type}>{feedback.message}</Alert> : null}
            {planningSyncState.message ? <Alert severity={planningSyncState.type}>{planningSyncState.message}</Alert> : null}
            {commandSummary?.id && !stockValidation.isValidated ? (
                <Alert severity="warning">
                    Le stock ou les quantités ont changé depuis la dernière validation. Revalide dans BOM avant export.
                </Alert>
            ) : null}

            {/* ── Paramètres commande ── */}
            <Card sx={CARD_SX}>
                <CardContent>
                    <Grid container spacing={2} alignItems="flex-end">
                        {/* Sélection BOM */}
                        <Grid item xs={12} md={5}>
                            <Typography variant="caption" sx={{ color: colors.textMuted, mb: 0.5, display: 'block' }}>
                                Sélection BOM
                            </Typography>
                            <Typography
                                variant="body2"
                                sx={{
                                    color: selectionLabel ? colors.textPrimary : colors.textMuted,
                                    fontStyle: selectionLabel ? 'normal' : 'italic',
                                    minHeight: 24,
                                }}
                            >
                                {selectionLabel || 'Aucune BOM sélectionnée'}
                            </Typography>
                        </Grid>

                        {/* Mode agrégation — label statique, pas de choix V1 */}
                        <Grid item xs={12} sm={6} md={3}>
                            <Typography variant="caption" sx={{ color: colors.textMuted, mb: 0.5, display: 'block' }}>
                                Mode d'agrégation
                            </Typography>
                            <Chip
                                label="Valeur + empreinte + type"
                                size="small"
                                sx={{ backgroundColor: colors.border, color: colors.textSecondary }}
                            />
                        </Grid>

                        {/* Nom de commande */}
                        <Grid item xs={12} sm={6} md={4}>
                            <TextField
                                fullWidth
                                label="Nom de commande"
                                value={commandName}
                                onChange={(event) => setCommandName(event.target.value)}
                                placeholder="Commande mars 2026"
                                disabled={!selectedEntries.length || isGenerating}
                            />
                        </Grid>

                        {/* Validation stock — Chip */}
                        <Grid item xs={12} sm={6} md={4}>
                            <Stack spacing={0.5}>
                                <Typography variant="caption" sx={{ color: colors.textMuted }}>
                                    Validation stock
                                </Typography>
                                <StockStatusChip
                                    isValidated={stockValidation.isValidated}
                                    isLoading={planningSyncState.loading}
                                />
                                <Typography variant="caption" sx={{ color: colors.textMuted }}>
                                    {stockValidationHelperText}
                                </Typography>
                            </Stack>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* ── Deux onglets : Composants à commander | Enrichissement MPN ── */}
            <Box>
                <Tabs
                    value={commandTab}
                    onChange={(event, value) => setCommandTab(value)}
                    sx={{ borderBottom: `1px solid ${colors.border}`, mb: 3 }}
                >
                    <Tab label="Composants à commander" />
                    <Tab label="Enrichissement MPN" />
                </Tabs>

                {commandTab === 0 ? (
                    <Stack spacing={4}>
                        {refreshState.error ? <Alert severity="warning">{refreshState.error}</Alert> : null}
                        <Card sx={CARD_SX}>
                            <CardContent>
                                <ProcurementTable
                                    rows={procurementRows}
                                    commandId={commandSummary?.command_id || commandSummary?.id}
                                    refreshNonce={refreshNonce}
                                    onRefreshState={setRefreshState}
                                    onLineSaved={handleLineSaved}
                                />
                            </CardContent>
                        </Card>
                        {/* Champs pour le fichier ERP (liés au flux de commande/export) */}
                        <ErpContextForm
                            exportContext={exportContext}
                            onFieldChange={handleExportContextChange}
                            isExporting={isExporting}
                        />
                    </Stack>
                ) : (
                    <Card sx={CARD_SX}>
                        <CardContent>
                            <Typography variant="caption" sx={{ color: colors.textMuted, display: 'block', mb: 2 }}>
                                Renseigne les MPN manquants des composants de cette commande. Le MPN validé est écrit dans la bibliothèque (visible partout).
                            </Typography>
                            {(commandSummary?.command_id || commandSummary?.id) ? (
                                <MpnEnrichmentPanel
                                    commandId={commandSummary?.command_id || commandSummary?.id}
                                    onApplied={handleRefreshCommand}
                                />
                            ) : (
                                <Typography variant="body2" sx={{ color: colors.textMuted }}>
                                    Génère d'abord la commande pour enrichir ses composants.
                                </Typography>
                            )}
                        </CardContent>
                    </Card>
                )}
            </Box>
        </Stack>
    );
}

export default CommandPage;
