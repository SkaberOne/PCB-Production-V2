import React from 'react';
import apiClient from '../../api/client';
import ConfirmDialog from '../common/ConfirmDialog';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import RuleRoundedIcon from '@mui/icons-material/RuleRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Grid,
    IconButton,
    MenuItem,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import {
    compactCellSx,
    compactTableContainerSx,
    compactTableSx,
} from '../../utils/compactTable';
import { emptyFeedback, safeDecodeFileName } from '../../utils/componentLibraryForm';
import { componentTypeOptions } from '../../utils/componentTypes';


const emptyTypeRule = {
    id: null,
    reference_prefix: '',
    mapped_type: 'UNDEFINED',
    requires_confirmation: false,
    priority: 100,
    enabled: true,
    description: '',
};

const maxTypeRuleHistoryEntries = 5;
const typeRulePreviewFilters = [
    { id: 'all', label: 'Tout' },
    { id: 'add', label: 'Ajouts' },
    { id: 'update', label: 'Modifications' },
    { id: 'remove', label: 'Suppressions' },
];

function serializeTypeRuleSnapshot(rule) {
    return {
        reference_prefix: rule.reference_prefix || '',
        mapped_type: rule.mapped_type || 'UNDEFINED',
        requires_confirmation: Boolean(rule.requires_confirmation),
        priority: Number(rule.priority || 100),
        enabled: Boolean(rule.enabled),
        description: rule.description || '',
    };
}

