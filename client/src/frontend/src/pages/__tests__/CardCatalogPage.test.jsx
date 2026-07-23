import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import CardCatalogPage from '../CardCatalogPage';
import { suppressActDeprecatedWarning } from '../../testActWarnings';

// Même stratégie de mock que BomViewerPage.revisionParam : l'instance axios.create()
// partage les jest.fn du default, donc axios.get pilote aussi apiClient.get.
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

const CARDS = [
    {
        bom_reference_id: 7,
        reference: 'AMPLI_GEN6',
        name: 'Ampli',
        part_number: 'KT01',
        card_type: 'SIMPLE',
        category: null,
        revisions: ['REV_A'],
        unit_price: 12.5,
        price_complete: true,
        assembly_items: [],
    },
];

const FILES = {
    items: [
        {
            bom_reference_id: 7,
            bom_revision_id: 38,
            reference: 'AMPLI_GEN6',
            revision: 'REV_A',
            side: 'TOP',
            status: 'VALIDATED',
            category: null,
            created_at: '2026-07-01T10:00:00Z',
        },
    ],
};

const CATEGORIES = { items: [{ id: 1, name: 'Cartes principales' }] };

function mockGet() {
    axios.get.mockImplementation((url) => {
        if (url === '/marketplace/cards') return Promise.resolve({ data: CARDS });
        if (url === '/bom/files') return Promise.resolve({ data: FILES });
        if (url === '/bom/categories') return Promise.resolve({ data: CATEGORIES });
        return Promise.resolve({ data: {} });
    });
}

function renderPage() {
    return render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <CardCatalogPage />
        </MemoryRouter>,
    );
}

describe('CardCatalogPage — fusion Cartes + édition (prompt 001)', () => {
    let restoreConsoleError;

    beforeEach(() => {
        jest.clearAllMocks();
        restoreConsoleError = suppressActDeprecatedWarning();
        mockGet();
        axios.put.mockResolvedValue({ data: {} });
        axios.patch.mockResolvedValue({ data: {} });
        axios.post.mockResolvedValue({ data: {} });
        axios.delete.mockResolvedValue({ data: {} });
    });

    afterEach(() => {
        restoreConsoleError?.();
    });

    it('charge et affiche la liste des cartes (cards + files + categories)', async () => {
        renderPage();
        expect(await screen.findByText('AMPLI_GEN6')).toBeInTheDocument();
        expect(axios.get).toHaveBeenCalledWith('/marketplace/cards');
        expect(axios.get).toHaveBeenCalledWith('/bom/files');
        expect(axios.get).toHaveBeenCalledWith('/bom/categories');
    });

    it('ouvre le détail d\'une carte avec métadonnées + révisions + accès BOM', async () => {
        renderPage();
        fireEvent.click(await screen.findByText('AMPLI_GEN6'));
        expect(await screen.findByLabelText('Nom de la carte')).toBeInTheDocument();
        expect(screen.getByText('Révisions & BOM')).toBeInTheDocument();
        // La révision est repliée (prompt 019) : déplier « Rev. A » révèle les
        // faces et le bouton « Ouvrir » (mène à la Revue BOM éditable).
        fireEvent.click(screen.getByText('Rev. A'));
        expect(await screen.findByRole('button', { name: /Ouvrir/i })).toBeInTheDocument();
    });

    it('édite le nom et enregistre (PUT /marketplace/cards/{id})', async () => {
        renderPage();
        fireEvent.click(await screen.findByText('AMPLI_GEN6'));
        const nameInput = await screen.findByLabelText('Nom de la carte');
        fireEvent.change(nameInput, { target: { value: 'Ampli V2' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => {
            expect(axios.put).toHaveBeenCalledWith(
                '/marketplace/cards/7',
                expect.objectContaining({ name: 'Ampli V2' }),
            );
        });
    });

    it('édite la catégorie au même endroit et la persiste (PATCH .../category)', async () => {
        renderPage();
        fireEvent.click(await screen.findByText('AMPLI_GEN6'));
        const catInput = await screen.findByLabelText('Catégorie');
        fireEvent.change(catInput, { target: { value: 'Cartes principales' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => {
            expect(axios.patch).toHaveBeenCalledWith(
                '/bom/references/7/category',
                { category: 'Cartes principales' },
            );
        });
    });
});
