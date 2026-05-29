import { buildAggregatedComponents } from './bomPlanning';
import { buildReferenceRevisionKey, normalizeBomWorkspaceEntry } from './bomWorkspace';

function readCommandEntryQuantity(entry, quantitiesByReference = {}) {
    const quantityKey = buildReferenceRevisionKey(entry?.reference, entry?.revision);
    const quantity = Number(quantitiesByReference?.[quantityKey]?.quantityToProduce || 1);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function readCommandSummaryQuantity(item) {
    const quantity = Number(item?.quantity_to_produce || 1);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

export function getSelectedCommandEntries(selectedBomEntries = [], currentBom = null) {
    if (selectedBomEntries?.length) {
        return selectedBomEntries;
    }

    if (!currentBom?.bomRevisionId) {
        return [];
    }

    return [normalizeBomWorkspaceEntry(currentBom)];
}

export function buildDefaultCommandName(entries = []) {
    if (!entries.length) {
        return '';
    }

    if (entries.length === 1) {
        return `Commande ${entries[0].reference || 'BOM'} ${entries[0].revision || ''}`.trim();
    }

    return `Commande ${entries[0].reference || 'BOM'} +${entries.length - 1}`;
}

export function buildSelectionLabel(entries = []) {
    if (!entries.length) {
        return '';
    }

    if (entries.length === 1) {
        const [entry] = entries;
        return `${entry.reference || 'BOM'} ${entry.revision || ''} ${entry.side || ''}`.trim();
    }

    return `${entries.length} BOM sélectionnées`;
}

export function buildCommandContextSignature(entries = [], quantitiesByReference = {}) {
    return (Array.isArray(entries) ? entries : [])
        .map((entry) => ({
            revisionId: Number(entry?.bom_revision_id || entry?.bomRevisionId || 0),
            quantity: readCommandEntryQuantity(entry, quantitiesByReference),
        }))
        .filter((entry) => entry.revisionId > 0)
        .sort((left, right) => left.revisionId - right.revisionId)
        .map((entry) => `${entry.revisionId}:${entry.quantity}`)
        .join('|');
}

export function buildCommandSummarySignature(summary = null) {
    return (Array.isArray(summary?.items) ? summary.items : [])
        .map((item) => ({
            revisionId: Number(item?.bom_revision_id || 0),
            quantity: readCommandSummaryQuantity(item),
        }))
        .filter((item) => item.revisionId > 0)
        .sort((left, right) => left.revisionId - right.revisionId)
        .map((item) => `${item.revisionId}:${item.quantity}`)
        .join('|');
}

export function isCommandSummaryCurrent(summary = null, entries = [], quantitiesByReference = {}) {
    const contextSignature = buildCommandContextSignature(entries, quantitiesByReference);
    if (!summary?.id || !contextSignature) {
        return false;
    }

    return buildCommandSummarySignature(summary) === contextSignature;
}

export function countLoadedCommandEntries(entries = [], revisionsById = {}, currentBom = null) {
    const currentBomRevisionId = Number(currentBom?.bomRevisionId || currentBom?.bom_revision_id || 0);

    return (Array.isArray(entries) ? entries : []).filter((entry) => {
        const revisionId = Number(entry?.bom_revision_id || entry?.bomRevisionId || 0);
        if (revisionId < 1) {
            return false;
        }

        return Boolean(revisionsById?.[revisionId]) || revisionId === currentBomRevisionId;
    }).length;
}

export function areSelectedCommandEntriesLoaded(entries = [], revisionsById = {}, currentBom = null) {
    if (!entries?.length) {
        return false;
    }

    return countLoadedCommandEntries(entries, revisionsById, currentBom) === entries.length;
}

export function buildPlanningLines(bomWorkspace) {
    return buildAggregatedComponents(
        bomWorkspace.revisionsById,
        bomWorkspace.quantitiesByReference,
        bomWorkspace.stockDraftByComponentKey,
    );
}

export function buildCommandGenerationItems(selectedEntries = [], quantitiesByReference = {}) {
    return selectedEntries.map((entry) => {
        const quantityKey = buildReferenceRevisionKey(entry.reference, entry.revision);
        return {
            bom_revision_id: entry.bom_revision_id,
            quantity: Number(quantitiesByReference?.[quantityKey]?.quantityToProduce || 1),
        };
    });
}

export function mergeCommandLinesWithPlanning(summaryLines = [], planningLines = []) {
    const planningMap = new Map(planningLines.map((line) => [line.key, line]));
    const summaryMap = new Map(summaryLines.map((line) => [line.key, line]));
    const mergedKeys = Array.from(new Set([...planningMap.keys(), ...summaryMap.keys()]));

    return mergedKeys.map((key) => {
        const planningLine = planningMap.get(key);
        const summaryLine = summaryMap.get(key);

        return {
            key,
            componentName: summaryLine?.component_name || planningLine?.componentLibraryName || planningLine?.value || summaryLine?.value || '',
            value: planningLine?.value || summaryLine?.value || '',
            footprint: planningLine?.footprint || summaryLine?.footprint || '',
            requiredQuantity: planningLine?.requiredQuantity || summaryLine?.quantity || 0,
            stockAvailableQty: planningLine?.totalAvailableQty || 0,
            quantityToOrder: planningLine?.quantityToOrder ?? summaryLine?.quantity ?? 0,
            manualPlacement: Boolean(planningLine?.manualPlacement),
            feederSlot: planningLine?.draft?.feeder_slot || '',
            sources: planningLine?.sources || (summaryLine?.sources || []).map((source) => (
                `${source.bom_reference || 'BOM'} ${source.revision || ''} x${source.quantity_to_produce || 1}`.trim()
            )),
        };
    }).sort((left, right) => {
        if (right.quantityToOrder !== left.quantityToOrder) {
            return right.quantityToOrder - left.quantityToOrder;
        }

        return left.value.localeCompare(right.value);
    });
}
