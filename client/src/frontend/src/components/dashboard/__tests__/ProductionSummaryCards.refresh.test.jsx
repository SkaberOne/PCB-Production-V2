/**
 * 028 #4 — le panneau « Productions en cours » se re-fetch quand refreshKey change
 * (après une mutation production : renommage, etc.), sans clic sur « Actualiser ».
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import ProductionSummaryCards from '../ProductionSummaryCards';
import apiClient from '../../../api/client';

jest.mock('../../../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn() },
    extractApiError: (e) => e?.message || null,
}));
// SSE désactivé en test (évite fetch/AbortController réels).
jest.mock('../../../hooks/useEventStream', () => ({ __esModule: true, default: () => {} }));

const prod = (name) => ([{
    id: 1, status: 'ACTIVE', name, boards_target: 0, boards_produced: 0,
    stock: null, command: null,
}]);

beforeEach(() => {
    jest.clearAllMocks();
    apiClient.get
        .mockResolvedValueOnce({ data: prod('ANCIEN NOM') })
        .mockResolvedValueOnce({ data: prod('NOUVEAU NOM') });
});

describe('ProductionSummaryCards — refresh sur refreshKey (028 #4)', () => {
    it('re-fetch et affiche le nouveau nom quand refreshKey change', async () => {
        const { rerender } = render(<ProductionSummaryCards activeProductionId={1} refreshKey={0} />);
        expect(await screen.findByText('ANCIEN NOM')).toBeInTheDocument();
        expect(apiClient.get).toHaveBeenCalledTimes(1);

        // Simule une mutation production → la clé change.
        rerender(<ProductionSummaryCards activeProductionId={1} refreshKey={1} />);

        await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
        expect(await screen.findByText('NOUVEAU NOM')).toBeInTheDocument();
    });

    it('ne re-fetch pas au montage tant que refreshKey ne change pas', async () => {
        render(<ProductionSummaryCards activeProductionId={1} refreshKey={5} />);
        expect(await screen.findByText('ANCIEN NOM')).toBeInTheDocument();
        // Un seul appel : le montage, pas de double-fetch dû à refreshKey initial.
        expect(apiClient.get).toHaveBeenCalledTimes(1);
    });
});
