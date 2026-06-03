/**
 * Pure helpers for supplier offers: pricing at quantity breaks, sorting by
 * strategy (cheapest / priority), and display formatting.
 *
 * Mirrors the backend logic in serveur/src/services/supplier_offer_service.py
 * so the UI can sort the cached offers client-side without a round-trip.
 * See ADR 0004.
 */

export const SUPPLIER_LABELS = {
    MOUSER: 'Mouser',
    DIGIKEY: 'Digi-Key',
    FARNELL: 'Farnell',
    RS: 'RS',
};

export function supplierLabel(code) {
    if (!code) return '';
    return SUPPLIER_LABELS[String(code).toUpperCase()] || code;
}

/** Unit price at the break matching `quantity` (else cheapest available). */
export function priceAtQuantity(priceBreaks, quantity) {
    if (!Array.isArray(priceBreaks) || priceBreaks.length === 0) return null;
    const valid = priceBreaks
        .filter((b) => b && b.price != null && b.qty != null)
        .sort((a, b) => a.qty - b.qty);
    if (valid.length === 0) return null;
    let chosen = valid[0].price;
    for (const brk of valid) {
        if (brk.qty <= quantity) chosen = brk.price;
        else break;
    }
    return chosen;
}

export function effectivePrice(offer, quantity = 1) {
    const fromBreaks = priceAtQuantity(offer.price_breaks, quantity);
    const price = fromBreaks != null ? fromBreaks : offer.unit_price;
    return price != null ? price : Number.POSITIVE_INFINITY;
}

export function isInStock(offer, quantity = 1) {
    return (offer.stock_qty || 0) >= quantity;
}

/**
 * Sort offers for one component.
 * @param {Array} offers
 * @param {{strategy?: string, prioritySupplier?: string, quantity?: number}} opts
 */
export function sortOffers(offers, opts = {}) {
    const { strategy = 'cheapest', prioritySupplier = null, quantity = 1 } = opts;
    const list = [...(offers || [])];

    if (strategy === 'priority' && prioritySupplier) {
        const pref = prioritySupplier.toUpperCase();
        return list.sort((a, b) => {
            const aPref = (a.supplier || '').toUpperCase() === pref && isInStock(a, quantity);
            const bPref = (b.supplier || '').toUpperCase() === pref && isInStock(b, quantity);
            if (aPref !== bPref) return aPref ? -1 : 1;
            return rankCheapest(a, b, quantity);
        });
    }
    return list.sort((a, b) => rankCheapest(a, b, quantity));
}

function rankCheapest(a, b, quantity) {
    const aStock = isInStock(a, quantity);
    const bStock = isInStock(b, quantity);
    if (aStock !== bStock) return aStock ? -1 : 1;
    const pa = effectivePrice(a, quantity);
    const pb = effectivePrice(b, quantity);
    if (pa !== pb) return pa - pb;
    return (a.lead_time_days || 9999) - (b.lead_time_days || 9999);
}

/** Pick the single retained offer for a component, or null. */
export function selectBest(offers, opts = {}) {
    const sorted = sortOffers(offers, opts);
    return sorted.length ? sorted[0] : null;
}

export function formatPrice(value, currency = 'EUR') {
    if (value == null || !Number.isFinite(value)) return '—';
    try {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(value);
    } catch (e) {
        return `${value.toFixed(2)} ${currency}`;
    }
}
