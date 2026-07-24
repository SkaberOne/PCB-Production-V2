/**
 * 030 — ErrorBoundary : défense en profondeur. Le message rendu est TOUJOURS
 * une chaîne (jamais un objet), même si un enfant lève une erreur.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import ErrorBoundary, { toDisplayMessage } from '../ErrorBoundary';

describe('toDisplayMessage (030)', () => {
    it('chaîne inchangée', () => {
        expect(toDisplayMessage('boom')).toBe('boom');
    });
    it('null/undefined → texte de repli', () => {
        expect(toDisplayMessage(null)).toBe('Erreur inattendue');
        expect(toDisplayMessage(undefined)).toBe('Erreur inattendue');
    });
    it('objet/tableau (detail 422) → chaîne, jamais un objet', () => {
        expect(typeof toDisplayMessage([{ msg: 'field required' }])).toBe('string');
        expect(toDisplayMessage([{ msg: 'field required' }])).toContain('field required');
        expect(typeof toDisplayMessage({ code: 'x' })).toBe('string');
    });
    it('Error JS → son message', () => {
        expect(toDisplayMessage(new Error('cassé'))).toBe('cassé');
    });
});

function Boom() {
    throw new Error('Composant en échec');
}

describe('ErrorBoundary (030)', () => {
    it('capture une erreur enfant et affiche un message en chaîne, sans crash', () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        render(
            <ErrorBoundary context="Base de données">
                <Boom />
            </ErrorBoundary>,
        );
        expect(screen.getByText(/Une erreur est survenue — Base de données/)).toBeInTheDocument();
        expect(screen.getByText('Composant en échec')).toBeInTheDocument();
        spy.mockRestore();
    });
});
