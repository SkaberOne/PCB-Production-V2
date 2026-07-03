/**
 * Smoke test for the "Puis-je produire ?" panel (ADR 0011).
 * Verifies it loads productions (apiClient mocked) and renders the selector.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ProduceCheckPanel from '../ProduceCheckPanel';
import apiClient from '../../../api/client';

jest.mock('../../../api/client', () => ({
    get: jest.fn(),
    post: jest.fn(),
}));

afterEach(() => jest.clearAllMocks());

describe('ProduceCheckPanel', () => {
    it('charge les productions et affiche le sélecteur', async () => {
        apiClient.get.mockImplementation((url) => {
            if (url === '/marketplace/productions') {
                return Promise.resolve({ data: { items: [{ id: 1, name: 'PROD_A', status: 'ACTIVE', machine_id: 1 }] } });
            }
            return Promise.resolve({ data: {} });
        });
        render(<ProduceCheckPanel />);
        expect(await screen.findByLabelText('Production')).toBeInTheDocument();
    });

    it('gère une liste de productions vide', async () => {
        apiClient.get.mockResolvedValue({ data: { items: [] } });
        render(<ProduceCheckPanel />);
        await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/marketplace/productions'));
        expect(screen.getByLabelText('Production')).toBeInTheDocument();
    });

    it('mode embarqué (productionId) : pas de menu, analyse directe', async () => {
        apiClient.get.mockImplementation((url) => {
            if (url === '/marketplace/stock/can-produce/5') {
                return Promise.resolve({ data: {
                    production_id: 5, production_name: 'P5', board_count: 10,
                    can_produce: false, shortage_count: 1,
                    lines: [{ component_id: 1, value: '100n', mpn: 'X', footprint: 'C0402',
                        besoin: 10, solde: 5, reserve: 0, disponible: 5, manque: 5, a_commander: 5 }],
                } });
            }
            return Promise.resolve({ data: [] });
        });
        render(<ProduceCheckPanel productionId={5} />);
        expect(await screen.findByText(/en manque pour 10 carte/i)).toBeInTheDocument();
        // No production dropdown in embedded mode.
        expect(screen.queryByLabelText('Production')).not.toBeInTheDocument();
        expect(apiClient.get).toHaveBeenCalledWith('/marketplace/stock/can-produce/5');
    });
});
