/**
 * 007 — Table d'affectation Machine PnP : colonne conditionnement + case « Installé ».
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MachineAssignmentTable } from '../MachinePnpTables';
import apiClient from '../../../api/client';

jest.mock('../../../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn(), put: jest.fn() },
}));

const ASSIGNMENT = {
    slot_start: 1,
    slot_end: 1,
    component_id: 42,
    component_label: 'R 10K',
    footprint_pnp: 'R0402',
    feeder_size_mm: 8,
    placement_group: 'DYNAMIC',
    bom_presence_count: 1,
    total_board_quantity: 10,
    average_board_quantity: 5,
    conditionnement: { reel: 12, bag: 0, tube: 0 },
    progress: { is_installed: false, installed_by: null, installed_at: null },
};

beforeEach(() => {
    jest.clearAllMocks();
    apiClient.put.mockResolvedValue({ data: { is_installed: true, installed_by: 'POSTE-B', installed_at: '2026-07-22T10:00:00' } });
});

describe('MachineAssignmentTable — conditionnement + installé (007)', () => {
    it('affiche le conditionnement du composant à installer', () => {
        render(<MachineAssignmentTable assignments={[ASSIGNMENT]} productionId={7}
            selectedSlot={null} onSelectSlot={() => {}} onEditComponent={() => {}}
            selectedMachineBomRevision={null} />);
        expect(screen.getByText(/🎞️ 12/)).toBeInTheDocument();
    });

    it('coche « Installé » → PUT component-progress {installed:true}', async () => {
        render(<MachineAssignmentTable assignments={[ASSIGNMENT]} productionId={7}
            selectedSlot={null} onSelectSlot={() => {}} onEditComponent={() => {}}
            selectedMachineBomRevision={null} />);
        const cb = screen.getByRole('checkbox', { name: 'installé' });
        fireEvent.click(cb);
        await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith(
            '/marketplace/productions/7/component-progress/42',
            { installed: true },
        ));
    });
});
