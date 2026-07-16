/**
 * Dialog « Historique » : liste les productions terminées avec cartes produites
 * et date de fin (apiClient mocké).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import ProductionHistoryDialog from '../ProductionHistoryDialog';
import apiClient from '../../../api/client';

jest.mock('../../../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn() },
    extractApiError: (e) => e?.message || 'err',
}));

beforeEach(() => { apiClient.get.mockReset(); });

test('affiche les productions terminées avec date de fin', async () => {
    apiClient.get.mockResolvedValue({
        data: [
            { id: 3, name: 'prod-A', boards_produced: 30, boards_target: 30, date_fin: '2026-07-14T16:30:00' },
            { id: 1, name: 'prod-B', boards_produced: 12, boards_target: 20, date_fin: '2026-07-10T09:00:00' },
        ],
    });

    render(<ProductionHistoryDialog open onClose={() => {}} />);

    expect(await screen.findByText('prod-A')).toBeInTheDocument();
    expect(screen.getByText('prod-B')).toBeInTheDocument();
    expect(screen.getByText('30 / 30')).toBeInTheDocument();
    // La date de fin est formatée (jour/mois/année).
    expect(screen.getByText(/14\/07\/2026/)).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/reports/productions-history?limit=200');
});

test('état vide quand aucune production terminée', async () => {
    apiClient.get.mockResolvedValue({ data: [] });
    render(<ProductionHistoryDialog open onClose={() => {}} />);
    expect(await screen.findByText(/Aucune production terminée/i)).toBeInTheDocument();
});
