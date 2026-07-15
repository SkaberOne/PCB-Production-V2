/**
 * Dialog « Corriger les lots » : liste les lots, corrige la quantité (PATCH,
 * remplace) et annule (POST cancel).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProductionRunsDialog from '../ProductionRunsDialog';
import apiClient from '../../../api/client';

jest.mock('../../../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
    extractApiError: (e) => e?.message || 'err',
}));

const PROD = { id: 12, name: 'prod-test' };

beforeEach(() => {
    apiClient.get.mockReset();
    apiClient.post.mockReset();
    apiClient.patch.mockReset();
});

function renderDialog() {
    const onChanged = jest.fn();
    render(<ProductionRunsDialog open production={PROD} onClose={() => {}} onChanged={onChanged} />);
    return { onChanged };
}

test('corrige la quantité d\'un lot (PATCH remplace)', async () => {
    apiClient.get
        .mockResolvedValueOnce({ data: [{ id: 7, production_id: 12, boards_produced: 5, is_cancelled: false, created_at: '2026-07-15T10:00:00', created_by: 'poste1' }] })
        .mockResolvedValueOnce({ data: [{ id: 7, production_id: 12, boards_produced: 3, is_cancelled: false, created_at: '2026-07-15T10:00:00', created_by: 'poste1' }] });
    apiClient.patch.mockResolvedValue({ data: { id: 7, boards_produced: 3 } });

    const { onChanged } = renderDialog();

    const input = await screen.findByDisplayValue('5');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.click(screen.getByTitle('Enregistrer la correction'));

    await waitFor(() => {
        expect(apiClient.patch).toHaveBeenCalledWith(
            '/marketplace/productions/12/runs/7',
            { boards_produced: 3 },
        );
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
});

test('annule un lot (POST cancel)', async () => {
    apiClient.get
        .mockResolvedValueOnce({ data: [{ id: 9, production_id: 12, boards_produced: 4, is_cancelled: false, created_at: '2026-07-15T11:00:00' }] })
        .mockResolvedValueOnce({ data: [] });
    apiClient.post.mockResolvedValue({ data: { id: 9, is_cancelled: true } });

    const { onChanged } = renderDialog();

    await screen.findByDisplayValue('4');
    fireEvent.click(screen.getByTitle('Annuler ce lot'));

    await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/marketplace/productions/12/runs/9/cancel');
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
});
