import React from 'react';
import '@testing-library/jest-dom';
import { render, waitFor } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import { BomSessionProvider } from '../../context/BomSessionContext';
import BomViewerPage from '../BomViewerPage';
import { suppressActDeprecatedWarning } from '../../testActWarnings';

// Même stratégie de mock que DashboardPage.test : l'instance axios.create()
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

const SESSION_PAYLOAD = {
    success: true,
    bom_reference_id: 12,
    bom_revision_id: 38,
    reference: 'AMPLI_GEN6',
    revision: 'REV_A',
    side: 'TOP',
    status: 'ACTIVE',
    message: '',
    item_count: 0,
    items: [],
    stats: {},
    errors: [],
    warnings: [],
};

function renderViewer(initialEntry) {
    return render(
        <MemoryRouter
            initialEntries={[initialEntry]}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
            <BomSessionProvider>
                <BomViewerPage />
            </BomSessionProvider>
        </MemoryRouter>,
    );
}

describe('BomViewerPage — paramètre URL ?revision=', () => {
    let restoreConsoleError;

    beforeEach(() => {
        window.localStorage.clear();
        jest.clearAllMocks();
        restoreConsoleError = suppressActDeprecatedWarning();
        axios.get.mockImplementation((url) => {
            if (url === '/bom/files/38/session') {
                return Promise.resolve({ data: SESSION_PAYLOAD });
            }
            return Promise.resolve({ data: {} });
        });
        axios.post.mockResolvedValue({ data: {} });
        axios.patch.mockResolvedValue({ data: {} });
        axios.put.mockResolvedValue({ data: {} });
        axios.delete.mockResolvedValue({ data: {} });
    });

    afterEach(() => {
        restoreConsoleError?.();
        window.localStorage.clear();
    });

    it('charge la session de la révision passée en ?revision=', async () => {
        // Régression : le bouton « Ouvrir » de la bibliothèque BOM navigue vers
        // /bom?revision=<id>. La page doit lire ce param et déclencher le
        // chargement de la session de cette révision (apiClient.get .../session).
        renderViewer('/bom?revision=38');

        await waitFor(() => {
            expect(axios.get).toHaveBeenCalledWith('/bom/files/38/session');
        });
    });

    it("ne charge aucune session sans paramètre ?revision=", async () => {
        renderViewer('/bom');

        // Laisse les effets de montage s'exécuter.
        await act(async () => {
            await Promise.resolve();
        });

        expect(axios.get).not.toHaveBeenCalledWith('/bom/files/38/session');
    });
});
