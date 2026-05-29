import { getStockStatusChipColor, normalizeStockStatus } from '../bomStockUi';

const ORDER_REQUIRED_STATUS = '\u00c0 commander';

describe('bomStockUi', () => {
    it('normalizes legacy order-required labels to the canonical accented label', () => {
        expect(normalizeStockStatus(ORDER_REQUIRED_STATUS)).toBe(ORDER_REQUIRED_STATUS);
        expect(normalizeStockStatus('A commander')).toBe(ORDER_REQUIRED_STATUS);
        expect(normalizeStockStatus('\u00c3\u20ac commander')).toBe(ORDER_REQUIRED_STATUS);
        expect(normalizeStockStatus('\u00c3\u0192\u00c6\u2019\u00c3\u00a2\u20ac\u0161\u00c2\u00ac commander')).toBe(ORDER_REQUIRED_STATUS);
    });

    it('keeps the expected chip color for normalized and legacy values', () => {
        expect(getStockStatusChipColor(ORDER_REQUIRED_STATUS)).toBe('default');
        expect(getStockStatusChipColor('A commander')).toBe('default');
        expect(getStockStatusChipColor('\u00c3\u20ac commander')).toBe('default');
        expect(getStockStatusChipColor('\u00c3\u0192\u00c6\u2019\u00c3\u00a2\u20ac\u0161\u00c2\u00ac commander')).toBe('default');
        expect(getStockStatusChipColor('OK stock')).toBe('success');
    });
});
