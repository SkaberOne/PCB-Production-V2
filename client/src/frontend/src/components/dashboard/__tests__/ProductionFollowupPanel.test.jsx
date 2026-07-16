/**
 * Panneau « Suivi des productions terminées » : liste, édition d'un compteur et
 * enregistrement (PATCH followup). apiClient et le flux SSE sont mockés.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProductionFollowupPanel from '../ProductionFollowupPanel';
import apiClient from '../../../api/client';

jest.mock('../../../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
    extractApiError: (e) => e?.message || 'err',
}));
jest.mock('../../../hooks/useEventStream', () => ({ __esModule: true, default: () => {} }));

beforeEach(() => {
    apiClient.get.mockReset();
    apiClient.patch.mockReset();
});

const ROW = {
    id: 4, name: 'prod-fini', date_fin: '2026-07-15T16:00:00',
    boards_produced: 30, boards_target: 30,
    cards_tested: 0, cards_validated: 0, cards_to_debug: 0, followup_note: '',
};

test('liste les productions terminées et enregistre une correction', async () => {
    apiClient.get
        .mockResolvedValueOnce({ data: [ROW] })
        .mockResolvedValueOnce({ data: [{ ...ROW, cards_tested: 12 }] });
    apiClient.patch.mockResolvedValue({ data: { id: 4, cards_tested: 12 } });

    render(<ProductionFollowupPanel />);

    expect(await screen.findByText('prod-fini')).toBeInTheDocument();

    // La 1re cellule éditable (Testées) : passer de 0 à 12.
    const numberInputs = screen.getAllByRole('spinbutton');
    fireEvent.change(numberInputs[0], { target: { value: '12' } });

    fireEvent.click(screen.getByTitle('Enregistrer'));

    await waitFor(() => {
        expect(apiClient.patch).toHaveBeenCalledWith(
            '/marketplace/productions/4/followup',
            expect.objectContaining({ cards_tested: 12 }),
        );
    });
});

test('état vide', async () => {
    apiClient.get.mockResolvedValue({ data: [] });
    render(<ProductionFollowupPanel />);
    expect(await screen.findByText(/Aucune production terminée/i)).toBeInTheDocument();
});