function formatTypeRuleHistoryTimestamp(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function areSerializedTypeRulesEqual(leftRule, rightRule) {
    return (
        (leftRule.reference_prefix || '') === (rightRule.reference_prefix || '')
        && (leftRule.mapped_type || 'UNDEFINED') === (rightRule.mapped_type || 'UNDEFINED')
        && Boolean(leftRule.requires_confirmation) === Boolean(rightRule.requires_confirmation)
        && Number(leftRule.priority || 100) === Number(rightRule.priority || 100)
        && Boolean(leftRule.enabled) === Boolean(rightRule.enabled)
        && (leftRule.description || '') === (rightRule.description || '')
    );
}

function formatTypeRuleFieldValue(field, value) {
    if (field === 'requires_confirmation') {
        return value ? 'A confirmer' : 'Direct';
    }
    if (field === 'enabled') {
        return value ? 'Active' : 'Inactive';
    }
    if (field === 'description') {
        return value || '(vide)';
    }
    if (field === 'priority') {
        return String(Number(value || 100));
    }
    return value || 'UNDEFINED';
}

function buildTypeRuleFieldChanges(currentRule, targetRule) {
    const fields = [
        { key: 'mapped_type', label: 'Type' },
        { key: 'requires_confirmation', label: 'Confirmation' },
        { key: 'priority', label: 'Priorité' },
        { key: 'enabled', label: 'État' },
        { key: 'description', label: 'Description' },
    ];

    const normalizedFieldValue = (field, value) => {
        if (field === 'requires_confirmation' || field === 'enabled') {
            return Boolean(value);
        }
        if (field === 'priority') {
            return Number(value || 100);
        }
        if (field === 'description') {
            return value || '';
        }
        return value || 'UNDEFINED';
    };

    return fields
        .filter(({ key }) => normalizedFieldValue(key, currentRule[key]) !== normalizedFieldValue(key, targetRule[key]))
        .map(({ key, label }) => ({
            field: key,
            label,
            before: formatTypeRuleFieldValue(key, currentRule[key]),
            after: formatTypeRuleFieldValue(key, targetRule[key]),
        }));
}

function buildTypeRuleHistoryPreview(currentRules, targetRules) {
    const currentMap = new Map(
        (currentRules || []).map((rule) => {
            const serializedRule = serializeTypeRuleSnapshot(rule);
            return [serializedRule.reference_prefix, serializedRule];
        }),
    );
    const targetMap = new Map(
        (targetRules || []).map((rule) => {
            const serializedRule = serializeTypeRuleSnapshot(rule);
            return [serializedRule.reference_prefix, serializedRule];
        }),
    );

    const toAdd = [];
    const toUpdate = [];
    const updateDetails = [];
    const toRemove = [];

    targetMap.forEach((targetRule, prefix) => {
        if (!currentMap.has(prefix)) {
            toAdd.push(prefix);
            return;
        }
        const currentRule = currentMap.get(prefix);
        if (!areSerializedTypeRulesEqual(currentRule, targetRule)) {
            toUpdate.push(prefix);
            updateDetails.push({
                prefix,
                changes: buildTypeRuleFieldChanges(currentRule, targetRule),
            });
        }
    });

    currentMap.forEach((_currentRule, prefix) => {
        if (!targetMap.has(prefix)) {
            toRemove.push(prefix);
        }
    });

    return {
        toAdd,
        toUpdate,
        updateDetails,
        toRemove,
        unchangedCount: Math.max(targetMap.size - toAdd.length - toUpdate.length, 0),
    };
}

function buildTypeRulePreviewExportText(historyEntry, preview, activeFilter) {
    if (!historyEntry || !preview) {
        return '';
    }

    const filterLabel = (typeRulePreviewFilters.find((item) => item.id === activeFilter) || typeRulePreviewFilters[0]).label;
    const includeAdd = activeFilter === 'all' || activeFilter === 'add';
    const includeUpdate = activeFilter === 'all' || activeFilter === 'update';
    const includeRemove = activeFilter === 'all' || activeFilter === 'remove';
    const lines = [
        'TYPE RULE PREVIEW EXPORT',
        `History entry: ${historyEntry.message || 'N/A'}`,
        `Captured at: ${formatTypeRuleHistoryTimestamp(historyEntry.created_at)}`,
        `Filter: ${filterLabel}`,
        '',
        'SUMMARY',
        `Added: ${preview.toAdd.length}`,
        `Updated: ${preview.toUpdate.length}`,
        `Removed: ${preview.toRemove.length}`,
        `Unchanged: ${preview.unchangedCount}`,
        '',
    ];

    if (includeAdd) {
        lines.push('ADDED RULES');
        if (preview.toAdd.length) {
            preview.toAdd.forEach((prefix) => lines.push(`- ${prefix}`));
        } else {
            lines.push('(none)');
        }
        lines.push('');
    }

    if (includeUpdate) {
        lines.push('UPDATED RULES');
        if (preview.updateDetails?.length) {
            preview.updateDetails.forEach((detail) => {
                lines.push(`- ${detail.prefix}`);
                detail.changes.forEach((change) => {
                    lines.push(`  ${change.label}: ${change.before} -> ${change.after}`);
                });
            });
        } else if (preview.toUpdate.length) {
            preview.toUpdate.forEach((prefix) => lines.push(`- ${prefix}`));
        } else {
            lines.push('(none)');
        }
        lines.push('');
    }

    if (includeRemove) {
        lines.push('REMOVED RULES');
        if (preview.toRemove.length) {
            preview.toRemove.forEach((prefix) => lines.push(`- ${prefix}`));
        } else {
            lines.push('(none)');
        }
        lines.push('');
    }

    return lines.join('\n').trim();
}

function sortSerializedTypeRules(rules) {
    return [...(rules || [])].sort((leftRule, rightRule) => (
        Number(leftRule.priority || 100) - Number(rightRule.priority || 100)
        || (String(rightRule.reference_prefix || '').length - String(leftRule.reference_prefix || '').length)
        || String(leftRule.reference_prefix || '').localeCompare(String(rightRule.reference_prefix || ''))
    ));
}

const SettingsTypeRuleTableRow = React.memo(function SettingsTypeRuleTableRow({
    canMoveDown,
    canMoveUp,
    disableDelete,
    disableDuplicate,
    disableSave,
    duplicatePriority,
    isDeleting,
    isDuplicating,
    isSaving,
    onDelete,
    onDuplicate,
    onReorder,
    onSave,
    onUpdateField,
    rule,
    typeOptions,
}) {
    const handleReferenceChange = React.useCallback((event) => {
        onUpdateField(rule.id, 'reference_prefix', event.target.value.toUpperCase());
    }, [onUpdateField, rule.id]);
    const handleMappedTypeChange = React.useCallback((event) => {
        onUpdateField(rule.id, 'mapped_type', event.target.value);
    }, [onUpdateField, rule.id]);
    const handleRequiresConfirmationChange = React.useCallback((event) => {
        onUpdateField(rule.id, 'requires_confirmation', event.target.value === 'required');
    }, [onUpdateField, rule.id]);
    const handlePriorityChange = React.useCallback((event) => {
        onUpdateField(rule.id, 'priority', event.target.value);
    }, [onUpdateField, rule.id]);
    const handleEnabledChange = React.useCallback((event) => {
        onUpdateField(rule.id, 'enabled', event.target.value === 'enabled');
    }, [onUpdateField, rule.id]);
    const handleDescriptionChange = React.useCallback((event) => {
        onUpdateField(rule.id, 'description', event.target.value);
    }, [onUpdateField, rule.id]);
    const handleMoveUp = React.useCallback(() => {
        onReorder(rule.id, 'up');
    }, [onReorder, rule.id]);
    const handleMoveDown = React.useCallback(() => {
        onReorder(rule.id, 'down');
    }, [onReorder, rule.id]);
    const handleDuplicate = React.useCallback(() => {
        onDuplicate(rule);
    }, [onDuplicate, rule]);
    const handleSave = React.useCallback(() => {
        onSave(rule);
    }, [onSave, rule]);
    const handleDelete = React.useCallback(() => {
        onDelete(rule);
    }, [onDelete, rule]);

    return (
        <TableRow hover>
            <TableCell sx={compactCellSx}>
                <TextField
                    fullWidth
                    size="small"
                    value={rule.reference_prefix || ''}
                    onChange={handleReferenceChange}
                />
            </TableCell>
            <TableCell sx={compactCellSx}>
                <TextField
                    fullWidth
                    select
                    size="small"
                    value={rule.mapped_type || 'UNDEFINED'}
                    onChange={handleMappedTypeChange}
                >
                    {typeOptions}
                </TextField>
            </TableCell>
            <TableCell sx={compactCellSx}>
                <TextField
                    fullWidth
                    select
                    size="small"
                    value={rule.requires_confirmation ? 'required' : 'direct'}
                    onChange={handleRequiresConfirmationChange}
                >
                    <MenuItem value="direct">Direct</MenuItem>
                    <MenuItem value="required">A confirmer</MenuItem>
                </TextField>
            </TableCell>
            <TableCell sx={compactCellSx}>
                <TextField
                    fullWidth
                    size="small"
                    type="number"
                    value={rule.priority ?? 100}
                    error={duplicatePriority}
                    onChange={handlePriorityChange}
                />
            </TableCell>
            <TableCell sx={compactCellSx}>
                <TextField
                    fullWidth
                    select
                    size="small"
                    value={rule.enabled ? 'enabled' : 'disabled'}
                    onChange={handleEnabledChange}
                >
                    <MenuItem value="enabled">Active</MenuItem>
                    <MenuItem value="disabled">Inactive</MenuItem>
                </TextField>
            </TableCell>
            <TableCell sx={compactCellSx}>
                <TextField
                    fullWidth
                    size="small"
                    value={rule.description || ''}
                    onChange={handleDescriptionChange}
                />
            </TableCell>
            <TableCell sx={compactCellSx}>
                <Stack direction={{ xs: 'column', xl: 'row' }} spacing={0.75}>
                    <Stack direction="row" spacing={0.25}>
                        <IconButton
                            size="small"
                            onClick={handleMoveUp}
                            disabled={!canMoveUp}
                            aria-label="Monter la règle dans la liste"
                            sx={{ border: '1px solid var(--border)', borderRadius: 1 }}
                        >
                            <KeyboardArrowUpRoundedIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                            size="small"
                            onClick={handleMoveDown}
                            disabled={!canMoveDown}
                            aria-label="Descendre la règle dans la liste"
                            sx={{ border: '1px solid var(--border)', borderRadius: 1 }}
                        >
                            <KeyboardArrowDownRoundedIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                    <Button
                        size="small"
                        variant="text"
                        startIcon={<ContentCopyRoundedIcon />}
                        onClick={handleDuplicate}
                        disabled={disableDuplicate}
                    >
                        {isDuplicating ? 'Duplication...' : 'Dupliquer'}
                    </Button>
                    <Button
                        size="small"
                        variant="outlined"
                        onClick={handleSave}
                        disabled={disableSave}
                    >
                        {isSaving ? 'Sauvegarde...' : 'Sauver'}
                    </Button>
                    <Button
                        size="small"
                        variant="text"
                        color="error"
                        startIcon={<DeleteOutlineRoundedIcon />}
                        onClick={handleDelete}
                        disabled={disableDelete}
                    >
                        {isDeleting ? 'Suppression...' : 'Supprimer'}
                    </Button>
                </Stack>
            </TableCell>
        </TableRow>
    );
});

function buildPartialTypeRuleRestore(currentRules, targetRules, selectedPrefixes) {
    const currentMap = new Map(
        (currentRules || []).map((rule) => {
            const serializedRule = serializeTypeRuleSnapshot(rule);
            return [serializedRule.reference_prefix, serializedRule];
        }),
    );
    const targetMap = new Map(
        (targetRules || []).map((rule) => {
            const serializedRule = serializeTypeRuleSnapshot(rule);
            return [serializedRule.reference_prefix, serializedRule];
        }),
    );

    (selectedPrefixes || []).forEach((prefix) => {
        if (!prefix) {
            return;
        }
        if (targetMap.has(prefix)) {
            currentMap.set(prefix, targetMap.get(prefix));
        } else {
            currentMap.delete(prefix);
        }
    });

    return sortSerializedTypeRules(Array.from(currentMap.values()));
}

function ReglesTypePanel() {
    const componentTypeRuleFileInputRef = React.useRef(null);
    const [componentTypeRules, setComponentTypeRules] = React.useState([]);
    const [componentTypeRuleSearch, setComponentTypeRuleSearch] = React.useState('');
    const [newTypeRule, setNewTypeRule] = React.useState(emptyTypeRule);
    const [componentTypeRuleLoading, setComponentTypeRuleLoading] = React.useState(false);
    const [componentTypeRuleCreating, setComponentTypeRuleCreating] = React.useState(false);
    const [componentTypeRuleDeletingId, setComponentTypeRuleDeletingId] = React.useState(null);
    const [confirmState, setConfirmState] = React.useState(null);
    const [componentTypeRuleDuplicatingId, setComponentTypeRuleDuplicatingId] = React.useState(null);
    const [componentTypeRuleExporting, setComponentTypeRuleExporting] = React.useState(false);
    const [componentTypeRuleImporting, setComponentTypeRuleImporting] = React.useState(false);
    const [componentTypeRuleReorderingId, setComponentTypeRuleReorderingId] = React.useState(null);
    const [componentTypeRuleSavingId, setComponentTypeRuleSavingId] = React.useState(null);
    const [componentTypeRuleResetting, setComponentTypeRuleResetting] = React.useState(false);
    const [componentTypeRuleHistory, setComponentTypeRuleHistory] = React.useState([]);
    const [componentTypeRulePreviewIndex, setComponentTypeRulePreviewIndex] = React.useState(0);
    const [componentTypeRulePreviewFilter, setComponentTypeRulePreviewFilter] = React.useState('all');
    const [componentTypeRulePreviewExporting, setComponentTypeRulePreviewExporting] = React.useState(false);
    const [componentTypeRulePreviewSelection, setComponentTypeRulePreviewSelection] = React.useState([]);
    const [componentTypeRulePartialRestoring, setComponentTypeRulePartialRestoring] = React.useState(false);
    const [componentTypeRuleUndoRestoring, setComponentTypeRuleUndoRestoring] = React.useState(false);
    const [componentTypeRuleFeedback, setComponentTypeRuleFeedback] = React.useState(emptyFeedback);
    const deferredComponentTypeRuleSearch = React.useDeferredValue(componentTypeRuleSearch);
    const componentTypeRuleSearchActive = Boolean(componentTypeRuleSearch.trim());
    const componentTypeMenuItems = React.useMemo(
        () => componentTypeOptions.map((option) => (
            <MenuItem key={option} value={option}>{option}</MenuItem>
        )),
        [],
    );
    const duplicatePriorityValues = React.useMemo(() => {
        // T-008 : une priorité partagée n'est AMBIGUË que si deux règles peuvent
        // matcher la même référence — c.-à-d. qu'un préfixe est lui-même préfixe
        // (au sens chaîne) de l'autre (ex. « ESP-MODULE » vs « ESP-MODULE_COPY »).
        // Des préfixes disjoints (LED / N$ / U$) qui partagent une priorité ne se
        // disputent jamais une référence : ce n'est pas un conflit, on ne l'alerte plus.
        const prefixesByPriority = componentTypeRules.reduce((accumulator, rule) => {
            const priorityKey = Number(rule.priority || 0);
            if (!accumulator.has(priorityKey)) {
                accumulator.set(priorityKey, []);
            }
            accumulator.get(priorityKey).push(String(rule.reference_prefix || ''));
            return accumulator;
        }, new Map());

        const prefixesOverlap = (a, b) => Boolean(a) && Boolean(b) && (a.startsWith(b) || b.startsWith(a));

        return new Set(
            Array.from(prefixesByPriority.entries())
                .filter(([, prefixes]) => prefixes.some(
                    (prefix, index) => prefixes.some(
                        (other, otherIndex) => index !== otherIndex && prefixesOverlap(prefix, other),
                    ),
                ))
                .map(([priority]) => priority),
        );
    }, [componentTypeRules]);
    const latestTypeRuleHistoryEntry = componentTypeRuleHistory[0] || null;
    const selectedTypeRuleHistoryEntry = componentTypeRuleHistory[componentTypeRulePreviewIndex] || latestTypeRuleHistoryEntry || null;
    const selectedTypeRuleHistoryPreview = React.useMemo(() => {
        if (!selectedTypeRuleHistoryEntry || componentTypeRuleSearchActive) {
            return null;
        }
        return buildTypeRuleHistoryPreview(componentTypeRules, selectedTypeRuleHistoryEntry.rules);
    }, [componentTypeRuleSearchActive, componentTypeRules, selectedTypeRuleHistoryEntry]);
    const selectedTypeRuleHistoryPrefixes = React.useMemo(() => {
        if (!selectedTypeRuleHistoryPreview) {
            return [];
        }
        return Array.from(new Set([
            ...selectedTypeRuleHistoryPreview.toAdd,
            ...selectedTypeRuleHistoryPreview.toUpdate,
            ...selectedTypeRuleHistoryPreview.toRemove,
        ]));
    }, [selectedTypeRuleHistoryPreview]);
    const previewShowsAdd = componentTypeRulePreviewFilter === 'all' || componentTypeRulePreviewFilter === 'add';
    const previewShowsUpdate = componentTypeRulePreviewFilter === 'all' || componentTypeRulePreviewFilter === 'update';
    const previewShowsRemove = componentTypeRulePreviewFilter === 'all' || componentTypeRulePreviewFilter === 'remove';
    const visibleTypeRulePreviewPrefixes = React.useMemo(() => {
        if (!selectedTypeRuleHistoryPreview) {
            return [];
        }
        if (componentTypeRulePreviewFilter === 'add') {
            return selectedTypeRuleHistoryPreview.toAdd;
        }
        if (componentTypeRulePreviewFilter === 'update') {
            return selectedTypeRuleHistoryPreview.toUpdate;
        }
        if (componentTypeRulePreviewFilter === 'remove') {
            return selectedTypeRuleHistoryPreview.toRemove;
        }
        return selectedTypeRuleHistoryPrefixes;
    }, [componentTypeRulePreviewFilter, selectedTypeRuleHistoryPreview, selectedTypeRuleHistoryPrefixes]);
    const loadComponentTypeRules = React.useCallback(async () => {
        setComponentTypeRuleLoading(true);
        try {
            const response = await apiClient.get(`/bom/component-type-rules`, {
                params: {
                    ...(deferredComponentTypeRuleSearch.trim()
                        ? { search: deferredComponentTypeRuleSearch.trim() }
                        : {}),
                },
            });
            setComponentTypeRules(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            setComponentTypeRules([]);
            setComponentTypeRuleFeedback({
                status: 'error',
                message: error.response?.data?.detail || error.response?.data?.message || error.message || 'Erreur lors du chargement des règles de type',
                details: [],
            });
        } finally {
            setComponentTypeRuleLoading(false);
        }
    }, [deferredComponentTypeRuleSearch]);
    React.useEffect(() => { loadComponentTypeRules(); }, [loadComponentTypeRules]);
    const fetchFullComponentTypeRuleSnapshot = React.useCallback(async () => {
        const response = await apiClient.get(`/bom/component-type-rules`);
        const rules = Array.isArray(response.data) ? response.data : [];
        return rules.map(serializeTypeRuleSnapshot);
    }, []);
    const pushTypeRuleHistory = React.useCallback((message, rules) => {
        if (!Array.isArray(rules) || !rules.length) {
            return;
        }
        setComponentTypeRulePreviewIndex(0);
        setComponentTypeRuleHistory((current) => [
            {
                message,
                rules,
                created_at: Date.now(),
            },
            ...current,
        ].slice(0, maxTypeRuleHistoryEntries));
    }, []);
    React.useEffect(() => {
        if (!componentTypeRuleHistory.length) {
            setComponentTypeRulePreviewIndex(0);
            setComponentTypeRulePreviewFilter('all');
            setComponentTypeRulePreviewSelection([]);
            return;
        }
        if (componentTypeRulePreviewIndex >= componentTypeRuleHistory.length) {
            setComponentTypeRulePreviewIndex(0);
        }
    }, [componentTypeRuleHistory, componentTypeRulePreviewIndex]);
    React.useEffect(() => {
        setComponentTypeRulePreviewSelection(selectedTypeRuleHistoryPrefixes);
    }, [selectedTypeRuleHistoryEntry, selectedTypeRuleHistoryPrefixes]);
    const updateTypeRuleField = React.useCallback((ruleId, field, value) => {
        setComponentTypeRules((current) => current.map((rule) => (
            rule.id === ruleId
                ? { ...rule, [field]: value }
                : rule
        )));
    }, []);
    const saveTypeRule = React.useCallback(async (rule) => {
        if (!rule?.id || !String(rule.reference_prefix || '').trim()) {
            setComponentTypeRuleFeedback({
                status: 'error',
                message: 'Le préfixe de référence est obligatoire pour sauvegarder une règle.',
                details: [],
            });
            return;
        }

        setComponentTypeRuleSavingId(rule.id);
        setComponentTypeRuleFeedback(emptyFeedback);
        try {
            const snapshotRules = await fetchFullComponentTypeRuleSnapshot();
            const response = await apiClient.put(`/bom/component-type-rules/${rule.id}`, {
                reference_prefix: rule.reference_prefix,
                mapped_type: rule.mapped_type || 'UNDEFINED',
                requires_confirmation: Boolean(rule.requires_confirmation),
                priority: Number(rule.priority || 100),
                enabled: Boolean(rule.enabled),
                description: rule.description || null,
            });
            const savedRule = response.data;
            setComponentTypeRules((current) => current.map((item) => (
                item.id === savedRule.id ? savedRule : item
            )));
            pushTypeRuleHistory(`Mise a jour de ${savedRule.reference_prefix}`, snapshotRules);
            setComponentTypeRuleFeedback({
                status: 'success',
                message: `Règle ${savedRule.reference_prefix} mise à jour.`,
                details: [],
            });
        } catch (error) {
            setComponentTypeRuleFeedback({
                status: 'error',
                message: error.response?.data?.detail || error.response?.data?.message || error.message || 'Erreur lors de la sauvegarde de la règle',
                details: [],
            });
        } finally {
            setComponentTypeRuleSavingId(null);
        }
    }, [fetchFullComponentTypeRuleSnapshot, pushTypeRuleHistory]);
    const createTypeRule = async () => {
        if (!String(newTypeRule.reference_prefix || '').trim()) {
            setComponentTypeRuleFeedback({
                status: 'error',
                message: 'Renseigne un préfixe avant d\'ajouter une nouvelle règle.',
                details: [],
            });
            return;
        }

        setComponentTypeRuleCreating(true);
        setComponentTypeRuleFeedback(emptyFeedback);
        try {
            const snapshotRules = await fetchFullComponentTypeRuleSnapshot();
            const response = await apiClient.post(`/bom/component-type-rules`, {
                reference_prefix: newTypeRule.reference_prefix,
                mapped_type: newTypeRule.mapped_type || 'UNDEFINED',
                requires_confirmation: Boolean(newTypeRule.requires_confirmation),
                priority: Number(newTypeRule.priority || 100),
                enabled: Boolean(newTypeRule.enabled),
                description: newTypeRule.description || null,
            });
            setNewTypeRule(emptyTypeRule);
            pushTypeRuleHistory(`Ajout de ${response.data.reference_prefix}`, snapshotRules);
            setComponentTypeRuleFeedback({
                status: 'success',
                message: `Règle ${response.data.reference_prefix} ajoutée.`,
                details: [],
            });
            await loadComponentTypeRules();
        } catch (error) {
            setComponentTypeRuleFeedback({
                status: 'error',
                message: error.response?.data?.detail || error.response?.data?.message || error.message || 'Erreur lors de la création de la règle',
                details: [],
            });
        } finally {
            setComponentTypeRuleCreating(false);
        }
    };
    const performDeleteTypeRule = React.useCallback(async (rule) => {
        if (!rule?.id) {
            return;
        }
        const ruleLabel = String(rule.reference_prefix || '').trim() || `#${rule.id}`;
        setComponentTypeRuleDeletingId(rule.id);
        setComponentTypeRuleFeedback(emptyFeedback);
        try {
            const snapshotRules = await fetchFullComponentTypeRuleSnapshot();
            const response = await apiClient.delete(`/bom/component-type-rules/${rule.id}`);
            setComponentTypeRules((current) => current.filter((item) => item.id !== rule.id));
            pushTypeRuleHistory(`Suppression de ${ruleLabel}`, snapshotRules);
            setComponentTypeRuleFeedback({
                status: 'success',
                message: response.data?.message || `Règle ${ruleLabel} supprimée.`,
                details: [],
            });
        } catch (error) {
            setComponentTypeRuleFeedback({
                status: 'error',
                message: error.response?.data?.detail || error.response?.data?.message || error.message || 'Erreur lors de la suppression de la règle',
                details: [],
            });
        } finally {
            setComponentTypeRuleDeletingId(null);
        }
    }, [fetchFullComponentTypeRuleSnapshot, pushTypeRuleHistory]);
    const deleteTypeRule = React.useCallback((rule) => {
        if (!rule?.id) {
            return;
        }
        const ruleLabel = String(rule.reference_prefix || '').trim() || `#${rule.id}`;
        setConfirmState({
            title: 'Supprimer la règle',
            message: `La règle ${ruleLabel} sera supprimée. Cette action est irréversible.`,
            confirmLabel: 'Supprimer',
            severity: 'error',
            onConfirm: () => performDeleteTypeRule(rule),
        });
    }, [performDeleteTypeRule]);
    const performResetTypeRules = async () => {
        setComponentTypeRuleResetting(true);
        setComponentTypeRuleFeedback(emptyFeedback);
        try {
            const snapshotRules = await fetchFullComponentTypeRuleSnapshot();
            const response = await apiClient.post(`/bom/component-type-rules/reset`);
            setNewTypeRule(emptyTypeRule);
            pushTypeRuleHistory('Réinitialisation des règles', snapshotRules);
            setComponentTypeRuleFeedback({
                status: 'success',
                message: response.data?.message || 'Règles de type réinitialisées.',
                details: response.data?.rule_count ? [`${response.data.rule_count} règle(s) active(s) après réinitialisation.`] : [],
            });
            await loadComponentTypeRules();
        } catch (error) {
            setComponentTypeRuleFeedback({
                status: 'error',
                message: error.response?.data?.detail || error.response?.data?.message || error.message || 'Erreur lors de la réinitialisation des règles',
                details: [],
            });
        } finally {
            setComponentTypeRuleResetting(false);
        }
    };
    const resetTypeRules = () => {
        setConfirmState({
            title: 'Réinitialiser les règles',
            message: 'Toutes les règles de type seront réinitialisées aux valeurs par défaut. Cette action est irréversible.',
            confirmLabel: 'Réinitialiser',
            severity: 'warning',
            onConfirm: () => performResetTypeRules(),
        });
    };
    const duplicateTypeRule = React.useCallback(async (rule) => {
        if (!rule?.id) {
            return;
        }

        setComponentTypeRuleDuplicatingId(rule.id);
        setComponentTypeRuleFeedback(emptyFeedback);
        try {
            const snapshotRules = await fetchFullComponentTypeRuleSnapshot();
            const response = await apiClient.post(`/bom/component-type-rules/${rule.id}/duplicate`);
            pushTypeRuleHistory(`Duplication de ${rule.reference_prefix}`, snapshotRules);
            setComponentTypeRuleFeedback({
                status: 'success',
                message: `Règle ${response.data.reference_prefix} dupliquée.`,
                details: [],
            });
            await loadComponentTypeRules();
        } catch (error) {
            setComponentTypeRuleFeedback({
                status: 'error',
                message: error.response?.data?.detail || error.response?.data?.message || error.message || 'Erreur lors de la duplication de la règle',
                details: [],
            });
        } finally {
            setComponentTypeRuleDuplicatingId(null);
        }
    }, [fetchFullComponentTypeRuleSnapshot, loadComponentTypeRules, pushTypeRuleHistory]);
    const exportTypeRules = async () => {
        setComponentTypeRuleExporting(true);
        setComponentTypeRuleFeedback(emptyFeedback);
        try {
            const response = await apiClient.get(`/bom/component-type-rules/export`, { responseType: 'blob' });
            const blob = new Blob([response.data], { type: response.headers?.['content-type'] || 'application/json' });
            const blobUrl = window.URL.createObjectURL(blob);
            const match = (response.headers?.['content-disposition'] || '').match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = safeDecodeFileName(match?.[1] || match?.[2] || 'component-type-rules.json');
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);
            setComponentTypeRuleFeedback({
                status: 'success',
                message: 'Export JSON des règles de type lancé.',
                details: [],
            });
        } catch (error) {
            setComponentTypeRuleFeedback({
                status: 'error',
                message: error.response?.data?.detail || error.response?.data?.message || error.message || "Erreur lors de l'export des règles de type",
                details: [],
            });
        } finally {
            setComponentTypeRuleExporting(false);
        }
    };
    const importTypeRules = async (event) => {
        const nextFile = event.target.files?.[0] || null;
        if (!nextFile) {
            return;
        }

        setComponentTypeRuleImporting(true);
        setComponentTypeRuleFeedback(emptyFeedback);
        try {
            const snapshotRules = await fetchFullComponentTypeRuleSnapshot();
            const formData = new FormData();
            formData.append('file', nextFile);
            const response = await apiClient.post(`/bom/component-type-rules/import`, formData);
            pushTypeRuleHistory(`Import JSON ${nextFile.name}`, snapshotRules);
            setComponentTypeRuleFeedback({
                status: response.data?.success === false ? 'warning' : 'success',
                message: response.data?.message || 'Import des règles terminé.',
                details: Array.isArray(response.data?.errors) ? response.data.errors : [],
            });
            await loadComponentTypeRules();
        } catch (error) {
            setComponentTypeRuleFeedback({
                status: 'error',
                message: error.response?.data?.detail || error.response?.data?.message || error.message || "Erreur lors de l'import des règles de type",
                details: [],
            });
        } finally {
            if (componentTypeRuleFileInputRef.current) {
                componentTypeRuleFileInputRef.current.value = '';
            }
            setComponentTypeRuleImporting(false);
        }
    };
    const reorderTypeRule = React.useCallback(async (ruleId, direction) => {
        if (componentTypeRuleSearchActive) {
            setComponentTypeRuleFeedback({
                status: 'warning',
                message: 'Efface la recherche avant de réordonner les règles.',
                details: [],
            });
            return;
        }

        const currentIndex = componentTypeRules.findIndex((rule) => rule.id === ruleId);
        if (currentIndex < 0) {
            return;
        }

        const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (nextIndex < 0 || nextIndex >= componentTypeRules.length) {
            return;
        }

        const reorderedRules = [...componentTypeRules];
        const [movedRule] = reorderedRules.splice(currentIndex, 1);
        reorderedRules.splice(nextIndex, 0, movedRule);
        const orderedRuleIds = reorderedRules.map((rule) => rule.id).filter((value) => value != null);

        setComponentTypeRuleReorderingId(ruleId);
        setComponentTypeRuleFeedback(emptyFeedback);
        setComponentTypeRules(reorderedRules);
        try {
            const snapshotRules = await fetchFullComponentTypeRuleSnapshot();
            const response = await apiClient.post(`/bom/component-type-rules/reorder`, {
                ordered_rule_ids: orderedRuleIds,
            });
            pushTypeRuleHistory(`Reordonnancement de ${movedRule.reference_prefix || ruleId}`, snapshotRules);
            setComponentTypeRuleFeedback({
                status: 'success',
                message: response.data?.message || 'Ordre des règles mis à jour.',
                details: [],
            });
            await loadComponentTypeRules();
        } catch (error) {
            setComponentTypeRuleFeedback({
                status: 'error',
                message: error.response?.data?.detail || error.response?.data?.message || error.message || "Erreur lors du réordonnancement des règles",
                details: [],
            });
            await loadComponentTypeRules();
        } finally {
            setComponentTypeRuleReorderingId(null);
        }
    }, [
        componentTypeRuleSearchActive,
        componentTypeRules,
        fetchFullComponentTypeRuleSnapshot,
        loadComponentTypeRules,
        pushTypeRuleHistory,
    ]);
    const restoreTypeRuleHistoryEntry = async (historyIndex) => {
        const historyEntry = componentTypeRuleHistory[historyIndex];
        if (!historyEntry?.rules?.length) {
            return;
        }

        setComponentTypeRuleUndoRestoring(true);
        setComponentTypeRuleFeedback(emptyFeedback);
        try {
            const response = await apiClient.post(`/bom/component-type-rules/replace`, {
                rules: historyEntry.rules,
            });
            setComponentTypeRuleFeedback({
                status: 'success',
                message: response.data?.message || 'Catalogue des règles restauré.',
                details: historyEntry.message ? [`Restauration: ${historyEntry.message}`] : [],
            });
            setComponentTypeRuleHistory((current) => current.slice(historyIndex + 1));
            await loadComponentTypeRules();
        } catch (error) {
            setComponentTypeRuleFeedback({
                status: 'error',
                message: error.response?.data?.detail || error.response?.data?.message || error.message || "Erreur lors de la restauration de l'historique",
                details: [],
            });
        } finally {
            setComponentTypeRuleUndoRestoring(false);
        }
    };
    const undoLastTypeRuleMutation = async () => {
        await restoreTypeRuleHistoryEntry(0);
    };
    const exportSelectedTypeRulePreviewAsTxt = async () => {
        if (!selectedTypeRuleHistoryEntry || !selectedTypeRuleHistoryPreview || componentTypeRuleSearchActive) {
            return;
        }

        setComponentTypeRulePreviewExporting(true);
        try {
            const exportText = buildTypeRulePreviewExportText(
                selectedTypeRuleHistoryEntry,
                selectedTypeRuleHistoryPreview,
                componentTypeRulePreviewFilter,
            );
            const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
            const blobUrl = window.URL.createObjectURL(blob);
            const safeLabel = String(selectedTypeRuleHistoryEntry.message || 'type-rule-preview')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                || 'type-rule-preview';
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `${safeLabel}.txt`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);
            setComponentTypeRuleFeedback({
                status: 'success',
                message: 'Export TXT de l apercu genere.',
                details: [],
            });
        } finally {
            setComponentTypeRulePreviewExporting(false);
        }
    };
    const toggleTypeRulePreviewSelection = (prefix) => {
        if (!prefix) {
            return;
        }
        setComponentTypeRulePreviewSelection((current) => (
            current.includes(prefix)
                ? current.filter((value) => value !== prefix)
                : [...current, prefix]
        ));
    };
    const selectVisibleTypeRulePreviewPrefixes = () => {
        setComponentTypeRulePreviewSelection((current) => Array.from(new Set([
            ...current,
            ...visibleTypeRulePreviewPrefixes,
        ])));
    };
    const clearTypeRulePreviewSelection = () => {
        setComponentTypeRulePreviewSelection([]);
    };
    const restoreSelectedTypeRulePreviewPrefixes = async () => {
        if (!selectedTypeRuleHistoryEntry || !componentTypeRulePreviewSelection.length || componentTypeRuleSearchActive) {
            return;
        }

        setComponentTypeRulePartialRestoring(true);
        setComponentTypeRuleFeedback(emptyFeedback);
        try {
            const currentRules = await fetchFullComponentTypeRuleSnapshot();
            const mergedRules = buildPartialTypeRuleRestore(
                currentRules,
                selectedTypeRuleHistoryEntry.rules,
                componentTypeRulePreviewSelection,
            );
            const response = await apiClient.post(`/bom/component-type-rules/replace`, {
                rules: mergedRules,
            });
            pushTypeRuleHistory(
                `Restauration partielle (${componentTypeRulePreviewSelection.length})`,
                currentRules,
            );
            setComponentTypeRuleFeedback({
                status: 'success',
                message: response.data?.message || 'Restauration partielle appliquee.',
                details: [`${componentTypeRulePreviewSelection.length} règle(s) restaurée(s) depuis l'historique.`],
            });
            await loadComponentTypeRules();
        } catch (error) {
            setComponentTypeRuleFeedback({
                status: 'error',
                message: error.response?.data?.detail || error.response?.data?.message || error.message || 'Erreur lors de la restauration partielle',
                details: [],
            });
        } finally {
            setComponentTypeRulePartialRestoring(false);
        }
    };
    const typeRuleTableRows = React.useMemo(() => componentTypeRules.map((rule, index) => {
        const moveDisabled = (
            componentTypeRuleSearchActive
            || componentTypeRuleResetting
            || componentTypeRuleSavingId !== null
            || componentTypeRuleDeletingId !== null
            || componentTypeRuleDuplicatingId !== null
            || componentTypeRuleCreating
            || componentTypeRuleImporting
            || componentTypeRuleExporting
            || componentTypeRuleUndoRestoring
            || (componentTypeRuleReorderingId !== null && componentTypeRuleReorderingId !== rule.id)
        );
        const duplicateDisabled = (
            componentTypeRuleResetting
            || componentTypeRuleSavingId !== null
            || componentTypeRuleDeletingId !== null
            || componentTypeRuleReorderingId !== null
            || componentTypeRuleCreating
            || componentTypeRuleImporting
            || componentTypeRuleExporting
            || componentTypeRuleUndoRestoring
            || (componentTypeRuleDuplicatingId !== null && componentTypeRuleDuplicatingId !== rule.id)
        );
        const saveDisabled = (
            componentTypeRuleResetting
            || componentTypeRuleDeletingId !== null
            || componentTypeRuleDuplicatingId !== null
            || componentTypeRuleReorderingId !== null
            || componentTypeRuleCreating
            || componentTypeRuleImporting
            || componentTypeRuleExporting
            || componentTypeRuleUndoRestoring
            || (componentTypeRuleSavingId !== null && componentTypeRuleSavingId !== rule.id)
        );
        const deleteDisabled = (
            componentTypeRuleResetting
            || componentTypeRuleSavingId !== null
            || componentTypeRuleDuplicatingId !== null
            || componentTypeRuleReorderingId !== null
            || componentTypeRuleCreating
            || componentTypeRuleImporting
            || componentTypeRuleExporting
            || componentTypeRuleUndoRestoring
            || (componentTypeRuleDeletingId !== null && componentTypeRuleDeletingId !== rule.id)
        );

        return (
            <SettingsTypeRuleTableRow
                key={rule.id}
                canMoveUp={!moveDisabled && index > 0}
                canMoveDown={!moveDisabled && index < componentTypeRules.length - 1}
                disableDelete={deleteDisabled}
                disableDuplicate={duplicateDisabled}
                disableSave={saveDisabled}
                duplicatePriority={duplicatePriorityValues.has(Number(rule.priority ?? 0))}
                isDeleting={componentTypeRuleDeletingId === rule.id}
                isDuplicating={componentTypeRuleDuplicatingId === rule.id}
                isSaving={componentTypeRuleSavingId === rule.id}
                onDelete={deleteTypeRule}
                onDuplicate={duplicateTypeRule}
                onReorder={reorderTypeRule}
                onSave={saveTypeRule}
                onUpdateField={updateTypeRuleField}
                rule={rule}
                typeOptions={componentTypeMenuItems}
            />
        );
    }), [
        componentTypeMenuItems,
        componentTypeRuleCreating,
        componentTypeRuleDeletingId,
        componentTypeRuleDuplicatingId,
        componentTypeRuleExporting,
        componentTypeRuleImporting,
        componentTypeRuleReorderingId,
        componentTypeRuleResetting,
        componentTypeRuleSavingId,
        componentTypeRuleSearchActive,
        componentTypeRuleUndoRestoring,
        componentTypeRules,
        deleteTypeRule,
        duplicatePriorityValues,
        duplicateTypeRule,
        reorderTypeRule,
        saveTypeRule,
        updateTypeRuleField,
    ]);

    return (
        <Stack spacing={3}>
                    {componentTypeRuleFeedback.status !== 'idle' ? (
                        <Alert
                            severity={componentTypeRuleFeedback.status}
                            onClose={() => setComponentTypeRuleFeedback(emptyFeedback)}
                            action={latestTypeRuleHistoryEntry?.rules?.length ? (
                                <Button color="inherit" size="small" onClick={undoLastTypeRuleMutation} disabled={componentTypeRuleUndoRestoring}>
                                    {componentTypeRuleUndoRestoring ? 'Undo...' : `Undo (${componentTypeRuleHistory.length})`}
                                </Button>
                            ) : null}
                        >
                            <Stack spacing={1}>
                                <span>{componentTypeRuleFeedback.message}</span>
                                {componentTypeRuleFeedback.details?.length ? (
                                    <Box component="ul" sx={{ mb: 0, mt: 0, pl: 2.5 }}>
                                        {componentTypeRuleFeedback.details.map((detail) => (
                                            <li key={detail}>{detail}</li>
                                        ))}
                                    </Box>
                                ) : null}
                            </Stack>
                        </Alert>
                    ) : null}
            <Card sx={{ backgroundColor: '#18181b', border: '1px solid #1f2937' }}>
                <CardContent>
                    <Stack spacing={3}>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', md: 'center' }}>
                            <RuleRoundedIcon sx={{ color: '#3b82f6' }} />
                            <Stack spacing={0.5} sx={{ flexGrow: 1 }}>
                                <Typography variant="h6">Règles de type par Référence</Typography>
                                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                                    Ces règles pilotent l'inférence automatique du type de composant à partir de la référence BOM.
                                </Typography>
                            </Stack>
                            <Chip size="small" variant="outlined" label={`${componentTypeRules.length} règle(s)`} />
                            {componentTypeRuleLoading ? <Chip size="small" color="info" variant="outlined" label="Chargement..." /> : null}
                            <input
                                ref={componentTypeRuleFileInputRef}
                                type="file"
                                accept=".json,application/json"
                                onChange={importTypeRules}
                                style={{ display: 'none' }}
                            />
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<UploadFileRoundedIcon />}
                                onClick={() => componentTypeRuleFileInputRef.current?.click()}
                                disabled={componentTypeRuleImporting || componentTypeRuleLoading || componentTypeRuleResetting || componentTypeRuleSavingId !== null || componentTypeRuleDeletingId !== null || componentTypeRuleDuplicatingId !== null || componentTypeRuleReorderingId !== null || componentTypeRuleUndoRestoring || componentTypeRulePartialRestoring}
                            >
                                {componentTypeRuleImporting ? 'Import...' : 'Importer JSON'}
                            </Button>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<DownloadRoundedIcon />}
                                onClick={exportTypeRules}
                                disabled={componentTypeRuleExporting || componentTypeRuleLoading || componentTypeRuleResetting || componentTypeRuleSavingId !== null || componentTypeRuleDeletingId !== null || componentTypeRuleDuplicatingId !== null || componentTypeRuleReorderingId !== null || componentTypeRuleUndoRestoring || componentTypeRulePartialRestoring}
                            >
                                {componentTypeRuleExporting ? 'Export...' : 'Exporter JSON'}
                            </Button>
                            <Button
                                variant="outlined"
                                color="warning"
                                size="small"
                                startIcon={<RestartAltRoundedIcon />}
                                onClick={resetTypeRules}
                                disabled={componentTypeRuleLoading || componentTypeRuleCreating || componentTypeRuleSavingId !== null || componentTypeRuleDeletingId !== null || componentTypeRuleDuplicatingId !== null || componentTypeRuleImporting || componentTypeRuleExporting || componentTypeRuleReorderingId !== null || componentTypeRuleUndoRestoring || componentTypeRulePartialRestoring || componentTypeRuleResetting}
                            >
                                {componentTypeRuleResetting ? 'Reset...' : 'Réinitialiser'}
                            </Button>
                        </Stack>

                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
                            <TextField
                                fullWidth
                                size="small"
                                label="Recherche règles"
                                placeholder="Préfixe, type, description..."
                                value={componentTypeRuleSearch}
                                onChange={(event) => setComponentTypeRuleSearch(event.target.value)}
                            />
                            <Button
                                variant="text"
                                onClick={loadComponentTypeRules}
                                disabled={componentTypeRuleLoading || componentTypeRuleCreating || componentTypeRuleSavingId !== null || componentTypeRuleDeletingId !== null || componentTypeRuleDuplicatingId !== null || componentTypeRuleImporting || componentTypeRuleExporting || componentTypeRuleReorderingId !== null || componentTypeRuleUndoRestoring || componentTypeRulePartialRestoring || componentTypeRuleResetting}
                            >
                                Actualiser
                            </Button>
                        </Stack>
                        {componentTypeRuleHistory.length ? (
                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', md: 'center' }} useFlexGap>
                                <Chip
                                    size="small"
                                    color="info"
                                    variant="outlined"
                                    label={`Historique local: ${componentTypeRuleHistory.length}/${maxTypeRuleHistoryEntries}`}
                                />
                                {componentTypeRuleHistory.slice(0, 3).map((entry, index) => (
                                    <Chip
                                        key={`${entry.created_at}-${index}`}
                                        size="small"
                                        variant="outlined"
                                        label={entry.message}
                                    />
                                ))}
                            </Stack>
                        ) : null}
                        {componentTypeRuleHistory.length ? (
                            <Card variant="outlined" sx={{ borderColor: 'var(--border)' }}>
                                <CardContent sx={{ py: 2 }}>
                                    <Stack spacing={1.5}>
                                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
                                            <Stack spacing={0.25}>
                                                <Typography variant="subtitle2">Historique detaille</Typography>
                                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                    Restaure un état précédent du catalogue de règles. Les entrées plus récentes seront retirées de la pile.
                                                </Typography>
                                            </Stack>
                                            <Button
                                                size="small"
                                                variant="text"
                                                color="inherit"
                                                onClick={() => setComponentTypeRuleHistory([])}
                                                disabled={componentTypeRuleUndoRestoring || componentTypeRulePartialRestoring}
                                            >
                                                Effacer l historique
                                            </Button>
                                        </Stack>
                                        <Stack spacing={1}>
                                            {componentTypeRuleHistory.map((entry, index) => (
                                                <Stack
                                                    key={`${entry.created_at}-${index}`}
                                                    direction={{ xs: 'column', md: 'row' }}
                                                    spacing={1}
                                                    alignItems={{ xs: 'flex-start', md: 'center' }}
                                                    justifyContent="space-between"
                                                    sx={{
                                                        py: 1,
                                                        borderTop: index === 0 ? 'none' : '1px solid var(--border)',
                                                    }}
                                                >
                                                    <Stack spacing={0.25} sx={{ flexGrow: 1 }}>
                                                        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                                                            <Typography variant="body2">{entry.message}</Typography>
                                                            {index === 0 ? <Chip size="small" color="primary" variant="outlined" label="Derniere" /> : null}
                                                            {componentTypeRulePreviewIndex === index ? <Chip size="small" color="info" variant="outlined" label="Aperçu actif" /> : null}
                                                        </Stack>
                                                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                            {`${formatTypeRuleHistoryTimestamp(entry.created_at)} - ${entry.rules.length} règle(s) capturée(s)`}
                                                        </Typography>
                                                    </Stack>
                                                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                                                        <Button
                                                            size="small"
                                                            variant="text"
                                                            onClick={() => setComponentTypeRulePreviewIndex(index)}
                                                            disabled={componentTypeRuleUndoRestoring || componentTypeRulePartialRestoring}
                                                        >
                                                            Voir diff
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            variant={index === 0 ? 'contained' : 'outlined'}
                                                            onClick={() => restoreTypeRuleHistoryEntry(index)}
                                                            disabled={componentTypeRuleUndoRestoring || componentTypeRulePartialRestoring}
                                                        >
                                                            {index === 0 ? 'Undo latest' : 'Restaurer cet état'}
                                                        </Button>
                                                    </Stack>
                                                </Stack>
                                            ))}
                                        </Stack>
                                        {selectedTypeRuleHistoryEntry ? (
                                            <Card variant="outlined" sx={{ borderColor: 'var(--border)', backgroundColor: 'rgba(15, 23, 42, 0.35)' }}>
                                                <CardContent sx={{ py: 2 }}>
                                                    <Stack spacing={1.5}>
                                                        <Stack spacing={0.35}>
                                                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
                                                                <Typography variant="subtitle2">Aperçu avant restauration</Typography>
                                                                <Button
                                                                    size="small"
                                                                    variant="outlined"
                                                                    startIcon={<DownloadRoundedIcon />}
                                                                    onClick={exportSelectedTypeRulePreviewAsTxt}
                                                                    disabled={componentTypeRuleUndoRestoring || componentTypeRulePartialRestoring || componentTypeRulePreviewExporting || componentTypeRuleSearchActive || !selectedTypeRuleHistoryPreview}
                                                                >
                                                                    {componentTypeRulePreviewExporting ? 'Export TXT...' : 'Exporter TXT'}
                                                                </Button>
                                                            </Stack>
                                                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                                {selectedTypeRuleHistoryEntry.message}
                                                            </Typography>
                                                        </Stack>
                                                        {componentTypeRuleSearchActive ? (
                                                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                                                Efface la recherche pour voir un apercu complet du diff.
                                                            </Typography>
                                                        ) : selectedTypeRuleHistoryPreview ? (
                                                            <>
                                                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} useFlexGap flexWrap="wrap">
                                                                    <Chip size="small" color="success" variant="outlined" label={`${selectedTypeRuleHistoryPreview.toAdd.length} ajout(s)`} />
                                                                    <Chip size="small" color="warning" variant="outlined" label={`${selectedTypeRuleHistoryPreview.toUpdate.length} mise(s) a jour`} />
                                                                    <Chip size="small" color="error" variant="outlined" label={`${selectedTypeRuleHistoryPreview.toRemove.length} suppression(s)`} />
                                                                    <Chip size="small" variant="outlined" label={`${selectedTypeRuleHistoryPreview.unchangedCount} inchangee(s)`} />
                                                                </Stack>
                                                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} useFlexGap flexWrap="wrap">
                                                                    {typeRulePreviewFilters.map((filterOption) => (
                                                                        <Chip
                                                                            key={filterOption.id}
                                                                            size="small"
                                                                            clickable
                                                                            color={componentTypeRulePreviewFilter === filterOption.id ? 'primary' : 'default'}
                                                                            variant={componentTypeRulePreviewFilter === filterOption.id ? 'filled' : 'outlined'}
                                                                            label={filterOption.label}
                                                                            onClick={() => setComponentTypeRulePreviewFilter(filterOption.id)}
                                                                        />
                                                                    ))}
                                                                </Stack>
                                                                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', md: 'center' }} useFlexGap flexWrap="wrap">
                                                                    <Chip
                                                                        size="small"
                                                                        color={componentTypeRulePreviewSelection.length ? 'primary' : 'default'}
                                                                        variant={componentTypeRulePreviewSelection.length ? 'filled' : 'outlined'}
                                                                        label={`${componentTypeRulePreviewSelection.length} sélectionnée(s)`}
                                                                    />
                                                                    <Chip
                                                                        size="small"
                                                                        variant="outlined"
                                                                        label={`${visibleTypeRulePreviewPrefixes.length} visible(s)`}
                                                                    />
                                                                    <Button
                                                                        size="small"
                                                                        variant="text"
                                                                        onClick={selectVisibleTypeRulePreviewPrefixes}
                                                                        disabled={componentTypeRuleUndoRestoring || componentTypeRulePartialRestoring || !visibleTypeRulePreviewPrefixes.length}
                                                                    >
                                                                        Sélectionner visibles
                                                                    </Button>
                                                                    <Button
                                                                        size="small"
                                                                        variant="text"
                                                                        onClick={clearTypeRulePreviewSelection}
                                                                        disabled={componentTypeRuleUndoRestoring || componentTypeRulePartialRestoring || !componentTypeRulePreviewSelection.length}
                                                                    >
                                                                        Vider selection
                                                                    </Button>
                                                                    <Button
                                                                        size="small"
                                                                        variant="contained"
                                                                        onClick={restoreSelectedTypeRulePreviewPrefixes}
                                                                        disabled={componentTypeRuleUndoRestoring || componentTypeRulePartialRestoring || !componentTypeRulePreviewSelection.length}
                                                                    >
                                                                        {componentTypeRulePartialRestoring ? 'Restauration...' : 'Restaurer la selection'}
                                                                    </Button>
                                                                </Stack>
                                                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                                    Clique sur les préfixes ci-dessous pour choisir exactement les règles à réappliquer depuis cet état.
                                                                </Typography>
                                                                {componentTypeRulePreviewFilter !== 'all'
                                                                    && (
                                                                        (componentTypeRulePreviewFilter === 'add' && !selectedTypeRuleHistoryPreview.toAdd.length)
                                                                        || (componentTypeRulePreviewFilter === 'update' && !selectedTypeRuleHistoryPreview.toUpdate.length)
                                                                        || (componentTypeRulePreviewFilter === 'remove' && !selectedTypeRuleHistoryPreview.toRemove.length)
                                                                    ) ? (
                                                                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                                                            Aucun élément ne correspond à ce filtre pour cet état.
                                                                        </Typography>
                                                                    ) : null}
                                                                {previewShowsAdd && selectedTypeRuleHistoryPreview.toAdd.length ? (
                                                                    <Stack spacing={0.5}>
                                                                        <Typography variant="caption" sx={{ color: 'success.main' }}>Seraient ajoutés</Typography>
                                                                        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                                                                            {selectedTypeRuleHistoryPreview.toAdd.map((prefix) => (
                                                                                <Chip
                                                                                    key={`add-${prefix}`}
                                                                                    size="small"
                                                                                    clickable
                                                                                    color="success"
                                                                                    variant={componentTypeRulePreviewSelection.includes(prefix) ? 'filled' : 'outlined'}
                                                                                    label={prefix}
                                                                                    onClick={() => toggleTypeRulePreviewSelection(prefix)}
                                                                                />
                                                                            ))}
                                                                        </Stack>
                                                                    </Stack>
                                                                ) : null}
                                                                {previewShowsUpdate && selectedTypeRuleHistoryPreview.toUpdate.length ? (
                                                                    <Stack spacing={0.5}>
                                                                        <Typography variant="caption" sx={{ color: 'warning.main' }}>Seraient mises a jour</Typography>
                                                                        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                                                                            {selectedTypeRuleHistoryPreview.toUpdate.map((prefix) => (
                                                                                <Chip
                                                                                    key={`update-${prefix}`}
                                                                                    size="small"
                                                                                    clickable
                                                                                    color="warning"
                                                                                    variant={componentTypeRulePreviewSelection.includes(prefix) ? 'filled' : 'outlined'}
                                                                                    label={prefix}
                                                                                    onClick={() => toggleTypeRulePreviewSelection(prefix)}
                                                                                />
                                                                            ))}
                                                                        </Stack>
                                                                    </Stack>
                                                                ) : null}
                                                                {previewShowsUpdate && selectedTypeRuleHistoryPreview.updateDetails?.length ? (
                                                                    <Stack spacing={1}>
                                                                        <Typography variant="caption" sx={{ color: 'warning.main' }}>
                                                                            Détail des règles modifiées
                                                                        </Typography>
                                                                        {selectedTypeRuleHistoryPreview.updateDetails.slice(0, 5).map((detail) => (
                                                                            <Card key={`detail-${detail.prefix}`} variant="outlined" sx={{ borderColor: 'var(--border)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                                                                                <CardContent sx={{ py: 1.25 }}>
                                                                                    <Stack spacing={0.75}>
                                                                                        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                                                                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                                                {detail.prefix}
                                                                                            </Typography>
                                                                                            <Chip size="small" color="warning" variant="outlined" label={`${detail.changes.length} champ(s)`} />
                                                                                            <Chip
                                                                                                size="small"
                                                                                                clickable
                                                                                                color={componentTypeRulePreviewSelection.includes(detail.prefix) ? 'primary' : 'default'}
                                                                                                variant={componentTypeRulePreviewSelection.includes(detail.prefix) ? 'filled' : 'outlined'}
                                                                                                label={componentTypeRulePreviewSelection.includes(detail.prefix) ? 'Sélectionnée' : 'Sélectionner'}
                                                                                                onClick={() => toggleTypeRulePreviewSelection(detail.prefix)}
                                                                                            />
                                                                                        </Stack>
                                                                                        {detail.changes.map((change) => (
                                                                                            <Typography key={`${detail.prefix}-${change.field}`} variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                                                                                {`${change.label}: ${change.before} -> ${change.after}`}
                                                                                            </Typography>
                                                                                        ))}
                                                                                    </Stack>
                                                                                </CardContent>
                                                                            </Card>
                                                                        ))}
                                                                        {selectedTypeRuleHistoryPreview.updateDetails.length > 5 ? (
                                                                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                                                {`... ${selectedTypeRuleHistoryPreview.updateDetails.length - 5} autre(s) regle(s) modifiee(s)`}
                                                                            </Typography>
                                                                        ) : null}
                                                                    </Stack>
                                                                ) : null}
                                                                {previewShowsRemove && selectedTypeRuleHistoryPreview.toRemove.length ? (
                                                                    <Stack spacing={0.5}>
                                                                        <Typography variant="caption" sx={{ color: 'error.main' }}>Seraient retirées</Typography>
                                                                        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                                                                            {selectedTypeRuleHistoryPreview.toRemove.map((prefix) => (
                                                                                <Chip
                                                                                    key={`remove-${prefix}`}
                                                                                    size="small"
                                                                                    clickable
                                                                                    color="error"
                                                                                    variant={componentTypeRulePreviewSelection.includes(prefix) ? 'filled' : 'outlined'}
                                                                                    label={prefix}
                                                                                    onClick={() => toggleTypeRulePreviewSelection(prefix)}
                                                                                />
                                                                            ))}
                                                                        </Stack>
                                                                    </Stack>
                                                                ) : null}
                                                            </>
                                                        ) : null}
                                                    </Stack>
                                                </CardContent>
                                            </Card>
                                        ) : null}
                                    </Stack>
                                </CardContent>
                            </Card>
                        ) : null}
                        {componentTypeRuleSearchActive ? (
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: -1 }}>
                                Le réordonnancement manuel est disponible uniquement quand la recherche est vide.
                            </Typography>
                        ) : null}
                        {duplicatePriorityValues.size ? (
                            <Typography variant="caption" sx={{ color: 'warning.main', display: 'block', mt: -1 }}>
                                {`${duplicatePriorityValues.size} priorité(s) ambiguë(s) détectée(s) (préfixes qui se chevauchent à priorité égale). Les flèches de réordonnancement restent prioritaires si tu veux clarifier l'ordre.`}
                            </Typography>
                        ) : null}

                        <Card variant="outlined" sx={{ borderColor: 'var(--border)' }}>
                            <CardContent sx={{ py: 2 }}>
                                <Stack spacing={2}>
                                    <Stack spacing={0.5}>
                                        <Typography variant="subtitle1">Ajouter une règle</Typography>
                                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                            Les préfixes les plus spécifiques et les priorités les plus basses sont évalués en premier.
                                        </Typography>
                                    </Stack>
                                    <Grid container spacing={1.25}>
                                        <Grid item xs={12} md={2}>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Préfixe"
                                                value={newTypeRule.reference_prefix}
                                                onChange={(event) => setNewTypeRule((current) => ({
                                                    ...current,
                                                    reference_prefix: event.target.value.toUpperCase(),
                                                }))}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6} md={2}>
                                            <TextField
                                                fullWidth
                                                select
                                                size="small"
                                                label="Type"
                                                value={newTypeRule.mapped_type}
                                                onChange={(event) => setNewTypeRule((current) => ({
                                                    ...current,
                                                    mapped_type: event.target.value,
                                                }))}
                                            >
                                                {componentTypeMenuItems}
                                            </TextField>
                                        </Grid>
                                        <Grid item xs={12} sm={6} md={2}>
                                            <TextField
                                                fullWidth
                                                select
                                                size="small"
                                                label="Confirmation"
                                                value={newTypeRule.requires_confirmation ? 'required' : 'direct'}
                                                onChange={(event) => setNewTypeRule((current) => ({
                                                    ...current,
                                                    requires_confirmation: event.target.value === 'required',
                                                }))}
                                            >
                                                <MenuItem value="direct">Direct</MenuItem>
                                                <MenuItem value="required">A confirmer</MenuItem>
                                            </TextField>
                                        </Grid>
                                        <Grid item xs={12} sm={4} md={1}>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                type="number"
                                                label="Priorité"
                                                value={newTypeRule.priority}
                                                onChange={(event) => setNewTypeRule((current) => ({
                                                    ...current,
                                                    priority: event.target.value,
                                                }))}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={4} md={2}>
                                            <TextField
                                                fullWidth
                                                select
                                                size="small"
                                                label="État"
                                                value={newTypeRule.enabled ? 'enabled' : 'disabled'}
                                                onChange={(event) => setNewTypeRule((current) => ({
                                                    ...current,
                                                    enabled: event.target.value === 'enabled',
                                                }))}
                                            >
                                                <MenuItem value="enabled">Active</MenuItem>
                                                <MenuItem value="disabled">Inactive</MenuItem>
                                            </TextField>
                                        </Grid>
                                        <Grid item xs={12} sm={8} md={3}>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Description"
                                                value={newTypeRule.description}
                                                onChange={(event) => setNewTypeRule((current) => ({
                                                    ...current,
                                                    description: event.target.value,
                                                }))}
                                            />
                                        </Grid>
                                    </Grid>
                                    <Stack direction="row" justifyContent="flex-end">
                                        <Button
                                            variant="contained"
                                            onClick={createTypeRule}
                                            disabled={componentTypeRuleCreating || componentTypeRuleResetting || componentTypeRuleDeletingId !== null || componentTypeRuleDuplicatingId !== null || componentTypeRuleImporting || componentTypeRuleExporting || componentTypeRuleReorderingId !== null || componentTypeRuleUndoRestoring}
                                        >
                                            {componentTypeRuleCreating ? 'Ajout...' : 'Ajouter la règle'}
                                        </Button>
                                    </Stack>
                                </Stack>
                            </CardContent>
                        </Card>

                        <TableContainer sx={{ ...compactTableContainerSx, maxHeight: 420, overflowY: 'auto' }}>
                            <Table stickyHeader sx={compactTableSx}>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ width: '14%' }}>Préfixe</TableCell>
                                        <TableCell sx={{ width: '18%' }}>Type</TableCell>
                                        <TableCell sx={{ width: '14%' }}>Confirmation</TableCell>
                                        <TableCell sx={{ width: '10%' }}>Priorité</TableCell>
                                        <TableCell sx={{ width: '12%' }}>État</TableCell>
                                        <TableCell sx={{ width: '22%' }}>Description</TableCell>
                                        <TableCell sx={{ width: '14%' }}>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {!componentTypeRules.length ? (
                                        <TableRow>
                                            <TableCell colSpan={7}>
                                                <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
                                                    Aucune règle ne correspond à la recherche en cours.
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : typeRuleTableRows}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Stack>
                </CardContent>
            </Card>
            <ConfirmDialog
                open={Boolean(confirmState)}
                title={confirmState?.title || ''}
                message={confirmState?.message || ''}
                confirmLabel={confirmState?.confirmLabel || 'Confirmer'}
                severity={confirmState?.severity || 'error'}
                onConfirm={() => {
                    confirmState?.onConfirm?.();
                    setConfirmState(null);
                }}
                onClose={() => setConfirmState(null)}
            />
        </Stack>
    );
}

export default ReglesTypePanel;
