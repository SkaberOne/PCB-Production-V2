import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import { BomSessionProvider } from '../../context/BomSessionContext';
import DashboardPage from '../DashboardPage';
import { suppressActDeprecatedWarning } from '../../testActWarnings';

jest.mock('axios', () => {
    // L'instance partage les mêmes jest.fn que le default, donc régler
    // axios.default.get pilote aussi apiClient.get (= axios.create()).
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

function renderDashboard() {
    return render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <BomSessionProvider>
                <DashboardPage />
            </BomSessionProvider>
        </MemoryRouter>,
    );
}

describe('DashboardPage', () => {
    let restoreConsoleError;

    beforeEach(() => {
        window.localStorage.clear();
        jest.clearAllMocks();
        jest.useFakeTimers();
        restoreConsoleError = suppressActDeprecatedWarning();
        // Réponse par défaut : couvre l'appel /reports/bom-stats déclenché
        // par l'effet qui suit l'activation d'une production, ainsi que tout
        // get non explicitement séquencé par un mockResolvedValueOnce.
        axios.get.mockResolvedValue({ data: {} });
        axios.patch.mockResolvedValue({ data: {} });
        axios.post.mockResolvedValue({ data: {} });
        axios.delete.mockResolvedValue({ data: {} });
    });

    afterEach(() => {
        act(() => {
            jest.runOnlyPendingTimers();
        });
        restoreConsoleError?.();
        jest.useRealTimers();
        window.localStorage.clear();
    });

    it('hydrates the active backend production when no local session exists', async () => {
        // 1er get : liste des productions. 2e get : détail de la production ACTIVE
        // (fetchProductionDetail). Le get /reports/bom-stats qui suit l'activation
        // retombe sur le mockResolvedValue par défaut.
        axios.get
            .mockResolvedValueOnce({
                data: {
                    items: [
                        {
                            id: 2,
                            name: 'prod-B',
                            status: 'ACTIVE',
                            bom_count: 0,
                            linked_references: [],
                            updated_at: '2026-03-25T10:00:00Z',
                        },
                    ],
                },
            })
            .mockResolvedValueOnce({
                data: {
                    id: 2,
                    name: 'prod-B',
                    status: 'ACTIVE',
                    bom_count: 0,
                    linked_references: [],
                    bom_revisions: [],
                    updated_at: '2026-03-25T10:00:00Z',
                },
            });

        renderDashboard();

        // La ligne de production apparaît une fois la liste chargée.
        await waitFor(() => {
            expect(screen.getAllByText('prod-B').length).toBeGreaterThan(0);
        });

        // Le statut ACTIVE est rendu via le chip de getProductionStatusUi (label « Active »).
        expect(screen.getByText('Active')).toBeInTheDocument();

        // apiClient applique le baseURL via la config axios ; le mock ne le préfixe pas,
        // donc les chemins relatifs sont ceux passés à apiClient.get.
        expect(axios.get).toHaveBeenNthCalledWith(1, '/marketplace/productions');
        expect(axios.get).toHaveBeenNthCalledWith(2, '/marketplace/productions/2');
    });

    it('asks for confirmation before reopening an archived production', async () => {
        // 1er get : liste (une production ACTIVE + une ARCHIVED).
        // 2e get : détail de la production ACTIVE hydratée au montage.
        // Le get /reports/bom-stats retombe sur le mockResolvedValue par défaut.
        axios.get
            .mockResolvedValueOnce({
                data: {
                    items: [
                        {
                            id: 1,
                            name: 'prod-active',
                            status: 'ACTIVE',
                            bom_count: 0,
                            linked_references: [],
                            updated_at: '2026-03-25T10:00:00Z',
                        },
                        {
                            id: 2,
                            name: 'prod-archive',
                            status: 'ARCHIVED',
                            bom_count: 0,
                            linked_references: [],
                            updated_at: '2026-03-24T10:00:00Z',
                        },
                    ],
                },
            })
            .mockResolvedValueOnce({
                data: {
                    id: 1,
                    name: 'prod-active',
                    status: 'ACTIVE',
                    bom_count: 0,
                    linked_references: [],
                    bom_revisions: [],
                    updated_at: '2026-03-25T10:00:00Z',
                },
            });

        renderDashboard();

        await waitFor(() => {
            expect(screen.getByText('prod-archive')).toBeInTheDocument();
        });

        // Cliquer « Activer et ouvrir » sur une production ARCHIVED ne doit PAS
        // l'activer directement : requiresReactivationConfirmation('ARCHIVED') === true,
        // donc handleRequestOpenProduction ouvre une demande de confirmation et
        // s'arrête avant tout PATCH d'activation.
        fireEvent.click(screen.getByLabelText('Activer et ouvrir la production prod-archive'));

        // La confirmation a court-circuité l'activation : aucun PATCH (changement de
        // statut vers ACTIVE) n'a été émis pour la production archivée.
        expect(axios.patch).not.toHaveBeenCalled();

        // La production archivée reste affichée (pas de navigation/ouverture directe).
        expect(screen.getByText('prod-archive')).toBeInTheDocument();
    });
});
