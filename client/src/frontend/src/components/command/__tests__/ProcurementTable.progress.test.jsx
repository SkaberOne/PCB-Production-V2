/**
 * 007 — Vue « Commande et stock » : colonne conditionnement + case « Préparé ».
 * Vérifie l'affichage du conditionnement et le toggle (PUT component-progress).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProcurementTable from '../ProcurementTable';
import apiClient from '../../../api/client';

jest.mock('../../../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

const ROW = {
    key: 'k1',
    componentLibraryId: 42,
    componentName: '10K',
    value: '10K',
    footprint: 'R0402',
    requiredQuantity: 100,
    stockAvailableQty: 0,
    quantityToOrder: 100,
    conditionnement: { reel: 12, bag: 3, tube: 0 },
    progress: { is_prepared: false, prepared_by: null, prepared_at: null },
};

beforeEach(() => {
    jest.clearAllMocks();
    apiClient.get.mockResolvedValue({ data: [] });
    apiClient.put.mockResolvedValue({ data: { is_prepared: true, prepared_by: 'POSTE-A', prepared_at: '2026-07-22T10:00:00' } });
});

describe('ProcurementTable — conditionnement + préparé (007)', () => {
    it('affiche le conditionnement (formes non nulles)', async () => {
        render(<ProcurementTable rows={[ROW]} commandId={1} productionId={7} />);
        expect(await screen.findByText(/🎞️ 12 · sachet 3/)).toBeInTheDocument();
    });

    it('coche « Préparé » → PUT component-progress {prepared:true}', async () => {
        render(<ProcurementTable rows={[ROW]} commandId={1} productionId={7} />);
        const cb = await screen.findByRole('checkbox', { name: 'préparé' });
        fireEvent.click(cb);
        await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith(
            '/marketplace/productions/7/component-progress/42',
            { prepared: true },
        ));
    });
});
