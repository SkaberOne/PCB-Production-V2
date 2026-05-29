import {
    applyPreviewFieldToWorkspace,
    buildPreviewTarget,
    clearPreviewFootprintDraft,
    getPreviewStatusMeta,
    matchesPreviewFilters,
    setPreviewFootprintDraft,
} from '../bomImportPreview';

describe('bomImportPreview helpers', () => {
    it('builds preview targets from the selected result when row metadata is absent', () => {
        expect(buildPreviewTarget(
            {
                id: 42,
                reference_item: 'R10',
            },
            {
                bom_reference_id: 7,
                bom_revision_id: 77,
            }
        )).toEqual({
            itemId: 42,
            bomReferenceId: 7,
            bomRevisionId: 77,
            reference: 'R10',
        });
    });

    it('updates preview fields in both selected result and batch cache', () => {
        const workspace = {
            result: {
                bom_revision_id: 100,
                items: [{ id: 1, value_harmonized: 'OLD' }],
            },
            batchResults: [
                {
                    bom_revision_id: 100,
                    items: [{ id: 1, value_harmonized: 'OLD' }],
                },
                {
                    bom_revision_id: 200,
                    items: [{ id: 1, value_harmonized: 'KEEP' }],
                },
            ],
        };

        const nextWorkspace = applyPreviewFieldToWorkspace(
            workspace,
            [{ itemId: 1, bomRevisionId: 100 }],
            'value_harmonized',
            'NEW'
        );

        expect(nextWorkspace.result.items[0].value_harmonized).toBe('NEW');
        expect(nextWorkspace.batchResults[0].items[0].value_harmonized).toBe('NEW');
        expect(nextWorkspace.batchResults[1].items[0].value_harmonized).toBe('KEEP');
    });

    it('filters preview entries by status and search text', () => {
        const entry = {
            reference: 'R1',
            value_raw: '10K',
            footprint_eagle: '0603',
            component_library_missing: true,
        };

        expect(matchesPreviewFilters(entry, {
            normalizedSearch: '10k',
            statusFilter: 'missing-component',
        })).toBe(true);
        expect(matchesPreviewFilters(entry, {
            normalizedSearch: 'led',
            statusFilter: 'missing-component',
        })).toBe(false);
        expect(matchesPreviewFilters(entry, {
            normalizedSearch: '10k',
            statusFilter: 'ready',
        })).toBe(false);
    });

    it('exposes stable draft helpers and status metadata', () => {
        const drafts = setPreviewFootprintDraft({}, 'raw:1', '0805');
        const cleared = clearPreviewFootprintDraft(drafts, 'raw:1');

        expect(drafts).toEqual({ 'raw:1': '0805' });
        expect(cleared).toEqual({});
        expect(getPreviewStatusMeta({
            value_harmonized: 'MCU',
            value_raw: 'U',
            footprint_pnp: 'QFP',
        })).toEqual(expect.objectContaining({
            key: 'ready',
            label: 'Pret',
            color: 'success',
        }));
    });
});
