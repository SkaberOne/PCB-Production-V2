/**
 * 009 — « Prix carte » deux modes : Production (run) vs Carte en général (référence).
 * Vérifie le sélecteur de mode et le rendu du bon calcul dans chaque mode.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import CostingPage from '../CostingPage';
import { suppressActDeprecatedWarning } from '../../testActWarnings';

jest.mock('axios', () => {
    const instance = {
        get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(),
        interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    };
    return { __esModule: true, default: { ...instance, create: jest.fn(() => instance) } };
});

const PARAMS = {
    labor_rate: 40, vat_pct: 20, solder_paste_per_board: 0.1, defect_rate_pct: 2,
    repair_time_h: 0.1, test_time_h: 0.1, prep_time_bom_h: 0.2, prep_time_top_h: 0.2, prep_time_bot_h: 0.2,
};
const INPUTS = {
    amortize_stencil: true, quantity_produced: 10, pcb_total_price: 100, stencil_cost: 50,
    assembly_time_top_h: 1, assembly_time_bot_h: 0.5, tht_time_h: 0.2,
};
const PROD = {
    total_ht: 200, total_ttc: 240,
    cards: [{
        bom_reference_id: 7, reference: 'KT-CARD', quantity: 10,
        unit_cost_ht: 5, unit_cost_ttc: 6, total_ht: 50,
        material: { subtotal: 30 }, labor: { subtotal: 20 },
    }],
};
const HISTORY = {
    bom_reference_id: 7, reference_name: 'KT-CARD',
    reference_price: { unit_cost_ht: 5, unit_cost_ttc: 6, quantity: 10, computed_at: '2026-07-01T00:00:00', is_reference: true },
    history: [{ id: 1, quantity: 10, unit_cost_ht: 5, unit_cost_ttc: 6, total_ht: 50, is_reference: true, computed_at: '2026-07-01T00:00:00' }],
};

function mockGet() {
    axios.get.mockImplementation((url) => {
        if (url === '/marketplace/productions') return Promise.resolve({ data: { items: [{ id: 1, name: 'P1' }] } });
        if (url === '/costing/parameters') return Promise.resolve({ data: PARAMS });
        if (url === '/costing/productions/1/inputs') return Promise.resolve({ data: INPUTS });
        if (url === '/costing/productions/1') return Promise.resolve({ data: PROD });
        if (url === '/costing/cards') return Promise.resolve({ data: [{ bom_reference_id: 7, reference: 'KT-CARD', reference_unit_cost_ht: 5, reference_computed_at: '2026-07-01T00:00:00' }] });
        if (url === '/costing/cards/7/history') return Promise.resolve({ data: HISTORY });
        return Promise.resolve({ data: {} });
    });
}

describe('CostingPage — deux modes (009)', () => {
    let restore;
    beforeEach(() => { jest.clearAllMocks(); restore = suppressActDeprecatedWarning(); mockGet(); });
    afterEach(() => restore?.());

    it('affiche le sélecteur de mode et le mode Production par défaut', async () => {
        render(<CostingPage />);
        expect(screen.getByTestId('mode-production')).toBeInTheDocument();
        expect(screen.getByTestId('mode-card')).toBeInTheDocument();
        expect(await screen.findByText('Coût total production HT')).toBeInTheDocument();
    });

    it('bascule en mode « Carte en général » → prix de référence unitaire', async () => {
        render(<CostingPage />);
        await screen.findByText('Coût total production HT');
        fireEvent.click(screen.getByTestId('mode-card'));
        expect(await screen.findByText('Prix de référence unitaire HT')).toBeInTheDocument();
        await waitFor(() => expect(axios.get).toHaveBeenCalledWith('/costing/cards'));
        await waitFor(() => expect(axios.get).toHaveBeenCalledWith('/costing/cards/7/history'));
    });
});
