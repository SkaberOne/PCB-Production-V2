import { buildSessionRows } from '../bomImportWorkspace';

describe('bomImportWorkspace helpers', () => {
    it('shows stored imported BOM rows even without local draft files', () => {
        const rows = buildSessionRows([], [
            {
                success: true,
                bom_reference_id: 11,
                bom_revision_id: 101,
                file_name: 'CARD_A_TOP.txt',
                reference: 'CARD_A',
                revision: 'REV_A',
                side: 'TOP',
                category: 'AMPLI',
                item_count: 2,
                items: [{ id: 1 }, { id: 2 }],
            },
        ]);

        expect(rows).toEqual([
            expect.objectContaining({
                bom_revision_id: 101,
                file_name: 'CARD_A_TOP.txt',
                reference: 'CARD_A',
                revision: 'REV_A',
                isImported: true,
                item_count: 2,
            }),
        ]);
    });
});
