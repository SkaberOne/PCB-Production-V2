/**
 * Smoke tests for the MPN enrichment panel (card layout).
 * Verifies it loads proposals (apiClient mocked), renders a component card with
 * its confidence badge and supplier search buttons, and that the text filter
 * narrows the visible cards.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MpnEnrichmentPanel from '../MpnEnrichmentPanel';
import apiClient from '../../../api/client';

jest.mock('../../../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn() },
    extractApiError: (e) => e?.message || 'err',
}));

const PROPOSALS = {
    proposals: [
        {
            component_id: 171,
            reference: 'LIB-LM358',
            value: 'LM358D',
            package: 'SOIC-8',
            component_type: 'IC',
            current_mpn: null,
            proposed_mpn: 'LM358D',
            manufacturer: 'TI',
            supplier: 'Mouser',
            product_url: 'https://example.com/lm358',
            confidence: 'high',
            candidates: [],
        },
        {
            component_id: 46,
            reference: 'LIB-100NF',
            value: '100nF',
            package: '0603',
            component_type: 'CAPACITOR',
            current_mpn: null,
            proposed_mpn: null,
            confidence: 'manual',
            candidates: [],
        },
    ],
    counts: { high: 1, medium: 0, manual: 1 },
};

function mockApi() {
    apiClient.get.mockImplementation((url) => {
        if (url === '/marketplace/supplier-offers/mpn-proposals') {
            return Promise.resolve({ data: PROPOSALS });
        }
        return Promise.resolve({ data: {} });
    });
}

afterEach(() => jest.clearAllMocks());

describe('MpnEnrichmentPanel', () => {
    it('charge et affiche une carte composant avec badge et boutons fournisseurs', async () => {
        mockApi();
        render(<MpnEnrichmentPanel />);
        fireEvent.click(screen.getByText('Charger (cache)'));

        expect(await screen.findByText('LM358D')).toBeInTheDocument();
        expect(screen.getByText('100nF')).toBeInTheDocument();
        // Badge confiance combiné (pré-rempli / à chercher).
        expect(screen.getByText(/pré-rempli · Exact/)).toBeInTheDocument();
        // Boutons de recherche fournisseurs présents (au moins un par carte).
        expect(screen.getAllByText('Mouser').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Octopart').length).toBeGreaterThan(0);
    });

    it('filtre les cartes par texte', async () => {
        mockApi();
        render(<MpnEnrichmentPanel />);
        fireEvent.click(screen.getByText('Charger (cache)'));
        await screen.findByText('LM358D');

        fireEvent.change(screen.getByPlaceholderText('Filtrer par value, MPN, boîtier…'), {
            target: { value: 'LM358' },
        });

        await waitFor(() => expect(screen.queryByText('100nF')).not.toBeInTheDocument());
        expect(screen.getByText('LM358D')).toBeInTheDocument();
    });
});
