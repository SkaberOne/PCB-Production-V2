/**
 * Panneau « Suivi des productions terminées » : liste avec barre, clic sur une
 * ligne → ouverture de la fenêtre de saisie. apiClient et SSE mockés.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
    cards_tested: 5, cards_validated: 3, cards_to_debug: 2, followup_note: '',
};

test('liste les productions terminées et ouvre la fenêtre au clic', async () => {
    apiClient.get.mockResolvedValue({ data: [ROW] });
    render(<ProductionFollowupPanel />);

    const row = await screen.findByText('prod-fini');
    fireEvent.click(row);

    // La fenêtre de saisie s'ouvre pour cette production.
    expect(await screen.findByText(/Suivi — prod-fini/)).toBeInTheDocument();
    expect(screen.getByLabelText('Validées')).toHaveValue(3);
});

test('état vide', async () => {
    apiClient.get.mockResolvedValue({ data: [] });
    render(<ProductionFollowupPanel />);
    expect(await screen.findByText(/Aucune production terminée/i)).toBeInTheDocument();
});
