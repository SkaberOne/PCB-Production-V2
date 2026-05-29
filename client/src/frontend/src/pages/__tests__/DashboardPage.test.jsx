import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import { BomSessionProvider } from '../../context/BomSessionContext';
import DashboardPage from '../DashboardPage';
import { suppressActDeprecatedWarning } from '../../testActWarnings';

jest.mock('axios', () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        post: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
    },
}));

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

        expect(screen.getByText('Chargement des productions...')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getAllByText('prod-B').length).toBeGreaterThan(0);
        });

        expect(screen.getByText(/Statut backend ACTIVE/i)).toBeInTheDocument();
        expect(axios.get).toHaveBeenNthCalledWith(1, 'http://localhost:8000/api/marketplace/productions');
        expect(axios.get).toHaveBeenNthCalledWith(2, 'http://localhost:8000/api/marketplace/productions/2');
    });

    it('asks for confirmation before reopening an archived production', async () => {
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

        fireEvent.click(screen.getByLabelText('Activer et ouvrir la production prod-archive'));

        expect(screen.getByText('Reactiver cette production ?')).toBeInTheDocument();
        expect(axios.patch).not.toHaveBeenCalled();
    });
});
