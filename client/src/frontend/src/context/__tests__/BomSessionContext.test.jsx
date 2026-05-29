import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { BomSessionProvider, useBomSession } from '../BomSessionContext';
import { suppressActDeprecatedWarning } from '../../testActWarnings';

const wrapper = ({ children }) => (
    <BomSessionProvider>{children}</BomSessionProvider>
);

function createBomPayload({
    reference,
    revision,
    side,
    bomReferenceId,
    bomRevisionId,
}) {
    return {
        reference,
        revision,
        side,
        bom_reference_id: bomReferenceId,
        bom_revision_id: bomRevisionId,
        item_count: 0,
        items: [],
        warnings: [],
        errors: [],
        stats: {},
    };
}

describe('BomSessionContext', () => {
    let restoreConsoleError;

    beforeEach(() => {
        window.localStorage.clear();
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

    it('scopes current BOM, import workspace, and BOM workspace by production', async () => {
        const { result } = renderHook(() => useBomSession(), { wrapper });

        act(() => {
            result.current.activateProductionSession({ id: 1, name: 'prod-A' });
        });

        act(() => {
            result.current.setImportedBom(createBomPayload({
                reference: 'CARD_A',
                revision: 'REV_A',
                side: 'TOP',
                bomReferenceId: 11,
                bomRevisionId: 101,
            }));
            result.current.updateImportWorkspace({
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
            });
        });

        act(() => {
            jest.runAllTimers();
        });

        act(() => {
            result.current.activateProductionSession({ id: 2, name: 'prod-B' });
        });

        expect(result.current.activeProduction.id).toBe(2);
        expect(result.current.currentBom).toBeNull();
        expect(result.current.importWorkspace.result).toBeNull();
        expect(result.current.selectedBomEntries).toEqual([]);

        act(() => {
            result.current.setImportedBom(createBomPayload({
                reference: 'CARD_B',
                revision: 'REV_B',
                side: 'BOT',
                bomReferenceId: 22,
                bomRevisionId: 202,
            }));
            result.current.updateImportWorkspace({
                result: {
                    success: true,
                    bom_revision_id: 202,
                    reference: 'CARD_B',
                    revision: 'REV_B',
                    side: 'BOT',
                },
                batchResults: [
                    {
                        success: true,
                        bom_revision_id: 202,
                        reference: 'CARD_B',
                        revision: 'REV_B',
                        side: 'BOT',
                    },
                ],
            });
        });

        act(() => {
            jest.runAllTimers();
        });

        act(() => {
            result.current.activateProductionSession({ id: 1, name: 'prod-A' });
        });

        await waitFor(() => {
            expect(result.current.activeProduction.id).toBe(1);
            expect(result.current.currentBom.reference).toBe('CARD_A');
            expect(result.current.importWorkspace.result.bom_revision_id).toBe(101);
            expect(result.current.selectedBomEntries).toHaveLength(1);
            expect(result.current.selectedBomEntries[0].bom_revision_id).toBe(101);
        });

        act(() => {
            result.current.activateProductionSession({ id: 2, name: 'prod-B' });
        });

        await waitFor(() => {
            expect(result.current.activeProduction.id).toBe(2);
            expect(result.current.currentBom.reference).toBe('CARD_B');
            expect(result.current.importWorkspace.result.bom_revision_id).toBe(202);
            expect(result.current.selectedBomEntries).toHaveLength(1);
            expect(result.current.selectedBomEntries[0].bom_revision_id).toBe(202);
        });
    });
});
