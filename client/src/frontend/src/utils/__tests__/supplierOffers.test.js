import {
    priceAtQuantity,
    effectivePrice,
    sortOffers,
    selectBest,
    supplierLabel,
    formatPrice,
} from '../supplierOffers';

describe('supplierOffers helpers', () => {
    const breaks = [
        { qty: 1, price: 1.0 },
        { qty: 10, price: 0.5 },
        { qty: 100, price: 0.2 },
    ];

    test('priceAtQuantity picks the right break', () => {
        expect(priceAtQuantity(breaks, 1)).toBe(1.0);
        expect(priceAtQuantity(breaks, 9)).toBe(1.0);
        expect(priceAtQuantity(breaks, 10)).toBe(0.5);
        expect(priceAtQuantity(breaks, 250)).toBe(0.2);
        expect(priceAtQuantity([], 5)).toBeNull();
    });

    test('effectivePrice falls back to unit_price', () => {
        expect(effectivePrice({ price_breaks: breaks }, 100)).toBe(0.2);
        expect(effectivePrice({ unit_price: 0.42 }, 1)).toBe(0.42);
        expect(effectivePrice({})).toBe(Number.POSITIVE_INFINITY);
    });

    test('supplierLabel maps canonical codes', () => {
        expect(supplierLabel('MOUSER')).toBe('Mouser');
        expect(supplierLabel('DIGIKEY')).toBe('Digi-Key');
        expect(supplierLabel('XYZ')).toBe('XYZ');
        expect(supplierLabel(null)).toBe('');
    });

    test('cheapest strategy prefers in-stock lowest price', () => {
        const offers = [
            { supplier: 'MOUSER', unit_price: 0.1, stock_qty: 0, price_breaks: [{ qty: 1, price: 0.1 }] },
            { supplier: 'DIGIKEY', unit_price: 0.2, stock_qty: 500, price_breaks: [{ qty: 1, price: 0.2 }] },
            { supplier: 'FARNELL', unit_price: 0.15, stock_qty: 500, price_breaks: [{ qty: 1, price: 0.15 }] },
        ];
        expect(selectBest(offers, { strategy: 'cheapest', quantity: 1 }).supplier).toBe('FARNELL');
    });

    test('priority strategy falls back when supplier is out of stock', () => {
        const offers = [
            { supplier: 'MOUSER', unit_price: 0.3, stock_qty: 0, price_breaks: [{ qty: 1, price: 0.3 }] },
            { supplier: 'DIGIKEY', unit_price: 0.25, stock_qty: 100, price_breaks: [{ qty: 1, price: 0.25 }] },
        ];
        const best = selectBest(offers, { strategy: 'priority', prioritySupplier: 'MOUSER', quantity: 1 });
        expect(best.supplier).toBe('DIGIKEY');
    });

    test('priority strategy keeps the priority supplier when in stock', () => {
        const offers = [
            { supplier: 'MOUSER', unit_price: 0.3, stock_qty: 50, price_breaks: [{ qty: 1, price: 0.3 }] },
            { supplier: 'DIGIKEY', unit_price: 0.25, stock_qty: 100, price_breaks: [{ qty: 1, price: 0.25 }] },
        ];
        const best = selectBest(offers, { strategy: 'priority', prioritySupplier: 'MOUSER', quantity: 1 });
        expect(best.supplier).toBe('MOUSER');
    });

    test('formatPrice renders euro or dash', () => {
        expect(formatPrice(null)).toBe('—');
        expect(typeof formatPrice(1.5)).toBe('string');
    });
});
