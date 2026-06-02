import {
    buildAggregatedComponents,
    buildStockSummary,
    defaultTapeThicknessMm,
    estimateReelQuantity,
} from '../bomPlanning';

describe('defaultTapeThicknessMm', () => {
    it('returns width-based defaults', () => {
        expect(defaultTapeThicknessMm(8)).toBe(1.0);
        expect(defaultTapeThicknessMm(12)).toBe(1.2);
        expect(defaultTapeThicknessMm(16)).toBe(1.5);
        expect(defaultTapeThicknessMm(24)).toBe(1.5);
    });

    it('falls back to the generic default for unknown/invalid width', () => {
        expect(defaultTapeThicknessMm(0)).toBe(1.0);
        expect(defaultTapeThicknessMm(undefined)).toBe(1.0);
        expect(defaultTapeThicknessMm('abc')).toBe(1.0);
    });
});

describe('estimateReelQuantity', () => {
    it('computes the floored quantity from the spiral area formula', () => {
        const qty = estimateReelQuantity({
            outerDiameterMm: 178,
            hubDiameterMm: 60,
            pitchMm: 4,
            safetyPct: 0,
            tapeThicknessMm: 1.0,
        });
        expect(qty).toBe(5514);
    });

    it('applies the safety margin', () => {
        const qty = estimateReelQuantity({
            outerDiameterMm: 178,
            hubDiameterMm: 60,
            pitchMm: 4,
            safetyPct: 25,
            tapeThicknessMm: 1.0,
        });
        expect(qty).toBe(4135);
    });

    it('returns null for invalid geometry', () => {
        expect(estimateReelQuantity({
            outerDiameterMm: 50,
            hubDiameterMm: 60,
            pitchMm: 4,
        })).toBeNull();
    });
});

describe('buildStockSummary tape thickness resolution', () => {
    it('uses the width-based default when no draft thickness is provided', () => {
        const summary = buildStockSummary(
            { requiredQuantity: 10, componentTapeWidthMm: 12 },
            {},
        );
        expect(summary.resolvedTapeThicknessMm).toBe(1.2);
    });

    it('prefers an explicit draft thickness over the default', () => {
        const summary = buildStockSummary(
            { requiredQuantity: 10, componentTapeWidthMm: 12 },
            { tape_thickness_mm: 2 },
        );
        expect(summary.resolvedTapeThicknessMm).toBe(2);
    });
});

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
