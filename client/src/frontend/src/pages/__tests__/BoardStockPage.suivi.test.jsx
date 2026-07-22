/**
 * 010 — « Stock cartes » : barre de suivi (testées / validées / à débugger) par carte,
 * réutilisant le composant du dashboard (ProductionSuiviBar).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import BoardStockPage from '../BoardStockPage';
import apiClient from '../../api/client';

jest.mock('../../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn(), put: jest.fn() },
}));

const ROWS = [{
    bom_reference_id: 7, reference: 'KT-CARD', revision: 'REV_A',
    qty_in_stock: 100, min_stock: 10, stock_value: 500,
    reference_unit_cost_ht: 5, unit_price_override: null,
    cards_tested: 40, cards_validated: 30, cards_to_debug: 5, notes: '',
}];

beforeEach(() => {
    jest.clearAllMocks();
    apiClient.get.mockResolvedValue({ data: ROWS });
    apiClient.put.mockResolvedValue({ data: {} });
});

describe('BoardStockPage — barre de suivi (010)', () => {
    it('affiche la barre de suivi par carte avec les 3 compteurs', async () => {
        render(<BoardStockPage />);
        expect(await screen.findByText('KT-CARD')).toBeInTheDocument();
        // La barre réutilise ProductionSuiviBar (data-testid dédié par carte).
        expect(screen.getByTestId('suivi-bar-7')).toBeInTheDocument();
        // Colonne Suivi présente + compteurs bruts conservés.
        expect(screen.getByText('Suivi')).toBeInTheDocument();
        expect(screen.getByText('40')).toBeInTheDocument();  // testées
        expect(screen.getByText('30')).toBeInTheDocument();  // validées
        expect(screen.getByText('5')).toBeInTheDocument();   // à débugger
        await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/marketplace/board-stock'));
    });
});
