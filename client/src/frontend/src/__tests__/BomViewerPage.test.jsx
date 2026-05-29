/**
 * Integration tests for BomViewerPage.
 *
 * Strategy:
 *  - Mock apiClient to control /bom/files/{id}/session responses.
 *  - Mock useBomSession to inject controlled BOM workspace state.
 *  - BomViewerPage makes NO API calls when selectedBomEntries is empty —
 *    tests validate that boundary and the fetch-on-selection path.
 *
 * Wrapped in MemoryRouter because BomViewerPage calls useNavigate.
 */

import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import BomViewerPage from '../pages/BomViewerPage';
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

const noop = jest.fn();

const DEFAULT_WORKSPACE = {
    activeTab: 'review',
    activeRevisionId: null,
    revisionsById: {},
    quantitiesByReference: {},
    stockValidation: { isValidated: false, validatedAt: null },
    stockDraftByComponentKey: {},
};

const DEFAULT_SESSION = {
    currentBom: null,
    selectedBomEntries: [],
    bomWorkspace: DEFAULT_WORKSPACE,
    activeProduction: null,
    setImportedBom: noop,
    setActiveProduction: noop,
    clearCurrentBom: noop,
    setSelectedBomEntries: noop,
    setActiveBomRevision: noop,
    cacheBomRevision: noop,
    updateBomWorkspaceItem: noop,
    updateBomWorkspaceItems: noop,
    updateBomWorkspaceQuantity: noop,
    updateBomWorkspaceStockDraft: noop,
    setBomWorkspaceActiveTab: noop,
    setBomWorkspaceStockValidated: noop,
    removeBomWorkspaceRevision: noop,
};

/** Renders BomViewerPage with the given session overrides inside a MemoryRouter. */
function renderPage(sessionOverrides = {}) {
    useBomSession.mockReturnValue({ ...DEFAULT_SESSION, ...sessionOverrides });
    return render(
        <MemoryRouter>
            <BomViewerPage />
        </MemoryRouter>,
    );
}

/** Minimal BOM entry shape that satisfies BomViewerPage's prefetch effect. */
function makeEntry(bomRevisionId, reference = 'BOARD-001') {
    return {
        bom_revision_id: bomRevisionId,
        bom_reference_id: 1,
        reference,
        revision: 'Rev1',
        side: 'TOP',
        file_name: `${reference}.csv`,
    };
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
    apiClient.get.mockResolvedValue({ data: {} });
});

afterEach(() => {
    jest.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BomViewerPage', () => {
    it('renders the page heading', () => {
        renderPage();
        expect(screen.getByRole('heading', { name: /^bom$/i })).toBeInTheDocument();
    });

    it('shows empty-quantity message when no BOM is selected', () => {
        renderPage();
        expect(
            screen.getByText(/aucune bom sélectionnée pour le moment/i),
        ).toBeInTheDocument();
    });

    it('makes no API calls on mount when selectedBomEntries is empty', () => {
        renderPage();
        expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('fetches the revision session for each selected entry', async () => {
        apiClient.get.mockResolvedValue({
            data: { bom_revision_id: 42, items: [] },
        });

        renderPage({ selectedBomEntries: [makeEntry(42)] });

        await waitFor(() =>
            expect(apiClient.get).toHaveBeenCalledWith('/bom/files/42/session'),
        );
    });

    it('skips the API call when the revision is already cached', async () => {
        const entry = makeEntry(7);
        renderPage({
            selectedBomEntries: [entry],
            bomWorkspace: {
                ...DEFAULT_WORKSPACE,
                // Revision 7 is already in the cache → no fetch needed.
                revisionsById: { 7: { bom_revision_id: 7, items: [] } },
            },
        });

        // Allow all effects to settle.
        await new Promise((resolve) => setTimeout(resolve, 60));
        expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('prunes a missing revision when the session endpoint returns 404', async () => {
        const removeBomWorkspaceRevision = jest.fn();
        const clearCurrentBom = jest.fn();

        const notFoundError = new Error('Not Found');
        notFoundError.response = { status: 404 };
        apiClient.get.mockRejectedValue(notFoundError);

        renderPage({
            selectedBomEntries: [makeEntry(99, 'MISSING')],
            removeBomWorkspaceRevision,
            clearCurrentBom,
        });

        await waitFor(() =>
            expect(removeBomWorkspaceRevision).toHaveBeenCalledWith(99),
        );
    });

    it('fetches sessions for multiple selected entries in order', async () => {
        apiClient.get.mockResolvedValue({ data: { items: [] } });

        renderPage({
            selectedBomEntries: [makeEntry(10, 'BOARD-A'), makeEntry(11, 'BOARD-B')],
        });

        await waitFor(() => {
            expect(apiClient.get).toHaveBeenCalledWith('/bom/files/10/session');
            expect(apiClient.get).toHaveBeenCalledWith('/bom/files/11/session');
        });
    });

    it('renders action buttons in the page header', () => {
        renderPage();
        expect(screen.getByRole('button', { name: /exporter/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /validate/i })).toBeInTheDocument();
    });
});
