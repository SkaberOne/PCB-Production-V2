import {
    buildActiveStats,
    buildItemMatchKey,
    buildReviewPayload,
    buildReviewedBomContent,
    getSelectedEntries,
    getStatusChipColor,
} from '../bomReviewView';
import { BOM_ITEM_STATUSES } from '../bomSession';

describe('bomReviewView helpers', () => {
    it('falls back to the current BOM when no selection exists', () => {
        const currentBom = {
            bomRevisionId: 42,
            bomReferenceId: 9,
            reference: 'TRIAMP',
            revision: 'REV_A',
            side: 'TOP',
            status: 'DRAFT',
            file_name: 'triamp_top.txt',
        };

        expect(getSelectedEntries([], currentBom)).toEqual([
            expect.objectContaining({
                bom_revision_id: 42,
                bom_reference_id: 9,
                reference: 'TRIAMP',
                revision: 'REV_A',
                side: 'TOP',
            }),
        ]);
    });

    it('builds a stable payload for BOM review persistence', () => {
        const payload = buildReviewPayload({
            items: [
                {
                    id: 1,
                    value_harmonized: '10K',
                    footprint_pnp: 'R_0603',
                    notes: '',
                    dnp: 0,
                },
                {
                    id: 2,
                    value_harmonized: '',
                    footprint_pnp: '',
                    notes: 'manual check',
                    dnp: 1,
                },
            ],
        });

        expect(payload).toEqual({
            items: [
                {
                    id: 1,
                    value_harmonized: '10K',
                    footprint_pnp: 'R_0603',
                    component_type: null,
                    component_type_confirmed: false,
                    notes: null,
                    dnp: false,
                },
                {
                    id: 2,
                    value_harmonized: null,
                    footprint_pnp: null,
                    component_type: null,
                    component_type_confirmed: false,
                    notes: 'manual check',
                    dnp: true,
                },
            ],
            create_mappings: true,
            mark_as_active: true,
        });
    });

    it('exports reviewed BOM content with the optional DNP marker', () => {
        const content = buildReviewedBomContent({
            side: 'TOP',
            items: [
                {
                    reference_item: 'R1',
                    value_harmonized: '10K',
                    footprint_pnp: 'R_0603',
                    x: 10,
                    y: 20,
                    rotation: 180,
                    dnp: true,
                },
            ],
        });

        expect(content).toContain('Reference Value Footprint X Y Rotation Side DNP');
        expect(content).toContain('R1 10K R_0603 10 20 180 TOP DNP');
    });

    it('builds consistent match keys and status colors', () => {
        expect(buildItemMatchKey({
            value_harmonized: ' 10k ',
            footprint_eagle: ' resc1608x55n ',
            component_type: 'r',
        })).toBe('10K__RESC1608X55N__R');

        expect(getStatusChipColor(BOM_ITEM_STATUSES.ERROR)).toBe('error');
        expect(getStatusChipColor(BOM_ITEM_STATUSES.REVIEW)).toBe('warning');
        expect(getStatusChipColor(BOM_ITEM_STATUSES.HARMONIZED)).toBe('success');
        expect(getStatusChipColor(BOM_ITEM_STATUSES.DNP)).toBe('default');
    });

    it('computes review stats without counting DNP lines as pending review', () => {
        const items = [
            {
                id: 1,
                reference: 'R1',
                value_harmonized: '10K',
                value_raw: '10k',
                footprint_eagle: 'RESC1608X55N',
                footprint_pnp: 'R_0603',
                component_type: 'R',
                notes: '',
                dnp: false,
            },
            {
                id: 2,
                reference: 'C1',
                value_harmonized: '100nF',
                value_raw: '100n',
                footprint_eagle: 'CAPC1608X90N',
                footprint_pnp: null,
                component_type: 'C',
                notes: '',
                dnp: true,
            },
            {
                id: 3,
                reference: 'U1',
                value_harmonized: 'OPA828',
                value_raw: 'OPA828',
                footprint_eagle: 'SOP65P490X110-9N',
                footprint_pnp: null,
                component_type: 'IC',
                notes: '',
                dnp: false,
            },
        ];

        const stats = buildActiveStats(
            items,
            ['Missing footprint for C1', 'Missing footprint for U1'],
            [],
        );

        expect(stats).toEqual({
            total: 3,
            review: 1,
            errors: 0,
            harmonized: 1,
        });
    });
});
