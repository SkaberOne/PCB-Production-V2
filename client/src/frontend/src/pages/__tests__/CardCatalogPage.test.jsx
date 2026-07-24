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

// ── Prompt 020 : recherche + suppression unitaire/multiple ────────────────────

const CARDS_020 = [
    { bom_reference_id: 1, reference: 'AMPLI_GEN6', name: 'Ampli', part_number: 'KT01', card_type: 'SIMPLE', category: null, revisions: ['REV_A'], unit_price: 12.5, price_complete: true, assembly_items: [] },
    { bom_reference_id: 2, reference: 'FILTRE_X', name: 'Filtre à café', part_number: 'KT02', card_type: 'SIMPLE', category: null, revisions: ['REV_A'], unit_price: 8, price_complete: true, assembly_items: [] },
    { bom_reference_id: 3, reference: 'CARTE_LIEE', name: 'Reliée', part_number: 'KT03', card_type: 'SIMPLE', category: null, revisions: ['REV_A'], unit_price: 5, price_complete: true, assembly_items: [] },
];

function mockGet020() {
    axios.get.mockImplementation((url) => {
        if (url === '/marketplace/cards') return Promise.resolve({ data: CARDS_020 });
        if (url === '/bom/files') return Promise.resolve({ data: { items: [] } });
        if (url === '/bom/categories') return Promise.resolve({ data: { items: [] } });
        return Promise.resolve({ data: {} });
    });
}

describe('CardCatalogPage — prompt 020 (recherche + suppression)', () => {
    let restoreConsoleError;
    beforeEach(() => {
        jest.clearAllMocks();
        restoreConsoleError = suppressActDeprecatedWarning();
        mockGet020();
        axios.put.mockResolvedValue({ data: {} });
        axios.patch.mockResolvedValue({ data: {} });
        axios.post.mockResolvedValue({ data: {} });
        axios.delete.mockResolvedValue({ data: {} });
    });
    afterEach(() => { restoreConsoleError?.(); });

    it('filtre par référence ET par nom (insensible accents)', async () => {
        renderPage();
        expect(await screen.findByText('AMPLI_GEN6')).toBeInTheDocument();
        const search = screen.getByLabelText('Rechercher une carte');
        // par nom, avec accent absent dans la requête
        fireEvent.change(search, { target: { value: 'cafe' } });
        expect(screen.getByText('FILTRE_X')).toBeInTheDocument();
        expect(screen.queryByText('AMPLI_GEN6')).not.toBeInTheDocument();
        // par référence
        fireEvent.change(search, { target: { value: 'ampli' } });
        expect(screen.getByText('AMPLI_GEN6')).toBeInTheDocument();
        expect(screen.queryByText('FILTRE_X')).not.toBeInTheDocument();
    });

    it('« tout sélectionner » agit sur le résultat filtré + bulk delete + rapport', async () => {
        axios.delete.mockResolvedValue({ data: { deleted: [{ id: 1, reference: 'AMPLI_GEN6' }], skipped: [{ id: 3, reference: 'CARTE_LIEE', reasons: ['du stock cartes (quantité > 0)'] }] } });
        renderPage();
        await screen.findByText('AMPLI_GEN6');
        // filtre pour ne garder que AMPLI, puis tout sélectionner (sur filtré)
        const search = screen.getByLabelText('Rechercher une carte');
        fireEvent.change(search, { target: { value: 'ampli' } });
        fireEvent.click(screen.getByLabelText('Tout sélectionner'));
        // action bulk visible avec le compte
        const bulkBtn = screen.getByRole('button', { name: /Supprimer la sélection \(1\)/ });
        fireEvent.click(bulkBtn);
        // confirmation
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        await waitFor(() => {
            expect(axios.delete).toHaveBeenCalledWith('/bom/references', { data: { ids: [1] } });
        });
        // rapport affiché
        expect(await screen.findByText('Rapport de suppression')).toBeInTheDocument();
        expect(screen.getByText(/1 supprimée\(s\), 1 ignorée\(s\)/)).toBeInTheDocument();
        expect(screen.getByText(/CARTE_LIEE/)).toBeInTheDocument();
    });

    it('sélection multiple par cases individuelles', async () => {
        renderPage();
        await screen.findByText('AMPLI_GEN6');
        fireEvent.click(screen.getByLabelText('Sélectionner AMPLI_GEN6'));
        fireEvent.click(screen.getByLabelText('Sélectionner FILTRE_X'));
        expect(screen.getByRole('button', { name: /Supprimer la sélection \(2\)/ })).toBeInTheDocument();
    });

    it('suppression unitaire depuis la fiche (DELETE /bom/references/{id})', async () => {
        renderPage();
        fireEvent.click(await screen.findByText('AMPLI_GEN6'));
        fireEvent.click(await screen.findByRole('button', { name: 'Supprimer la carte' }));
        // ConfirmDialog carte (bouton confirm = « Supprimer »)
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        await waitFor(() => {
            expect(axios.delete).toHaveBeenCalledWith('/bom/references/1');
        });
    });

    it('affiche une erreur si la carte est liée (409)', async () => {
        axios.delete.mockRejectedValue({ response: { status: 409, data: { detail: 'Carte AMPLI_GEN6 non supprimable : liee a du stock cartes.' } } });
        renderPage();
        fireEvent.click(await screen.findByText('AMPLI_GEN6'));
        fireEvent.click(await screen.findByRole('button', { name: 'Supprimer la carte' }));
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        expect(await screen.findByText(/non supprimable/)).toBeInTheDocument();
    });
});

