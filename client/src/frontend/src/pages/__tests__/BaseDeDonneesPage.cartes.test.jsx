/**
 * 008 — « Cartes » intégré comme onglet de « Base de données ».
 * Vérifie la présence de l'onglet, l'ouverture directe via ?tab=cartes,
 * et le rendu du catalogue existant (réutilisé, non dupliqué).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import BaseDeDonneesPage from '../BaseDeDonneesPage';
import { suppressActDeprecatedWarning } from '../../testActWarnings';

jest.mock('axios', () => {
    const instance = {
        get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(),
        interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    };
    return { __esModule: true, default: { ...instance, create: jest.fn(() => instance) } };
});

const CARDS = [{
    bom_reference_id: 7, reference: 'AMPLI_GEN6', name: 'Ampli', part_number: 'KT01',
    card_type: 'SIMPLE', category: null, revisions: ['REV_A'], unit_price: 12.5,
    price_complete: true, assembly_items: [],
}];

function mockGet() {
    axios.get.mockImplementation((url) => {
        if (url === '/marketplace/cards') return Promise.resolve({ data: CARDS });
        if (url === '/bom/files') return Promise.resolve({ data: { items: [] } });
        if (url === '/bom/categories') return Promise.resolve({ data: { items: [] } });
        return Promise.resolve({ data: {} });
    });
}

function renderAt(path) {
    return render(
        <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <BaseDeDonneesPage />
        </MemoryRouter>,
    );
}

describe('BaseDeDonneesPage — onglet Cartes (008)', () => {
    let restore;
    beforeEach(() => { jest.clearAllMocks(); restore = suppressActDeprecatedWarning(); mockGet(); });
    afterEach(() => restore?.());

    it('affiche un onglet « Cartes »', () => {
        renderAt('/base-donnees');
        expect(screen.getByRole('tab', { name: 'Cartes' })).toBeInTheDocument();
    });

    it('ouvre directement le catalogue via ?tab=cartes', async () => {
        renderAt('/base-donnees?tab=cartes');
        expect(await screen.findByText('AMPLI_GEN6')).toBeInTheDocument();
        expect(axios.get).toHaveBeenCalledWith('/marketplace/cards');
    });

    it('clic sur l\'onglet Cartes monte le catalogue existant', async () => {
        renderAt('/base-donnees');
        fireEvent.click(screen.getByRole('tab', { name: 'Cartes' }));
        expect(await screen.findByText('AMPLI_GEN6')).toBeInTheDocument();
    });
});
