/**
 * Integration tests for MachinePnpPage.
 *
 * Strategy:
 *  - Mock apiClient (all HTTP methods) to control API responses.
 *  - Mock useBomSession to supply a minimal BOM session context.
 *  - Assert rendered output at the DOM level — no implementation details.
 *
 * On mount the page only loads the machines list via loadMachines()
 * (`GET /marketplace/machines?limit=100`). The Feeders and Chariots tabs
 * fetch their own data lazily, when selected. When the machines list is
 * non-empty the first machine auto-selects and a summary fetch fires
 * (`GET /marketplace/machines/{id}/summary`); the default mockResolvedValue
 * covers it so nothing times out.
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
    patch: jest.fn(),
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

/** Default response shape — covers data[] and items[] patterns used by the page. */
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
        // The H4 heading is the page title; "Machine PnP" is only an overline span.
        expect(
            screen.getByRole('heading', { name: /gestion machine et production/i }),
        ).toBeInTheDocument();
    });

    it('shows a loading spinner while the machines list is fetching', () => {
        // Promises that never resolve keep the component in the loading state.
        apiClient.get.mockImplementation(() => new Promise(() => {}));
        render(<MachinePnpPage />);
        // The loading UI is a CircularProgress (role="progressbar"), not text.
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('renders all three navigation tabs', async () => {
        render(<MachinePnpPage />);
        // Tabs are always rendered (independent of data loading).
        await waitFor(() =>
            expect(screen.getByRole('tab', { name: /séquence/i })).toBeInTheDocument(),
        );
        expect(screen.getByRole('tab', { name: /feeders/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /chariots/i })).toBeInTheDocument();
    });

    it('shows an error alert when the machines API call fails', async () => {
        apiClient.get.mockRejectedValue(new Error('Network error'));
        render(<MachinePnpPage />);
        await waitFor(() =>
            expect(screen.getByRole('alert')).toBeInTheDocument(),
        );
    });

    it('calls the machines endpoint on mount', async () => {
        render(<MachinePnpPage />);
        await waitFor(() => {
            const calledUrls = apiClient.get.mock.calls.map(([url]) => url);
            expect(calledUrls).toEqual(
                expect.arrayContaining(['/marketplace/machines?limit=100']),
            );
        });
    });

    it('displays a machine card when the machines endpoint returns data', async () => {
        apiClient.get.mockImplementation((url) => {
            if (url === '/marketplace/machines?limit=100') {
                return Promise.resolve({
                    data: {
                        data: [
                            { id: 1, name: 'Machine Alpha', num_positions: 60, description: '', notes: '' },
                        ],
                    },
                });
            }
            // /marketplace/machines/{id}/summary and any other URL.
            return Promise.resolve(EMPTY_RESPONSE);
        });

        render(<MachinePnpPage />);
        await waitFor(() =>
            expect(screen.getByText('Machine Alpha')).toBeInTheDocument(),
        );
    });

    it('renders multiple machines when several are returned', async () => {
        apiClient.get.mockImplementation((url) => {
            if (url === '/marketplace/machines?limit=100') {
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
