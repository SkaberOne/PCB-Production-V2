import {
    buildAggregatedComponents,
    buildStockSummary,
    defaultTapeThicknessMm,
    estimateReelQuantity,
} from '../bomPlanning';
import { lookupFootprint } from '../eia481Footprint';

describe('lookupFootprint (repli EIA-481 depuis le footprint)', () => {
    it('résout les passifs courants', () => {
        expect(lookupFootprint('0603')).toEqual({ pitchMm: 4, tapeWidthMm: 8 });
        expect(lookupFootprint('R0603')).toEqual({ pitchMm: 4, tapeWidthMm: 8 });
        expect(lookupFootprint('0402')).toEqual({ pitchMm: 2, tapeWidthMm: 8 });
        expect(lookupFootprint('SOIC8')).toEqual({ pitchMm: 8, tapeWidthMm: 12 });
    });

    it('renvoie des null pour un footprint inconnu', () => {
        expect(lookupFootprint('ZZZ')).toEqual({ pitchMm: null, tapeWidthMm: null });
        expect(lookupFootprint('')).toEqual({ pitchMm: null, tapeWidthMm: null });
    });
});

describe('defaultTapeThicknessMm', () => {
    it('returns width-based defaults', () => {
        expect(defaultTapeThicknessMm(8)).toBe(0.7);
        expect(defaultTapeThicknessMm(12)).toBe(1.0);
        expect(defaultTapeThicknessMm(16)).toBe(1.2);
        expect(defaultTapeThicknessMm(24)).toBe(1.6);
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
        expect(summary.resolvedTapeThicknessMm).toBe(1.0);
    });

    it('prefers an explicit draft thickness over the default', () => {
        const summary = buildStockSummary(
            { requiredQuantity: 10, componentTapeWidthMm: 12 },
            { tape_thickness_mm: 2 },
        );
        expect(summary.resolvedTapeThicknessMm).toBe(2);
    });
});

describe('buildStockSummary wound-thickness mode', () => {
    const line = { requiredQuantity: 10, componentTapeWidthMm: 8, componentPitchMm: 4 };

    it('derives the outer diameter from hub + 2 × wound thickness', () => {
        // hub 60 + 2×59 = 178 -> identique à une saisie directe du Ø extérieur.
        const summary = buildStockSummary(line, {
            reel_hub_diameter_mm: 60,
            reel_wound_thickness_mm: 59,
            tape_thickness_mm: 1.0,
            reel_safety_pct: 0,
        });
        expect(summary.effectiveOuterDiameterMm).toBe(178);
        expect(summary.reelEstimatedQty).toBe(
            estimateReelQuantity({
                outerDiameterMm: 178,
                hubDiameterMm: 60,
                pitchMm: 4,
                safetyPct: 0,
                tapeThicknessMm: 1.0,
            }),
        );
    });

    it('ignores wound thickness when an explicit outer diameter is provided', () => {
        const summary = buildStockSummary(line, {
            reel_outer_diameter_mm: 146,
            reel_hub_diameter_mm: 56.8,
            reel_wound_thickness_mm: 999,
            tape_thickness_mm: 0.7,
            reel_safety_pct: 0,
        });
        expect(summary.effectiveOuterDiameterMm).toBe(146);
    });

    it('falls back to the default hub (50 mm) when none is provided', () => {
        const summary = buildStockSummary(line, {
            reel_wound_thickness_mm: 59,
            tape_thickness_mm: 1.0,
            reel_safety_pct: 0,
        });
        expect(summary.resolvedHubDiameterMm).toBe(50);
        // Ø extérieur déduit = 50 + 2×59 = 168 mm.
        expect(summary.effectiveOuterDiameterMm).toBe(168);
        expect(summary.reelEstimatedQty).toBe(
            estimateReelQuantity({
                outerDiameterMm: 168,
                hubDiameterMm: 50,
                pitchMm: 4,
                safetyPct: 0,
                tapeThicknessMm: 1.0,
            }),
        );
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
