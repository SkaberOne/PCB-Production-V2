/**
 * 011 — Import en masse du catalogue : déclencheur (dry-run / import) + rapport.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CatalogueImportPanel from '../CatalogueImportPanel';
import apiClient from '../../../api/client';

jest.mock('../../../api/client', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn() },
    extractApiError: (e) => e?.message || null,
}));

const REPORT = {
    root_path: '\\\\rs\\Elec', dry_run: true, cards_scanned: 3,
    revisions_imported: 0, components_created: 0,
    skipped_dirs: ['Archives'],
    rows: [
        { reference: 'KT190562', name: 'NanoSH MK2', revision: 'A', status: 'importable', message: '' },
        { reference: 'KT200001', name: 'KiCad Board', revision: 'A', status: 'kicad', message: '' },
    ],
};

beforeEach(() => {
    jest.clearAllMocks();
    apiClient.get.mockResolvedValue({ data: { projects_root_path: '\\\\rs\\Elec\\Projets' } });
    apiClient.post.mockResolvedValue({ data: REPORT });
});

describe('CatalogueImportPanel — import catalogue (011)', () => {
    it('affiche le dossier configuré et les boutons dry-run / import', async () => {
        render(<CatalogueImportPanel />);
        await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/marketplace/stock/settings'));
        expect(screen.getByTestId('catalogue-dryrun')).toBeInTheDocument();
        expect(screen.getByTestId('catalogue-import')).toBeInTheDocument();
    });

    it('lance un aperçu (dry-run) et affiche le rapport', async () => {
        render(<CatalogueImportPanel />);
        fireEvent.click(screen.getByTestId('catalogue-dryrun'));
        await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
            '/bom/import-catalogue', null,
            expect.objectContaining({ params: expect.objectContaining({ dry_run: true }) }),
        ));
        expect(await screen.findByText('3 carte(s) scannée(s)')).toBeInTheDocument();
        expect(screen.getByText('KT190562')).toBeInTheDocument();
        expect(screen.getByText('Importable')).toBeInTheDocument();
        expect(screen.getByText('KiCad (à venir)')).toBeInTheDocument();
    });

    it('lance l\'import réel (dry_run false)', async () => {
        render(<CatalogueImportPanel />);
        fireEvent.click(screen.getByTestId('catalogue-import'));
        await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
            '/bom/import-catalogue', null,
            expect.objectContaining({ params: expect.objectContaining({ dry_run: false }) }),
        ));
    });
});

// -- Prompt 021 : rapport des dossiers ignores avec raison --------------------

const REPORT_021 = {
    root_path: '\\\\rs\\Elec', dry_run: true, cards_scanned: 1,
    revisions_imported: 0, components_created: 0,
    skipped_dirs: ['Archives', 'KT400004 SansRev'],
    skipped: [
        { name: 'Archives', reason: 'not_a_card', label: 'Pas une carte (dossier hors convention KT)' },
        { name: 'KT400004 SansRev', reason: 'no_revision', label: 'Aucune révision Rev.X / fichier CAO exploitable' },
    ],
    rows: [
        { reference: 'KT200026', name: '', revision: 'A', status: 'importable', message: '' },
    ],
};

describe('CatalogueImportPanel — rapport des dossiers ignorés (021)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        apiClient.get.mockResolvedValue({ data: { projects_root_path: '\\\\rs\\Elec\\Projets' } });
        apiClient.post.mockResolvedValue({ data: REPORT_021 });
    });

    it('affiche chaque dossier ignoré avec sa raison (dry-run et import)', async () => {
        render(<CatalogueImportPanel />);
        fireEvent.click(screen.getByTestId('catalogue-dryrun'));
        const block = await screen.findByTestId('catalogue-skipped');
        expect(block).toHaveTextContent('2 dossier(s) ignoré(s)');
        expect(block).toHaveTextContent('Archives — Pas une carte (dossier hors convention KT)');
        expect(block).toHaveTextContent('KT400004 SansRev — Aucune révision Rev.X / fichier CAO exploitable');
        // La référence seule (nom vide) est bien importable, pas ignorée.
        expect(screen.getByText('KT200026')).toBeInTheDocument();
    });
});
