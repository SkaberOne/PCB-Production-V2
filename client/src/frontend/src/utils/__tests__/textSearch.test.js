import { normalizeText, matchesQuery } from '../textSearch';

describe('textSearch (prompt 020)', () => {
    it('normalise casse + accents', () => {
        expect(normalizeText('Réf-À É')).toBe('ref-a e');
        expect(normalizeText('  ÉPHÉMÈRE ')).toBe('ephemere');
        expect(normalizeText(null)).toBe('');
    });

    it('matchesQuery insensible casse/accents', () => {
        expect(matchesQuery('ampli', ['AMPLI_GEN6', 'Ampli'])).toBe(true);
        expect(matchesQuery('ephemere', ['Éphémère'])).toBe(true);
        expect(matchesQuery('éph', ['Ephemere'])).toBe(true);
        expect(matchesQuery('kt01', ['AMPLI', 'KT01'])).toBe(true);
        expect(matchesQuery('zzz', ['AMPLI', 'KT01'])).toBe(false);
    });

    it('requête vide matche toujours', () => {
        expect(matchesQuery('', ['x'])).toBe(true);
        expect(matchesQuery('   ', ['x'])).toBe(true);
    });
});
