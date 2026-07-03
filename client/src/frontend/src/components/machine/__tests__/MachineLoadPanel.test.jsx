/**
 * Smoke test for the "Stock chargé sur la machine" panel (ADR 0012).
 * Verifies it loads machines + components (apiClient mocked) and renders.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import MachineLoadPanel from '../MachineLoadPanel';
import apiClient from '../../../api/client';

jest.mock('../../../api/client', () => ({
    get: jest.fn(),
    put: jest.fn(),
}));

afterEach(() => jest.clearAllMocks());

describe('MachineLoadPanel', () => {
    it('charge machines + composants et affiche le sélecteur de machine', async () => {
        apiClient.get.mockImplementation((url) => {
            if (url === '/marketplace/machines') return Promise.resolve({ data: { data: [{ id: 1, name: 'PNP-01' }] } });
            if (url === '/marketplace/stock') return Promise.resolve({ data: [{ component_id: 1, value: '10k', footprint_pnp: 'R0402' }] });
            return Promise.resolve({ data: [] });
        });
        render(<MachineLoadPanel />);
        expect(await screen.findByText('Stock chargé sur la machine')).toBeInTheDocument();
        await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/marketplace/machines'));
        expect(screen.getByText('Choisir une machine…')).toBeInTheDocument();
    });
});
