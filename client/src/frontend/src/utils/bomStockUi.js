const ORDER_REQUIRED_STATUS = '\u00c0 commander';
const ORDER_REQUIRED_STATUSES = new Set([
    ORDER_REQUIRED_STATUS,
    'A commander',
    '\u00c3\u20ac commander',
    '\u00c3\u0192\u00c6\u2019\u00c3\u00a2\u20ac\u0161\u00c2\u00ac commander',
]);

export function normalizeStockStatus(status) {
    const normalized = String(status || '').trim();

    if (ORDER_REQUIRED_STATUSES.has(normalized)) {
        return ORDER_REQUIRED_STATUS;
    }

    return normalized;
}

export function getStockStatusChipColor(status) {
    switch (normalizeStockStatus(status)) {
        case 'OK stock':
            return 'success';
        case 'Stock partiel':
            return 'warning';
        case 'Pose manuelle':
            return 'secondary';
        case ORDER_REQUIRED_STATUS:
            return 'default';
        default:
            return 'default';
    }
}
