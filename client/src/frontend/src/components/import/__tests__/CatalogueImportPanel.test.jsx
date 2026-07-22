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
