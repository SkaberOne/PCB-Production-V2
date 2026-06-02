import React from 'react';
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import {
    Alert,
    Button,
    Card,
    CardContent,
    Chip,
    Grid,
    InputAdornment,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    TableSortLabel,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import apiClient from '../api/client';
import { useNavigate } from 'react-router-dom';
import EmptyState from '../components/common/EmptyState';
import GuideBanner from '../components/common/GuideBanner';
import PageHeader from '../components/common/PageHeader';
import CommandLineRow from '../components/command/CommandLineRow';
import ErpContextForm, { EMPTY_ERP } from '../components/command/ErpContextForm';
import StockStatusChip from '../components/command/StockStatusChip';
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
    const [feedback, setFeedback] = React.useState({ type: 'info', message: '' });
    const [isGenerating, setIsGenerating] = React.useState(false);
    const [isExporting, setIsExporting] = React.useState(false);
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
                const listResponse = await apiClient.get(`/marketplace/commands`, {
                    params: { production_id: activeProduction.id, limit: 20, offset: 0 },
                });
                const recentCommands = listResponse.data?.data || [];

                // Sequential fetch with early exit — stops as soon as matching command found
                for (const candidate of recentCommands) {
                    if (cancelled || !candidate?.id) continue;

                    try {
                        const summaryResponse = await apiClient.get(`/marketplace/commands/${candidate.id}/summary`);
                        const summary = summaryResponse?.data;

                        if (buildCommandSummarySignature(summary) === commandContextSignature) {
                            if (!cancelled) {
                                setCommandSummary(summary);
                                setCommandName(summary?.name || buildDefaultCommandName(selectedEntries));
                            }
                            return;
                        }
                    } catch {
                        // Skip failed summary — continue to next candidate
                    }
                }

                if (!cancelled) setCommandSummary(null);
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

    const generateCommand = async () => {
        if (!selectedEntries.length) {
            setFeedback({ type: 'error', message: "Aucune BOM sélectionnée n'est disponible pour générer une commande." });
            return;
        }
        if (!stockValidation.isValidated) {
            setFeedback({ type: 'error', message: "Valide d'abord la vérification du stock dans l'onglet BOM avant de générer la commande." });
            return;
        }
        if (!isPlanningReady || planningSyncState.loading) {
            setFeedback({ type: 'error', message: 'Les révisions BOM sont encore en cours de rechargement pour recalculer le stock. Réessaie dans un instant.' });
            return;
        }
        const normalizedName = commandName.trim();
        if (!normalizedName) {
            setFeedback({ type: 'error', message: 'Le nom de commande est obligatoire.' });
            return;
        }

        setIsGenerating(true);
        setFeedback({ type: 'info', message: '' });

        try {
            const summaryResponse = await apiClient.post(`/marketplace/commands/generate`, {
                name: normalizedName,
                notes: `Généré depuis ${selectedEntries.length} BOM sélectionnée(s)`,
                production_id: activeProduction?.id || null,
                items: buildCommandGenerationItems(selectedEntries, bomWorkspace.quantitiesByReference),
            });
            setCommandSummary(summaryResponse.data);
            setQuantityOverrides({});
            setFeedback({ type: 'success', message: `Commande ${summaryResponse.data.name} générée avec succès.` });
        } catch (requestError) {
            // Do NOT wipe existing commandSummary on error — preserve last valid state
            setFeedback({
                type: 'error',
                message: requestError.response?.data?.detail || requestError.message || 'Erreur lors de la génération de commande',
            });
        } finally {
            setIsGenerating(false);
        }
    };

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
        if (!exportContext.projet.trim() || !exportContext.statut.trim() || !exportContext.delai.trim() || !exportContext.validateur.trim()) {
            setFeedback({ type: 'error', message: "Renseigne au minimum Projet, Statut, Délai et Validateur avant l'export ERP." });
            return;
        }

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
                description="Le module préparera une liste de composants à commander depuis une ou plusieurs BOM, avec export ERP généré par le backend."
                actions={(
                    <Stack direction="row" spacing={1}>
                        <Button
                            variant="contained"
                            startIcon={<AddShoppingCartRoundedIcon />}
                            disabled={!canGenerateCommand || isGenerating}
                            onClick={generateCommand}
                        >
                            {isGenerating ? 'Génération...' : 'Générer la commande'}
                        </Button>
                        <Button
                            variant="contained"
                            startIcon={<DownloadRoundedIcon />}
                            disabled={!canExportCommand}
                            onClick={exportCommandToErp}
                        >
                            {isExporting ? 'Export...' : 'Export ERP'}
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

            {/* ── Contexte export ERP ── */}
            <ErpContextForm
                exportContext={exportContext}
                onFieldChange={handleExportContextChange}
                isExporting={isExporting}
            />

            {/* ── Liste commande + Aperçu session ── */}
            <Grid container spacing={3}>
                <Grid item xs={12} xl={8}>
                    <Card sx={CARD_SX}>
                        <CardContent>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                                <div>
                                    <Typography variant="h6" sx={{ color: colors.textPrimary, fontWeight: 600 }}>
                                        Liste de commande
                                    </Typography>
                                    <Typography component="div" variant="body2" sx={{ color: colors.textSecondary }}>
                                        Composants agrégés depuis les BOM sélectionnées — colonne Commande éditable (ex : arrondi bobine).
                                        {overridesCount > 0 && (
                                            <Chip
                                                label={`${overridesCount} qté modifiée${overridesCount > 1 ? 's' : ''}`}
                                                size="small"
                                                sx={{ ml: 1, backgroundColor: 'rgba(5,150,105,0.18)', color: '#34d399', fontSize: '0.72rem' }}
                                            />
                                        )}
                                    </Typography>
                                </div>
                                <TextField
                                    size="small"
                                    placeholder="Filtrer composant, valeur, empreinte..."
                                    value={filterText}
                                    onChange={(e) => { setFilterText(e.target.value); setPage(0); }}
                                    sx={{ width: 260 }}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <Typography variant="caption" sx={{ color: colors.textMuted }}>🔍</Typography>
                                            </InputAdornment>
                                        ),
                                    }}
                                />
                            </Stack>

                            <TableContainer sx={compactTableContainerSx}>
                                <Table sx={compactTableSx}>
                                    <colgroup>
                                        <col style={{ width: '14%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '8%' }} />
                                        <col style={{ width: '8%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '8%' }} />
                                        <col style={{ width: '32%' }} />
                                    </colgroup>
                                    <TableHead>
                                        <TableRow>
                                            {SORTABLE_COLUMNS.map(({ key, label }) => (
                                                <TableCell
                                                    key={key}
                                                    sortDirection={sortConfig.column === key ? sortConfig.direction : false}
                                                >
                                                    <TableSortLabel
                                                        active={sortConfig.column === key}
                                                        direction={sortConfig.column === key ? sortConfig.direction : 'asc'}
                                                        onClick={() => handleSortChange(key)}
                                                    >
                                                        {label}
                                                    </TableSortLabel>
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {!commandLines.length ? (
                                            <TableRow>
                                                <TableCell colSpan={8} sx={{ py: 3 }}>
                                                    <EmptyState
                                                        eyebrow="État vide"
                                                        title="Aucune commande générée"
                                                        description="Charge une sélection BOM, valide le stock dans l'onglet BOM, puis reviens ici pour préparer la commande."
                                                        actionLabel="Sélectionner une BOM"
                                                        onAction={() => navigate('/bom')}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ) : filteredSortedLines.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} sx={{ py: 2, textAlign: 'center', color: colors.textSecondary }}>
                                                    Aucun résultat pour « {filterText} »
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            paginatedCommandLines.map((line) => (
                                                <CommandLineRow
                                                    key={line.key}
                                                    line={line}
                                                    override={quantityOverrides[line.key]}
                                                    onOverrideChange={handleQuantityOverride}
                                                />
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            {filteredSortedLines.length > 0 && (
                                <TablePagination
                                    component="div"
                                    count={filteredSortedLines.length}
                                    page={page}
                                    onPageChange={(_event, nextPage) => setPage(nextPage)}
                                    rowsPerPage={rowsPerPage}
                                    onRowsPerPageChange={(event) => {
                                        setRowsPerPage(parseInt(event.target.value, 10));
                                        setPage(0);
                                    }}
                                    rowsPerPageOptions={[25, 50, 100]}
                                    sx={compactPaginationSx}
                                    labelRowsPerPage="Lignes"
                                />
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* ── Aperçu session ── */}
                <Grid item xs={12} xl={4}>
                    <Stack spacing={3}>
                        <Card sx={CARD_SX}>
                            <CardContent>
                                <Typography variant="h6" sx={{ mb: 1, color: colors.textPrimary, fontWeight: 600 }}>
                                    Règles appliquées
                                </Typography>
                                <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                                    La liste garde toutes les lignes, puis déduit le stock disponible vérifié dans BOM pour calculer la quantité à commander.
                                    Les poses manuelles restent visibles. Les quantités modifiées manuellement (colonne Commande) sont envoyées telles quelles à l'ERP.
                                </Typography>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent>
                                <Typography variant="h6" sx={{ mb: 2 }}>
                                    Aperçu session
                                </Typography>
                                <Stack spacing={1}>
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                        Sélection : {selectionLabel || 'Aucune'}
                                    </Typography>
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                            Stock validé :
                                        </Typography>
                                        <StockStatusChip
                                            isValidated={stockValidation.isValidated}
                                            isLoading={planningSyncState.loading}
                                        />
                                    </Stack>
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                        BOM chargées : {loadedEntryCount}/{selectedEntries.length || 0}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                        Lignes agrégées : {commandLines.length}
                                        {filterText ? ` (${filteredSortedLines.length} affichées)` : ''}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                        Besoin total : {totalRequiredQuantity}
                                    </Typography>
                                    <Typography component="div" variant="body2" sx={{ color: 'text.secondary' }}>
                                        À commander : {totalOrderQuantity}
                                        {overridesCount > 0 && (
                                            <Tooltip title="Inclut les quantités modifiées manuellement">
                                                <Chip
                                                    label="modifié"
                                                    size="small"
                                                    sx={{ ml: 1, height: 18, fontSize: '0.68rem', backgroundColor: 'rgba(5,150,105,0.18)', color: '#34d399' }}
                                                />
                                            </Tooltip>
                                        )}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                                        Calculé sur {selectedEntries.length} BOM
                                    </Typography>
                                </Stack>
                            </CardContent>
                        </Card>
                    </Stack>
                </Grid>
            </Grid>
        </Stack>
    );
}

export default CommandPage;
