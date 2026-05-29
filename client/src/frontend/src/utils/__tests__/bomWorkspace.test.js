import { hydrateBomWorkspace, serializeBomWorkspace } from '../bomWorkspace';

describe('bomWorkspace persistence', () => {
    it('preserves cached revisions across serialization and hydration', () => {
        const payload = {
            activeProductionId: 12,
            selectedRevisionEntries: [
                {
                    bom_reference_id: 4,
                    bom_revision_id: 21,
                    reference: 'CARD_A',
                    revision: 'REV_A',
                    side: 'TOP',
                },
            ],
            activeRevisionId: 21,
            revisionsById: {
                21: {
                    bomReferenceId: 4,
                    bomRevisionId: 21,
                    reference: 'CARD_A',
                    revision: 'REV_A',
                    side: 'TOP',
                    items: [
                        {
                            id: 1,
                            reference: 'R1',
                            value_raw: '10K',
                            footprint_eagle: 'RESC1608X55N',
                            dnp: true,
                        },
                    ],
                    warnings: [],
                    errors: [],
                    dirty: true,
                },
            },
            quantitiesByReference: {
                CARD_A__REV_A: {
                    reference: 'CARD_A',
                    revision: 'REV_A',
                    quantityToProduce: 3,
                },
            },
            stockDraftByComponentKey: {
                RES__R_0603__R: {
                    bag_qty: 15,
                },
            },
            stockValidation: {
                isValidated: true,
                validatedAt: '2026-03-25T10:30:00.000Z',
            },
            activeTab: 'components',
        };

        const restored = hydrateBomWorkspace(serializeBomWorkspace(payload));

        expect(restored.activeRevisionId).toBe(21);
        expect(restored.revisionsById[21]).toEqual(expect.objectContaining({
            bomRevisionId: 21,
            reference: 'CARD_A',
            revision: 'REV_A',
            side: 'TOP',
            dirty: true,
        }));
        expect(restored.revisionsById[21].items).toEqual([
            expect.objectContaining({
                id: 1,
                reference: 'R1',
                dnp: true,
            }),
        ]);
        expect(restored.quantitiesByReference.CARD_A__REV_A.quantityToProduce).toBe(3);
        expect(restored.stockValidation.isValidated).toBe(true);
        expect(restored.activeTab).toBe('components');
    });
});
