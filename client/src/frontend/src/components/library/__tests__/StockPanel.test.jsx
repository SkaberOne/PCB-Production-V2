/**
 * Smoke tests for the Stock inventory panel (ADR 0010, Phase 1).
 * Verifies it loads the stock list + settings (apiClient mocked), renders a row
 * with its balance and status chip, and shows the empty state otherwise.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import StockPanel from '../StockPanel';
import apiClient from '../../../api/client';

jest.mock('../../../api/client', () => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
}));

const ROW = {
    component_id: 1,
    value: '10K',
    mpn: 'RC-10K',
    component_type: 'RES',
    footprint_pnp: 'R0402',
    footprint_eagle: 'R0402',
    qty_pieces: 17,
    qty_reel: 10,
    qty_bag: 5,
    qty_tube: 2,
    engaged: 3,
    libre: 14,
    safety_stock: 0,
    loss_pct: null,
    effective_loss_pct: 2.5,
    has_stock_row: true,
    status: 'ok',
};

function mockApi(rows) {
    apiClient.get.mockImplementation((url) => {
        if (url === '/marketplace/stock') return Promise.resolve({ data: rows });
        if (url === '/marketplace/stock/settings') return Promise.resolve({ data: { global_loss_pct: 2.5 } });
        return Promise.resolve({ data: [] });
    });
}

afterEach(() => jest.clearAllMocks());

describe('StockPanel', () => {
    it('affiche une ligne de stock avec solde et statut', async () => {
        mockApi([ROW]);
        render(<StockPanel />);
        expect(await screen.findByText('10K')).toBeInTheDocument();
        expect(screen.getByText('RC-10K')).toBeInTheDocument();
        expect(screen.getByText('17')).toBeInTheDocument();
        expect(screen.getByText('OK')).toBeInTheDocument();
    });

    it('affiche un état vide sans composant', async () => {
        mockApi([]);
        render(<StockPanel />);
        await waitFor(() => expect(screen.getByText(/Aucun composant/i)).toBeInTheDocument());
    });
});
