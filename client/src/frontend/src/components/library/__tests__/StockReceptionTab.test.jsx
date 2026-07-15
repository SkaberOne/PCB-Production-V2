/**
 * Onglet Réception : mouvements récents annulables + option « Créer et
 * réceptionner » dans le menu déroulant de recherche.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StockReceptionTab from '../StockReceptionTab';
import apiClient from '../../../api/client';

jest.mock('../../../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn() },
    extractApiError: (e) => e?.message || 'err',
}));

function renderTab() {
    const onFeedback = jest.fn();
    const onError = jest.fn();
    const onRefresh = jest.fn().mockResolvedValue();
    render(<StockReceptionTab rows={[]} onRefresh={onRefresh} onError={onError} onFeedback={onFeedback} />);
    return { onFeedback, onError, onRefresh };
}

beforeEach(() => {
    apiClient.get.mockReset();
    apiClient.post.mockReset();
});

test('liste les mouvements récents et permet de les annuler', async () => {
    apiClient.get.mockResolvedValue({
        data: [{
            id: 7, component_id: 1, value: '10K', mpn: 'RC-10K', reference: 'LIB',
            sens: 'IN', qty: 100, signed_qty: 100, motif: 'reception',
            date: '2026-07-15T10:00:00', created_by: 'poste-atelier',
        }],
    });
    apiClient.post.mockResolvedValue({ data: { qty_pieces: 0 } });

    const { onFeedback } = renderTab();

    expect(await screen.findByText('RC-10K')).toBeInTheDocument();
    expect(screen.getByText('+100')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Annuler/i }));

    await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/marketplace/stock/movements/7/cancel');
    });
    await waitFor(() => expect(onFeedback).toHaveBeenCalled());
});

test('propose « Créer et réceptionner » quand la recherche n\'a pas de match', async () => {
    apiClient.get.mockResolvedValue({ data: [] });
    renderTab();

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'NEWPART99' } });

    // rows=[] → la seule option du menu est « Créer et réceptionner « … » ».
    const createOpt = await screen.findByRole('option');
    expect(createOpt).toHaveTextContent(/Créer et réceptionner/i);
    fireEvent.click(createOpt);

    // Le dialog de création s'ouvre prérempli avec le texte saisi (comme MPN).
    expect(await screen.findByDisplayValue('NEWPART99')).toBeInTheDocument();
});
