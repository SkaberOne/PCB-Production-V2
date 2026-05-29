import { buildAggregatedComponents } from '../bomPlanning';

describe('bomPlanning helpers', () => {
    it('excludes DNP lines from component aggregation and stock needs', () => {
        const planningLines = buildAggregatedComponents(
            {
                10: {
                    reference: 'CARD_A',
                    revision: 'REV_A',
                    side: 'TOP',
                    items: [
                        {
                            id: 1,
                            reference: 'R1',
                            value_raw: '10K',
                            footprint_eagle: 'RESC1608X55N',
                            component_type: 'R',
                            quantity: 2,
                            dnp: true,
                        },
                        {
                            id: 2,
                            reference: 'C1',
                            value_raw: '100nF',
                            footprint_eagle: 'CAPC1608X90N',
                            component_type: 'C',
                            quantity: 1,
                            dnp: false,
                        },
                    ],
                },
            },
            {
                CARD_A__REV_A: {
                    quantityToProduce: 3,
                },
            },
            {},
        );

        expect(planningLines).toHaveLength(1);
        expect(planningLines[0]).toEqual(expect.objectContaining({
            value: '100nF',
            requiredQuantity: 3,
            quantityToOrder: 3,
            manualPlacement: false,
        }));
    });
});
