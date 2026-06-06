import { computeWorkflowProgress } from '../workflowProgress';

const cleanItem = (reference = 'R1') => ({
    reference,
    value_raw: '10K',
    value_harmonized: '10K',
    footprint_eagle: 'R0603',
    footprint_pnp: 'R0603',
});

const reviewItem = (reference = 'R2') => ({
    reference,
    value_raw: '1K',
    footprint_eagle: 'R0603',
    footprint_pnp: null,
});

describe('computeWorkflowProgress', () => {
    it('retourne 0 partout sans session', () => {
        expect(computeWorkflowProgress({})).toEqual([0, 0, 0, 0, 0]);
        expect(computeWorkflowProgress()).toEqual([0, 0, 0, 0, 0]);
    });

    it('étape 1 pleine avec production active', () => {
        const progress = computeWorkflowProgress({ activeProduction: { id: 12 } });
        expect(progress[0]).toBe(1);
        expect(progress[1]).toBe(0);
    });

    it('étape 2 = fraction des révisions chargées', () => {
        const progress = computeWorkflowProgress({
            bomWorkspace: {
                selectedRevisionEntries: [
                    { bom_revision_id: 1 },
                    { bom_revision_id: 2 },
                ],
                revisionsById: {
                    1: { loaded: true, items: [] },
                },
            },
        });
        expect(progress[1]).toBe(0.5);
    });

    it('étape 3 plafonnée à 0.9 sans validation stock, 1 si validée', () => {
        const workspace = {
            selectedRevisionEntries: [{ bom_revision_id: 1 }],
            revisionsById: {
                1: { loaded: true, items: [cleanItem()], warnings: [], errors: [] },
            },
            stockValidation: { isValidated: false },
        };
        expect(computeWorkflowProgress({ bomWorkspace: workspace })[2]).toBe(0.9);

        workspace.stockValidation = { isValidated: true };
        expect(computeWorkflowProgress({ bomWorkspace: workspace })[2]).toBe(1);
    });

    it('étape 3 partielle avec items à vérifier', () => {
        const progress = computeWorkflowProgress({
            bomWorkspace: {
                revisionsById: {
                    1: {
                        loaded: true,
                        items: [cleanItem('R1'), reviewItem('R2')],
                        warnings: [],
                        errors: [],
                    },
                },
                selectedRevisionEntries: [{ bom_revision_id: 1 }],
            },
        });
        expect(progress[2]).toBeCloseTo(0.45);
    });

    it('étape 4 = fraction de composants couverts par le stock', () => {
        const progress = computeWorkflowProgress({
            bomWorkspace: {
                selectedRevisionEntries: [{ bom_revision_id: 1 }],
                revisionsById: {
                    1: {
                        loaded: true,
                        reference: 'PCB-A',
                        revision: 'B',
                        items: [cleanItem('R1'), { ...cleanItem('C1'), value_harmonized: '100N' }],
                        warnings: [],
                        errors: [],
                    },
                },
                quantitiesByReference: {},
                stockDraftByComponentKey: {
                    '10K__R0603__UNDEFINED': { bag_qty: 50 },
                },
            },
        });
        expect(progress[3]).toBe(0.5);
    });

    it('étape 5 toujours 0 (pas d\'état client)', () => {
        expect(computeWorkflowProgress({ activeProduction: { id: 1 } })[4]).toBe(0);
    });
});
