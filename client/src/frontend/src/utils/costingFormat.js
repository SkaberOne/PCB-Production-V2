/**
 * Formatting helpers for the costing tab (« Prix carte »).
 */

const EUR = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const EUR0 = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});

/** Format a number as euro currency (2 decimals). Null/undefined → '—'. */
export function eur(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return EUR.format(Number(value));
}

/** Format a number as euro currency (0 decimals) for large totals. */
export function eur0(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return EUR0.format(Number(value));
}

/** Format a duration in hours. */
export function hrs(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const n = Math.round(Number(value) * 1000) / 1000;
    return `${n.toLocaleString('fr-FR')} h`;
}

/** Format a percentage from a 0..1 ratio. */
export function pct(ratio) {
    if (ratio === null || ratio === undefined || Number.isNaN(Number(ratio))) return '—';
    return `${Math.round(Number(ratio) * 100)} %`;
}

/** Short date from an ISO string. */
export function shortDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('fr-FR');
}
