import { formatCardLabel } from '../formatCardLabel';

describe('formatCardLabel (029)', () => {
    it('« RÉFÉRENCE — Nom » quand un nom est présent', () => {
        expect(formatCardLabel('AMPLI_GEN6', 'Ampli Gen 6')).toBe('AMPLI_GEN6 — Ampli Gen 6');
    });

    it('référence seule quand le nom est absent (null/undefined/vide/espaces)', () => {
        expect(formatCardLabel('KT240576', null)).toBe('KT240576');
        expect(formatCardLabel('KT240576', undefined)).toBe('KT240576');
        expect(formatCardLabel('KT240576', '')).toBe('KT240576');
        expect(formatCardLabel('KT240576', '   ')).toBe('KT240576');
    });

    it('pas de « — » orphelin, trim des deux côtés', () => {
        expect(formatCardLabel('  REF ', '  Nom ')).toBe('REF — Nom');
        expect(formatCardLabel('', 'Nom seul')).toBe('Nom seul');
        expect(formatCardLabel('', '')).toBe('');
    });
});
