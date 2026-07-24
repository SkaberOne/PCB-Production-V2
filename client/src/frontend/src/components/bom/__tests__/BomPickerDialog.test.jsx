import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import BomPickerDialog from '../BomPickerDialog';

// Même stratégie de mock que les autres tests : l'instance axios.create()
// partage les jest.fn du default, donc axios.get pilote apiClient.get.
jest.mock('axios', () => {
    const instance = {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
        interceptors: {
            request: { use: jest.fn() },
            response: { use: jest.fn() },
        },
    };
    return {
        __esModule: true,
        default: { ...instance, create: jest.fn(() => instance) },
    };
});

const FILES = {
    items: [
        { bom_revision_id: 38, reference: 'AMPLI_GEN6', revision: 'REV_A', side: 'TOP', status: 'ACTIVE', category: 'Ampli' },
        { bom_revision_id: 48, reference: 'Carrier Board D3000', revision: 'REV_E', side: 'BOT', status: 'ACTIVE' },
        { bom_revision_id: 49, reference: 'Carrier Board D3000', revision: 'REV_E', side: 'TOP', status: 'ACTIVE' },
    ],
};

describe('BomPickerDialog', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        axios.get.mockResolvedValue({ data: FILES });
    });

    it('liste les BOM et confirme les ids cochés', async () => {
        const onConfirm = jest.fn();
        render(
            <BomPickerDialog open onClose={() => {}} onConfirm={onConfirm} alreadySelectedIds={[]} />,
        );

        // La liste est chargée depuis /bom/files.
        await waitFor(() => {
            expect(screen.getByText(/AMPLI_GEN6 · REV_A · TOP/)).toBeInTheDocument();
        });
        expect(axios.get).toHaveBeenCalledWith('/bom/files');

        // Coche deux révisions puis confirme.
        fireEvent.click(screen.getByText(/AMPLI_GEN6 · REV_A · TOP/));
        fireEvent.click(screen.getByText(/Carrier Board D3000 · REV_E · TOP/));
        fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onConfirm.mock.calls[0][0].sort()).toEqual([38, 49]);
    });

    it('désactive les révisions déjà dans la session', async () => {
        const onConfirm = jest.fn();
        render(
            <BomPickerDialog open onClose={() => {}} onConfirm={onConfirm} alreadySelectedIds={[38]} />,
        );

        await waitFor(() => {
            expect(screen.getAllByText('Déjà dans la session').length).toBe(1);
        });

        // Le bouton Ajouter reste désactivé tant que rien de nouveau n'est coché.
        expect(screen.getByRole('button', { name: /Ajouter/ })).toBeDisabled();
    });

    it('affiche « référence — nom » quand la carte a un nom, référence seule sinon (029)', async () => {
        axios.get.mockResolvedValue({ data: { items: [
            { bom_revision_id: 70, reference: 'AMPLI_GEN6', name: 'Ampli Gen 6', revision: 'REV_A', side: 'TOP', status: 'ACTIVE' },
            { bom_revision_id: 71, reference: 'LEGACY_CARD', revision: 'REV_A', side: 'TOP', status: 'ACTIVE' },
        ] } });
        render(<BomPickerDialog open onClose={() => {}} onConfirm={() => {}} alreadySelectedIds={[]} />);
        await waitFor(() => {
            expect(screen.getByText(/AMPLI_GEN6 — Ampli Gen 6 · REV_A · TOP/)).toBeInTheDocument();
        });
        // Carte sans nom : référence seule, pas de « — » orphelin.
        expect(screen.getByText(/LEGACY_CARD · REV_A · TOP/)).toBeInTheDocument();
        expect(screen.queryByText(/LEGACY_CARD —/)).not.toBeInTheDocument();
    });
});
