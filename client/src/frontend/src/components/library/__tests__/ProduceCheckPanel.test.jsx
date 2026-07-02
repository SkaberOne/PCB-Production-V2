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
});
