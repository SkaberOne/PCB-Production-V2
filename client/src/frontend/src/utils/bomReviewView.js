import { BOM_ITEM_STATUSES, getBomItemStatus, getBomItemType } from './bomSession';
import { buildAggregatedComponents, buildBoardQuantityRows } from './bomPlanning';
import { normalizeBomWorkspaceEntry } from './bomWorkspace';
import { normalizeComponentTypeValue } from './componentTypes';

export function getSelectedEntries(selectedBomEntries = [], currentBom = null) {
    if (selectedBomEntries?.length) {
        return selectedBomEntries;
    }

    if (!currentBom?.bomRevisionId) {
        return [];
    }

    return [normalizeBomWorkspaceEntry(currentBom)];
}

export function getQuantityRows(entries = [], quantitiesByReference = {}) {
    return buildBoardQuantityRows(entries, quantitiesByReference);
}

export function buildAggregatedComponentPreview(revisionsById = {}, quantityMap = {}, stockDraftByComponentKey = {}) {
    return buildAggregatedComponents(revisionsById, quantityMap, stockDraftByComponentKey);
}

export function buildReviewPayload(revision, options = {}) {
    const markAsActive = options.markAsActive !== false;
    return {
        items: (revision?.items || []).map((item) => ({
            id: item.id,
            value_harmonized: item.value_harmonized || null,
            footprint_pnp: item.footprint_pnp || null,
            component_type: normalizeComponentTypeValue(item.component_type) || null,
            component_type_confirmed: Boolean(item.component_type_confirmed),
            notes: item.notes || null,
            dnp: Boolean(item.dnp),
        })),
        create_mappings: true,
        mark_as_active: markAsActive,
    };
}

export function buildReviewedBomContent(revision) {
    const items = revision?.items || [];
    if (!items.length) {
        return '';
    }

    const header = 'Reference Value Footprint X Y Rotation Side DNP';
    const lines = items.map((item) => (
        [
            item.reference || item.reference_item || '',
            item.value_harmonized || item.value_raw || '',
            item.footprint_pnp || item.footprint_eagle || '',
            item.x ?? '',
            item.y ?? '',
            item.rotation ?? '',
            item.placement_side || revision.side || '',
            ...(item.dnp ? ['DNP'] : []),
        ].join(' ')
    ));

    return [header, ...lines].join('\n');
}

/**
 * Export CSV propre avec BOM UTF-8 (compatible Excel).
 * Inclut toutes les colonnes utiles dont les notes (#11).
 */
export function buildReviewedBomCsv(revision) {
    const items = revision?.items || [];
    if (!items.length) {
        return '';
    }

    const esc = (val) => {
        const str = String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const header = [
        'Reference', 'Value_Raw', 'Value_Harmonized',
        'Footprint_Eagle', 'Footprint_PnP',
        'X', 'Y', 'Rotation', 'Side', 'Type', 'DNP', 'Notes',
    ].join(',');

    const lines = items.map((item) => [
        item.reference || item.reference_item || '',
        item.value_raw || '',
        item.value_harmonized || '',
        item.footprint_eagle || '',
        item.footprint_pnp || '',
        item.x ?? '',
        item.y ?? '',
        item.rotation ?? '',
        item.placement_side || revision.side || '',
        item.component_type || '',
        item.dnp ? 'DNP' : '',
        item.notes || '',
    ].map(esc).join(','));

    return [header, ...lines].join('\n');
}

export function buildItemMatchKey(item) {
    return [
        String(item.value_harmonized || item.value_raw || '').trim().toUpperCase(),
        String(item.footprint_eagle || '').trim().toUpperCase(),
        String(getBomItemType(item) || '').trim().toUpperCase(),
    ].join('__');
}

export function getStatusChipColor(status) {
    switch (status) {
        case BOM_ITEM_STATUSES.ERROR:
            return 'error';
        case BOM_ITEM_STATUSES.REVIEW:
            return 'warning';
        case BOM_ITEM_STATUSES.HARMONIZED:
            return 'success';
        default:
            return 'default';
    }
}

export function buildActiveStats(items = [], warnings = [], errors = []) {
    const stats = {
        total: items.length,
        review: 0,
        errors: errors.length,
        harmonized: 0,
    };

    items.forEach((item) => {
        const status = getBomItemStatus(item, warnings, errors);
        if (status === BOM_ITEM_STATUSES.REVIEW) {
            stats.review += 1;
        }
        if (status === BOM_ITEM_STATUSES.HARMONIZED) {
            stats.harmonized += 1;
        }
    });

    return stats;
}
