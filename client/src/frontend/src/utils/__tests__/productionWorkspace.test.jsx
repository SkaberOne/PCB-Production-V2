import React from 'react';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { BomSessionProvider, useBomSession } from '../../context/BomSessionContext';
import { hydrateProductionWorkspace, hydrateStoredBomSelection } from '../productionWorkspace';
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

const wrapper = ({ children }) => (
    <BomSessionProvider>{children}</BomSessionProvider>
);

function createPersistedBomPayload() {
    return {
        reference: 'CARD_A',
        revision: 'REV_A',
        side: 'TOP',
        bom_reference_id: 11,
        bom_revision_id: 101,
        item_count: 1,
        items: [{ id: 1, reference: 'R1' }],
        warnings: [],
        errors: [],
        stats: {},
    };
}

describe('hydrateProductionWorkspace', () => {
    let restoreConsoleError;

    beforeEach(() => {
        window.localStorage.clear();
        require('axios').default.get.mockReset();
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

    it('clears stale BOM session data when the production no longer has linked revisions', async () => {
        const persistedBom = createPersistedBomPayload();
        window.localStorage.setItem('pcb-production:current-bom:5', JSON.stringify(persistedBom));
        window.localStorage.setItem('pcb-production:import-workspace:5', JSON.stringify({
            result: {
                success: true,
                bom_revision_id: 101,
                reference: 'CARD_A',
                revision: 'REV_A',
                side: 'TOP',
            },
            batchResults: [
                {
                    success: true,
                    bom_revision_id: 101,
                    reference: 'CARD_A',
                    revision: 'REV_A',
                    side: 'TOP',
                },
            ],
        }));
        window.localStorage.setItem('pcb-production:bom-workspace:5', JSON.stringify({
            selectedRevisionEntries: [
                {
                    bom_reference_id: 11,
                    bom_revision_id: 101,
                    reference: 'CARD_A',
                    revision: 'REV_A',
                    side: 'TOP',
                    status: 'DRAFT',
                    file_name: 'CARD_A_TOP.txt',
                },
            ],
            activeRevisionId: 101,
        }));

        const { result } = renderHook(() => useBomSession(), { wrapper });

        act(() => {
            result.current.activateProductionSession({ id: 5, name: 'prod-empty', status: 'ACTIVE' });
        });

        expect(result.current.currentBom?.bomRevisionId).toBe(101);
        expect(result.current.selectedBomEntries).toHaveLength(1);

        await act(async () => {
            await hydrateProductionWorkspace({
                apiUrl: 'http://localhost:8000/api',
                productionDetail: {
                    id: 5,
                    name: 'prod-empty',
                    status: 'ACTIVE',
                    bom_revisions: [],
                },
                activateProductionSession: result.current.activateProductionSession,
                setSelectedBomEntries: result.current.setSelectedBomEntries,
                setImportedBom: result.current.setImportedBom,
                updateImportWorkspace: result.current.updateImportWorkspace,
                clearCurrentBom: result.current.clearCurrentBom,
            });
        });

        expect(result.current.currentBom).toBeNull();
        expect(result.current.selectedBomEntries).toEqual([]);
        expect(result.current.importWorkspace.result).toBeNull();
        expect(result.current.importWorkspace.batchResults).toEqual([]);
        expect(result.current.bomWorkspace.activeRevisionId).toBeNull();
    });

    it('hydrates the import workspace from a stored BOM selection', async () => {
        const { result } = renderHook(() => useBomSession(), { wrapper });
        const axios = require('axios').default;
        axios.get
            .mockResolvedValueOnce({
                data: {
                    reference: 'CARD_A',
                    revision: 'REV_A',
                    side: 'TOP',
                    bom_reference_id: 11,
                    bom_revision_id: 101,
                    item_count: 2,
                    items: [{ id: 1, reference: 'R1' }, { id: 2, reference: 'R2' }],
                    warnings: [],
                    errors: [],
                    stats: {},
                },
            })
            .mockResolvedValueOnce({
                data: {
                    reference: 'CARD_A',
                    revision: 'REV_A',
                    side: 'BOT',
                    bom_reference_id: 11,
                    bom_revision_id: 102,
                    item_count: 1,
                    items: [{ id: 3, reference: 'C1' }],
                    warnings: [],
                    errors: [],
                    stats: {},
                },
            });

        await act(async () => {
            await hydrateStoredBomSelection({
                apiUrl: 'http://localhost:8000/api',
                selection: [
                    {
                        bom_reference_id: 11,
                        bom_revision_id: 101,
                        reference: 'CARD_A',
                        revision: 'REV_A',
                        side: 'TOP',
                        file_name: 'CARD_A_TOP.txt',
                    },
                    {
                        bom_reference_id: 11,
                        bom_revision_id: 102,
                        reference: 'CARD_A',
                        revision: 'REV_A',
                        side: 'BOT',
                        file_name: 'CARD_A_BOT.txt',
                    },
                ],
                setSelectedBomEntries: result.current.setSelectedBomEntries,
                setImportedBom: result.current.setImportedBom,
                updateImportWorkspace: result.current.updateImportWorkspace,
                clearCurrentBom: result.current.clearCurrentBom,
                throwOnEmptyLoad: true,
            });
        });

        expect(result.current.selectedBomEntries).toEqual([
            expect.objectContaining({ bom_revision_id: 101, file_name: 'CARD_A_TOP.txt' }),
            expect.objectContaining({ bom_revision_id: 102, file_name: 'CARD_A_BOT.txt' }),
        ]);
        expect(result.current.currentBom?.bomRevisionId).toBe(101);
        expect(result.current.currentBom?.itemCount).toBe(2);
        expect(result.current.importWorkspace.result).toEqual(expect.objectContaining({
            bom_revision_id: 101,
            file_name: 'CARD_A_TOP.txt',
            item_count: 2,
        }));
        expect(result.current.importWorkspace.batchResults).toEqual([
            expect.objectContaining({
                bom_revision_id: 101,
                file_name: 'CARD_A_TOP.txt',
                item_count: 2,
            }),
            expect.objectContaining({
                bom_revision_id: 102,
                file_name: 'CARD_A_BOT.txt',
                item_count: 1,
            }),
        ]);
    });

    it('keeps the first successfully loaded session as the active review payload when earlier revisions are missing', async () => {
        const { result } = renderHook(() => useBomSession(), { wrapper });
        const axios = require('axios').default;
        axios.get
            .mockRejectedValueOnce({ response: { status: 404 } })
            .mockResolvedValueOnce({
                data: {
                    reference: 'CARD_A',
                    revision: 'REV_A',
                    side: 'BOT',
                    bom_reference_id: 11,
                    bom_revision_id: 102,
                    item_count: 1,
                    items: [{ id: 3, reference: 'C1' }],
                    warnings: [],
                    errors: [],
                    stats: {},
                },
            });

        await act(async () => {
            await hydrateStoredBomSelection({
                apiUrl: 'http://localhost:8000/api',
                selection: [
                    {
                        bom_reference_id: 11,
                        bom_revision_id: 101,
                        reference: 'CARD_A',
                        revision: 'REV_A',
                        side: 'TOP',
                        file_name: 'CARD_A_TOP.txt',
                    },
                    {
                        bom_reference_id: 11,
                        bom_revision_id: 102,
                        reference: 'CARD_A',
                        revision: 'REV_A',
                        side: 'BOT',
                        file_name: 'CARD_A_BOT.txt',
                    },
                ],
                setSelectedBomEntries: result.current.setSelectedBomEntries,
                setImportedBom: result.current.setImportedBom,
                updateImportWorkspace: result.current.updateImportWorkspace,
                clearCurrentBom: result.current.clearCurrentBom,
            });
        });

        expect(result.current.currentBom?.bomRevisionId).toBe(102);
        expect(result.current.importWorkspace.result).toEqual(expect.objectContaining({
            bom_revision_id: 102,
            file_name: 'CARD_A_BOT.txt',
            item_count: 1,
        }));
        expect(result.current.importWorkspace.batchResults).toEqual([
            expect.objectContaining({
                bom_revision_id: 101,
                file_name: 'CARD_A_TOP.txt',
                item_count: 0,
            }),
            expect.objectContaining({
                bom_revision_id: 102,
                file_name: 'CARD_A_BOT.txt',
                item_count: 1,
            }),
        ]);
    });
});
