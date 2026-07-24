import { extractApiError } from '../client';

describe('extractApiError (030)', () => {
    it('detail chaîne → renvoie la chaîne', () => {
        const r = extractApiError({ response: { data: { detail: 'Référence déjà utilisée' } } });
        expect(r).toBe('Référence déjà utilisée');
        expect(typeof r).toBe('string');
    });

    it('detail tableau (422 Pydantic) → chaîne lisible (msg joints), jamais un objet', () => {
        const err = { response: { data: { detail: [
            { type: 'value_error', loc: ['body', 'name'], msg: 'field required' },
            { type: 'type_error', loc: ['body', 'qty'], msg: 'value is not a valid integer' },
        ] } } };
        const r = extractApiError(err);
        expect(typeof r).toBe('string');
        expect(r).toBe('field required, value is not a valid integer');
    });

    it('pas de detail → « Erreur <status>: <statusText> » (chaîne)', () => {
        const r = extractApiError({ response: { status: 500, statusText: 'Internal Server Error', data: {} } });
        expect(r).toBe('Erreur 500: Internal Server Error');
    });

    it('requête sans réponse (serveur injoignable) → chaîne', () => {
        const r = extractApiError({ request: {}, message: 'Network Error' });
        expect(r).toBe('Serveur injoignable. Vérifiez que le serveur est démarré.');
    });

    it('annulation volontaire → null (aucun message affiché)', () => {
        expect(extractApiError({ code: 'ERR_CANCELED' })).toBeNull();
        expect(extractApiError({ name: 'CanceledError' })).toBeNull();
    });

    it('repli sur error.message', () => {
        expect(extractApiError({ message: 'boom' })).toBe('boom');
    });
});
