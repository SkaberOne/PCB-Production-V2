import {
    DEFAULT_UNCATEGORIZED_CATEGORY,
    groupStoredBomFiles,
    syncStoredBomSelection,
    toggleStoredBomSelection,
} from '../bomFileExplorer';

describe('bomFileExplorer helpers', () => {
    it('keeps selected BOM entries when the current list is filtered', () => {
        const selection = [
            {
                bom_revision_id: 7,
                reference: 'TRIAMP',
                revision: 'REV_A',
                file_name: 'triamp_top.txt',
            },
        ];
        const visibleItems = [
            {
                bom_revision_id: 8,
                reference: 'CARRIER',
                revision: 'REV_B',
                file_name: 'carrier_top.txt',
            },
        ];

        expect(syncStoredBomSelection(selection, visibleItems)).toEqual(selection);
    });

    it('refreshes selected BOM metadata when the same revision is reloaded', () => {
        const selection = [
            {
                bom_revision_id: 7,
                reference: 'TRIAMP',
                revision: 'REV_A',
                file_name: 'old_name.txt',
            },
        ];
        const visibleItems = [
            {
                bom_revision_id: 7,
                reference: 'TRIAMP',
                revision: 'REV_A',
                file_name: 'new_name.txt',
            },
        ];

        expect(syncStoredBomSelection(selection, visibleItems)).toEqual(visibleItems);
    });

    it('toggles a BOM selection by revision id', () => {
        const item = {
            bom_revision_id: 7,
            reference: 'TRIAMP',
            revision: 'REV_A',
        };

        const selected = toggleStoredBomSelection([], item);
        expect(selected).toEqual([item]);
        expect(toggleStoredBomSelection(selected, item)).toEqual([]);
    });

    it('groups stored BOMs by category, reference, and revision', () => {
        const grouped = groupStoredBomFiles([
            {
                bom_reference_id: 2,
                bom_revision_id: 11,
                category: 'AMPLI',
                reference: 'TRIAMP',
                revision: 'REV_A',
                side: 'TOP',
            },
            {
                bom_reference_id: 2,
                bom_revision_id: 12,
                category: 'AMPLI',
                reference: 'TRIAMP',
                revision: 'REV_A',
                side: 'BOT',
            },
        ], [DEFAULT_UNCATEGORIZED_CATEGORY, 'AMPLI']);

        expect(grouped).toHaveLength(2);
        expect(grouped[0].category).toBe('AMPLI');
        expect(grouped[0].references[0].reference).toBe('TRIAMP');
        expect(grouped[0].references[0].revisions[0].items).toHaveLength(2);
    });

    it('expose le nom de la carte au niveau du groupe référence (029)', () => {
        const grouped = groupStoredBomFiles([
            { bom_reference_id: 5, bom_revision_id: 51, category: 'AMPLI', reference: 'AMPLI_GEN6', name: 'Ampli Gen 6', revision: 'A', side: 'TOP' },
            { bom_reference_id: 6, bom_revision_id: 61, category: 'AMPLI', reference: 'LEGACY', revision: 'A', side: 'TOP' },
        ]);
        const refs = grouped[0].references;
        const withName = refs.find((r) => r.reference === 'AMPLI_GEN6');
        const legacy = refs.find((r) => r.reference === 'LEGACY');
        expect(withName.name).toBe('Ampli Gen 6');
        expect(legacy.name).toBe(''); // carte legacy sans nom
    });
});
