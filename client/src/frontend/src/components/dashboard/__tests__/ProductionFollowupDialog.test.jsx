/**
 * Fenêtre de saisie du suivi : édite les compteurs et enregistre (PATCH followup).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProductionFollowupDialog from '../ProductionFollowupDialog';
import apiClient from '../../../api/client';

jest.mock('../../../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
    extractApiError: (e) => e?.message || 'err',
}));

const PROD = {
    id: 4, name: 'prod-fini', boards_produced: 30,
    cards_tested: 0, cards_validated: 0, cards_to_debug: 0, followup_note: '',
};

beforeEach(() => { apiClient.patch.mockReset(); });

test('prérempli, édite et enregistre le suivi', async () => {
    apiClient.patch.mockResolvedValue({ data: { id: 4 } });
    const onSaved = jest.fn();
    const onClose = jest.fn();

    render(<ProductionFollowupDialog open production={PROD} onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText('Testées'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Validées'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('À débugger'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'C3 HS' } });

    fireEvent.click(screen.getByText('Enregistrer'));

    await waitFor(() => {
        expect(apiClient.patch).toHaveBeenCalledWith(
            '/marketplace/productions/4/followup',
            { cards_tested: 12, cards_validated: 10, cards_to_debug: 2, note: 'C3 HS' },
        );
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
});

test('réintègre la production (PATCH status DRAFT)', async () => {
    apiClient.patch.mockResolvedValue({ data: {} });
    const onReintegrated = jest.fn();
    const onClose = jest.fn();

    render(<ProductionFollowupDialog open production={PROD} onClose={onClose} onSaved={() => {}} onReintegrated={onReintegrated} />);

    fireEvent.click(screen.getByText('Réintégrer'));

    await waitFor(() => {
        expect(apiClient.patch).toHaveBeenCalledWith('/marketplace/productions/4', { status: 'DRAFT' });
    });
    await waitFor(() => expect(onReintegrated).toHaveBeenCalled());
});
