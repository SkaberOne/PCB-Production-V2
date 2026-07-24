/**
 * 030 — ComposantsPanel : un 422 (detail = tableau Pydantic) affiche un message
 * TEXTE lisible via extractApiError, sans lever l'erreur React #31.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import apiClient from '../../../api/client';
import ComposantsPanel from '../ComposantsPanel';

describe('ComposantsPanel — 422 sans React #31 (030)', () => {
    afterEach(() => jest.restoreAllMocks());

    it('affiche les msg joints (chaîne) quand le chargement renvoie un 422 tableau', async () => {
        jest.spyOn(apiClient, 'get').mockRejectedValue({
            response: {
                status: 422,
                data: { detail: [
                    { type: 'value_error', loc: ['query', 'limit'], msg: 'ensure this value is greater than 0' },
                    { type: 'type_error', loc: ['query', 'sort'], msg: 'unexpected value' },
                ] },
            },
        });

        // Ne doit pas lever (pas de #31) et afficher un message texte lisible.
        render(<ComposantsPanel />);
        expect(
            await screen.findByText(/ensure this value is greater than 0, unexpected value/),
        ).toBeInTheDocument();
    });
});
