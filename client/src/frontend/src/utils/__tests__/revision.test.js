import { normalizeRevisionCode, formatRevisionLabel } from '../revision';

describe('normalizeRevisionCode', () => {
    test('retire le préfixe REV_ (import CAO/txt)', () => {
        expect(normalizeRevisionCode('REV_A')).toBe('A');
        expect(normalizeRevisionCode('rev.a')).toBe('A');
        expect(normalizeRevisionCode('Rev B')).toBe('B');
    });
    test('laisse un code déjà nu (import catalogue)', () => {
        expect(normalizeRevisionCode('A')).toBe('A');
        expect(normalizeRevisionCode('F')).toBe('F');
        expect(normalizeRevisionCode('2')).toBe('2');
    });
    test('vide / tiret / null → chaîne vide', () => {
        expect(normalizeRevisionCode('')).toBe('');
        expect(normalizeRevisionCode('—')).toBe('');
        expect(normalizeRevisionCode('-')).toBe('');
        expect(normalizeRevisionCode(null)).toBe('');
        expect(normalizeRevisionCode(undefined)).toBe('');
    });
    test('ne tronque pas une révision commençant par R sans séparateur', () => {
        expect(normalizeRevisionCode('R2')).toBe('R2');
        expect(normalizeRevisionCode('REVA')).toBe('REVA');
    });
});

describe('formatRevisionLabel', () => {
    test('libellé homogène', () => {
        expect(formatRevisionLabel('REV_A')).toBe('Rev. A');
        expect(formatRevisionLabel('A')).toBe('Rev. A');
        expect(formatRevisionLabel('F')).toBe('Rev. F');
    });
    test('sans révision', () => {
        expect(formatRevisionLabel('')).toBe('Sans révision');
        expect(formatRevisionLabel('—')).toBe('Sans révision');
        expect(formatRevisionLabel(null)).toBe('Sans révision');
    });
});
