/**
 * Stock cartes — vue groupée par carte + barre de suivi (010 + 022).
 * 010 : barre ProductionSuiviBar (testées / validées / à débugger).
 * 022 : regroupement par carte (résumé agrégé), déroulant par révision, recherche réf+nom.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BoardStockPage from '../BoardStockPage';
import apiClient from '../../api/client';

jest.mock('../../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn(), put: jest.fn() },
}));

const ROWS = [
    {
        bom_reference_id: 7, reference: 'KT-CARD', name: 'Ampli Test', revision: 'REV_A',
        qty_in_stock: 100, min_stock: 10, stock_value: 500, unit_price_effective: 5,
        reference_unit_cost_ht: 5, unit_price_override: null,
        cards_tested: 40, cards_validated: 30, cards_to_debug: 5, notes: '', below_min: false,
    },
    {
        bom_reference_id: 7, reference: 'KT-CARD', name: 'Ampli Test', revision: 'REV_B',
        qty_in_stock: 20, min_stock: 0, stock_value: 100, unit_price_effective: 5,
        reference_unit_cost_ht: 5, unit_price_override: null,
        cards_tested: 5, cards_validated: 5, cards_to_debug: 0, notes: '', below_min: false,
    },
    {
        bom_reference_id: 8, reference: 'FILTRE-X', name: 'Filtre à café', revision: 'REV_A',
        qty_in_stock: 0, min_stock: 0, stock_value: 0, unit_price_effective: 2,
        reference_unit_cost_ht: 2, unit_price_override: null,
        cards_tested: 0, cards_validated: 0, cards_to_debug: 0, notes: '', below_min: false,
    },
];

beforeEach(() => {
    jest.clearAllMocks();
    apiClient.get.mockResolvedValue({ data: ROWS });
    apiClient.put.mockResolvedValue({ data: {} });
});

describe('BoardStockPage — barre de suivi (010)', () => {
    it('affiche la barre de suivi agrégée par carte', async () => {
        render(<BoardStockPage />);
        expect(await screen.findByText('KT-CARD')).toBeInTheDocument();
        // Barre agrégée au niveau carte (résumé).
        expect(screen.getByTestId('suivi-bar-card-7')).toBeInTheDocument();
        await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/marketplace/board-stock'));
    });
});

describe('BoardStockPage — vue groupée par carte + recherche (022)', () => {
    it('regroupe par carte : une ligne par référence avec total stock agrégé', async () => {
        render(<BoardStockPage />);
        await screen.findByText('KT-CARD');
        // 2 cartes distinctes, pas 3 lignes de révision au 1er niveau.
        expect(screen.getByText('Ampli Test')).toBeInTheDocument();
        expect(screen.getByText('2 rév.')).toBeInTheDocument();      // KT-CARD a 2 révisions
        expect(screen.getByText('120')).toBeInTheDocument();          // total stock agrégé (100 + 20)
    });

    it('déroule une carte pour montrer le détail par révision', async () => {
        render(<BoardStockPage />);
        const cardRow = (await screen.findByText('KT-CARD')).closest('tr');
        fireEvent.click(cardRow);
        // Détail par révision visible : barres par révision + libellés Rev.
        expect(await screen.findByTestId('suivi-bar-7-REV_A')).toBeInTheDocument();
        expect(screen.getByTestId('suivi-bar-7-REV_B')).toBeInTheDocument();
        expect(screen.getAllByText('Rev. A').length).toBeGreaterThanOrEqual(1);
    });

    it('recherche filtre par référence ET par nom (insensible accents)', async () => {
        render(<BoardStockPage />);
        await screen.findByText('KT-CARD');
        const searchBox = screen.getByLabelText('Rechercher une carte');
        // par nom, accent absent dans la requête
        fireEvent.change(searchBox, { target: { value: 'cafe' } });
        expect(screen.getByText('FILTRE-X')).toBeInTheDocument();
        expect(screen.queryByText('KT-CARD')).not.toBeInTheDocument();
        // par référence
        fireEvent.change(searchBox, { target: { value: 'kt-card' } });
        expect(screen.getByText('KT-CARD')).toBeInTheDocument();
        expect(screen.queryByText('FILTRE-X')).not.toBeInTheDocument();
    });

    it('clic sur une révision ouvre l\'éditeur (PUT sur enregistrement)', async () => {
        render(<BoardStockPage />);
        const cardRow = (await screen.findByText('KT-CARD')).closest('tr');
        fireEvent.click(cardRow);
        // 2 cartes ont une « Rev. A » (montées dans les Collapse) → cibler celle de KT-CARD (triée en tête).
        const revChip = (await screen.findAllByText('Rev. A'))[0];
        fireEvent.click(revChip.closest('tr'));
        expect(await screen.findByLabelText('Quantité en stock')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith(
            '/marketplace/board-stock/7', expect.objectContaining({ revision: 'REV_A' }),
        ));
    });
});
