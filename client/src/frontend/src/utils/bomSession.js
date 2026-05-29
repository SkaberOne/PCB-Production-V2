import { normalizeComponentTypeValue } from './componentTypes';

export const BOM_ITEM_STATUSES = Object.freeze({
    ERROR: 'Erreur',
    REVIEW: 'À vérifier',
    HARMONIZED: 'Harmonisé',
    KEPT: 'Conservé',
    DNP: 'DNP',
});

export function getBomItemType(item) {
    return normalizeComponentTypeValue(item.component_type || item.type) || 'UNDEFINED';
}

export function getBomItemStatus(item, warnings = [], errors = []) {
    const reference = String(item.reference || '');
    const hasWarning = reference && warnings.some((warning) => warning.includes(reference));
    const hasError = reference && errors.some((itemError) => itemError.includes(reference));
    const wasHarmonized = item.value_harmonized && item.value_harmonized !== item.value_raw;
    const missingPnpFootprint = !item.footprint_pnp && item.footprint_eagle;
    const missingComponentLibrary = Boolean(item.component_library_missing);
    const missingTypeConfirmation = Boolean(item.component_type_requires_confirmation);

    if (hasError) {
        return BOM_ITEM_STATUSES.ERROR;
    }

    if (item.dnp) {
        return BOM_ITEM_STATUSES.DNP;
    }

    if (hasWarning || missingPnpFootprint || missingComponentLibrary || missingTypeConfirmation) {
        return BOM_ITEM_STATUSES.REVIEW;
    }

    if (wasHarmonized) {
        return BOM_ITEM_STATUSES.HARMONIZED;
    }

    return BOM_ITEM_STATUSES.KEPT;
}

export function getBomSessionStats(currentBom) {
    const items = currentBom?.items || [];
    const warnings = currentBom?.warnings || [];
    const errors = currentBom?.errors || [];

    const harmonizedCount = items.filter((item) => item.value_harmonized && item.value_harmonized !== item.value_raw).length;
    const mappedFootprintsCount = items.filter((item) => Boolean(item.footprint_pnp)).length;
    const reviewCount = items.filter((item) => {
        const status = getBomItemStatus(item, warnings, errors);

        return status === BOM_ITEM_STATUSES.REVIEW || status === BOM_ITEM_STATUSES.ERROR;
    }).length;

    return {
        totalItems: items.length,
        warningCount: warnings.length,
        errorCount: errors.length,
        harmonizedCount,
        mappedFootprintsCount,
        reviewCount,
    };
}

export function buildOriginalBomContent(currentBom) {
    if (!currentBom?.items?.length) {
        return '';
    }

    return currentBom.items.map((item) => (
        [
            item.reference || '',
            item.value_raw || '',
            item.footprint_eagle || '',
            item.x ?? '',
            item.y ?? '',
            item.rotation ?? '',
            item.placement_side || currentBom.side || '',
            ...(item.dnp ? ['DNP'] : []),
        ].join(' ')
    )).join('\n');
}

export function buildCommandPreview(items = []) {
    const groups = new Map();

    items.forEach((item) => {
        if (item.dnp) {
            return;
        }

        const value = item.value_harmonized || item.value_raw || 'Valeur non renseignée';
        const footprint = item.footprint_pnp || item.footprint_eagle || 'Empreinte non renseignée';
        const type = getBomItemType(item);
        const key = `${value}__${footprint}__${type}`;
        const existing = groups.get(key);

        if (existing) {
            existing.quantity += 1;
            existing.references.push(item.reference || '?');
            return;
        }

        groups.set(key, {
            key,
            value,
            footprint,
            type,
            quantity: 1,
            references: [item.reference || '?'],
        });
    });

    return Array.from(groups.values()).sort((left, right) => {
        if (right.quantity !== left.quantity) {
            return right.quantity - left.quantity;
        }

        return left.value.localeCompare(right.value);
    });
}