// ── Prompt 023 : refus 409 détaillé (bloqueurs nommés) ────────────────────────

describe('CardCatalogPage — refus suppression détaillé (023)', () => {
    let restoreConsoleError;
    beforeEach(() => {
        jest.clearAllMocks();
        restoreConsoleError = suppressActDeprecatedWarning();
        mockGet020();
        axios.put.mockResolvedValue({ data: {} });
        axios.patch.mockResolvedValue({ data: {} });
        axios.post.mockResolvedValue({ data: {} });
        axios.delete.mockResolvedValue({ data: {} });
    });
    afterEach(() => { restoreConsoleError?.(); });

    it('suppression unitaire refusée : message nomme les commandes (interne + client)', async () => {
        axios.delete.mockRejectedValue({ response: { status: 409, data: {
            detail: 'Carte AMPLI_GEN6 non supprimable — retenue par : commande interne #1 "Cmd" (DRAFT), commande client CMD-0003 (DELIVERED).',
            reference: 'AMPLI_GEN6',
            links: [
                { nature: 'commande interne', id: 1, label: 'commande interne #1 "Cmd" (DRAFT)' },
                { nature: 'commande client', reference: 'CMD-0003', label: 'commande client CMD-0003 (DELIVERED)' },
            ],
        } } });
        renderPage();
        fireEvent.click(await screen.findByText('AMPLI_GEN6'));
        fireEvent.click(await screen.findByRole('button', { name: 'Supprimer la carte' }));
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        const msg = await screen.findByText(/non supprimable/);
        expect(msg).toHaveTextContent('commande interne #1');
        expect(msg).toHaveTextContent('commande client CMD-0003');
    });

    it('rapport bulk : chaque bloqueur nommé (interne vs client) via links', async () => {
        axios.delete.mockResolvedValue({ data: { deleted: [], skipped: [
            { id: 3, reference: 'CARTE_LIEE', reasons: ['commande interne #1 "Cmd" (DRAFT)', 'commande client CMD-0003 (DELIVERED)'],
              links: [
                { nature: 'commande interne', id: 1, label: 'commande interne #1 "Cmd" (DRAFT)' },
                { nature: 'commande client', reference: 'CMD-0003', label: 'commande client CMD-0003 (DELIVERED)' },
              ] },
        ] } });
        renderPage();
        await screen.findByText('AMPLI_GEN6');
        fireEvent.click(screen.getByLabelText('Sélectionner CARTE_LIEE'));
        fireEvent.click(screen.getByRole('button', { name: /Supprimer la sélection \(1\)/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        expect(await screen.findByText('Rapport de suppression')).toBeInTheDocument();
        expect(screen.getByText(/commande interne #1/)).toBeInTheDocument();
        expect(screen.getByText(/commande client CMD-0003/)).toBeInTheDocument();
    });
});

// ── Prompt 025 : éditer la référence d'une carte ──────────────────────────────

describe('CardCatalogPage — édition de la référence (025)', () => {
    let restoreConsoleError;
    beforeEach(() => {
        jest.clearAllMocks();
        restoreConsoleError = suppressActDeprecatedWarning();
        mockGet(); // carte AMPLI_GEN6 (id 7)
        axios.put.mockResolvedValue({ data: {} });
        axios.patch.mockResolvedValue({ data: {} });
        axios.post.mockResolvedValue({ data: {} });
        axios.delete.mockResolvedValue({ data: {} });
    });
    afterEach(() => { restoreConsoleError?.(); });

    it('le champ Référence est éditable et envoyé dans le PUT', async () => {
        renderPage();
        fireEvent.click(await screen.findByText('AMPLI_GEN6'));
        const refInput = await screen.findByLabelText('Référence');
        expect(refInput).toHaveValue('AMPLI_GEN6');
        fireEvent.change(refInput, { target: { value: 'AMPLI_GEN6_V2' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => {
            expect(axios.put).toHaveBeenCalledWith(
                '/marketplace/cards/7',
                expect.objectContaining({ reference: 'AMPLI_GEN6_V2' }),
            );
        });
    });

    it('référence déjà prise → 409 affiché sans fermer le pop-up', async () => {
        axios.put.mockRejectedValue({ response: { status: 409, data: { detail: 'Référence « AMPLI_GEN6_V2 » déjà utilisée par une autre carte' } } });
        renderPage();
        fireEvent.click(await screen.findByText('AMPLI_GEN6'));
        const refInput = await screen.findByLabelText('Référence');
        fireEvent.change(refInput, { target: { value: 'AMPLI_GEN6_V2' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        expect(await screen.findByText(/déjà utilisée/)).toBeInTheDocument();
        // pop-up conservé (le champ Nom est toujours présent)
        expect(screen.getByLabelText('Nom de la carte')).toBeInTheDocument();
    });
});
