/**
 * 029 — Panneau « BOM enregistrées » : chaque carte affiche « réf — nom » et est
 * repliée par défaut (révisions cachées / toggle aria-expanded=false).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import BomLibraryCard from '../BomLibraryCard';
import apiClient from '../../../api/client';

jest.mock('../../../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn() },
    extractApiError: (e) => e?.message || null,
}));
jest.mock('../../../context/BomSessionContext', () => ({
    __esModule: true,
    useBomSession: () => ({
        setImportedBom: jest.fn(),
        updateImportWorkspace: jest.fn(),
        setSelectedBomEntries: jest.fn(),
    }),
}));

const ITEMS = { items: [
    { bom_reference_id: 9, bom_revision_id: 90, category: 'AMPLI', reference: 'AMPLI_GEN6', name: 'Ampli Gen 6', revision: 'A', side: 'TOP', status: 'ACTIVE' },
    { bom_reference_id: 10, bom_revision_id: 100, category: 'AMPLI', reference: 'LEGACY_CARD', revision: 'A', side: 'TOP', status: 'ACTIVE' },
] };

beforeEach(() => {
    jest.clearAllMocks();
    apiClient.get.mockResolvedValue({ data: ITEMS });
});

describe('BomLibraryCard — réf-nom + replié par défaut (029)', () => {
    it('affiche « référence — nom » (référence seule si legacy) et replie chaque carte', async () => {
        render(<BomLibraryCard />);

        // Réf — nom au niveau du groupe carte.
        expect(await screen.findByText('AMPLI_GEN6 — Ampli Gen 6')).toBeInTheDocument();
        // Carte legacy sans nom : référence seule, pas de « — » orphelin.
        expect(screen.getByText('LEGACY_CARD')).toBeInTheDocument();

        // Chaque carte est repliée par défaut : le toggle propose « Développer »
        // (aria-expanded=false), pas « Réduire ».
        await waitFor(() => {
            expect(screen.getByLabelText('Développer AMPLI_GEN6')).toHaveAttribute('aria-expanded', 'false');
        });
        expect(screen.queryByLabelText('Réduire AMPLI_GEN6')).not.toBeInTheDocument();
    });
});
