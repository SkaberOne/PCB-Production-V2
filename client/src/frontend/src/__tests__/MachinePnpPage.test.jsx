/**
 * Integration tests for MachinePnpPage.
 *
 * Strategy:
 *  - Mock apiClient (all HTTP methods) to control API responses.
 *  - Mock useBomSession to supply a minimal BOM session context.
 *  - Assert rendered output at the DOM level — no implementation details.
 *
 * On mount the page fires 6 parallel fetches (useWorkspaceData ×4,
 * useBomCategories ×1, useFixedFeeders ×1). All are covered by the
 * default mockResolvedValue that returns empty collections.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import MachinePnpPage from '../pages/MachinePnpPage';
import apiClient from '../api/client';
import { useBomSession } from '../context/BomSessionContext';

// ── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../api/client', () => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
}));

jest.mock('../context/BomSessionContext', () => ({
    useBomSession: jest.fn(),
}));

// ── Shared fixtures ──────────────────────────────────────────────────────────

const EMPTY_SESSION = {
    activeProduction: null,
    bomWorkspace: {
        activeTab: 'review',
        activeRevisionId: null,
        revisionsById: {},
        quantitiesByReference: {},
        stockValidation: { isValidated: false, validatedAt: null },
        stockDraftByComponentKey: {},
    },
};

/** Default response shape — covers data[] and items[] patterns used by hooks. */
const EMPTY_RESPONSE = { data: { data: [], items: [] } };

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
    useBomSession.mockReturnValue(EMPTY_SESSION);
    apiClient.get.mockResolvedValue(EMPTY_RESPONSE);
});

afterEach(() => {
    jest.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MachinePnpPage', () => {
    it('renders the page heading immediately', () => {
        render(<MachinePnpPage />);
        expect(screen.getByRole('heading', { name: /machine pnp/i })).toBeInTheDocument();
    });

    it('shows loading text while workspace is fetching', () => {
        // Promises that never resolve keep the component in the loading state.
        apiClient.get.mockImplementation(() => new Promise(() => {}));
        render(<MachinePnpPage />);
        expect(
            screen.getByText(/chargement de la configuration pnp/i),
        ).toBeInTheDocument();
    });

    it('renders all three navigation tabs after workspace loads', async () => {
        render(<MachinePnpPage />);
        await waitFor(() =>
            expect(screen.getByRole('tab', { name: /machines/i })).toBeInTheDocument(),
        );
        expect(screen.getByRole('tab', { name: /feeders/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /chariots/i })).toBeInTheDocument();
    });

    it('shows an error alert when the workspace API call fails', async () => {
        apiClient.get.mockRejectedValue(new Error('Network error'));
        render(<MachinePnpPage />);
        await waitFor(() =>
            expect(screen.getByRole('alert')).toBeInTheDocument(),
        );
    });

    it('calls the four core workspace endpoints on mount', async () => {
        render(<MachinePnpPage />);
        await waitFor(() => {
            const calledUrls = apiClient.get.mock.calls.map(([url]) => url);
            expect(calledUrls).toEqual(
                expect.arrayContaining([
                    '/marketplace/machines',
                    '/marketplace/feeder-types',
                    '/marketplace/carts',
                    '/marketplace/productions',
                ]),
            );
        });
    });

    it('displays a machine row when the machines endpoint returns data', async () => {
        apiClient.get.mockImplementation((url) => {
            if (url === '/marketplace/machines') {
                return Promise.resolve({
                    data: {
                        data: [
                            { id: 1, name: 'Machine Alpha', num_positions: 60, description: '', notes: '' },
                        ],
                    },
                });
            }
            return Promise.resolve(EMPTY_RESPONSE);
        });

        render(<MachinePnpPage />);
        await waitFor(() =>
            expect(screen.getByText('Machine Alpha')).toBeInTheDocument(),
        );
    });

    it('renders multiple machines when several are returned', async () => {
        apiClient.get.mockImplementation((url) => {
            if (url === '/marketplace/machines') {
                return Promise.resolve({
                    data: {
                        data: [
                            { id: 1, name: 'Machine Alpha', num_positions: 60, description: '', notes: '' },
                            { id: 2, name: 'Machine Beta', num_positions: 100, description: '', notes: '' },
                        ],
                    },
                });
            }
            return Promise.resolve(EMPTY_RESPONSE);
        });

        render(<MachinePnpPage />);
        await waitFor(() => {
            expect(screen.getByText('Machine Alpha')).toBeInTheDocument();
            expect(screen.getByText('Machine Beta')).toBeInTheDocument();
        });
    });
});
