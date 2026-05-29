import {
    areSelectedCommandEntriesLoaded,
    buildCommandContextSignature,
    buildCommandSummarySignature,
    countLoadedCommandEntries,
    isCommandSummaryCurrent,
} from '../commandPlanning';
import { buildReferenceRevisionKey } from '../bomWorkspace';

describe('commandPlanning helpers', () => {
    it('builds stable signatures from selection quantities and command summaries', () => {
        const entries = [
            {
                bom_revision_id: 20,
                reference: 'CARD_B',
                revision: 'REV_B',
            },
            {
                bom_revision_id: 10,
                reference: 'CARD_A',
                revision: 'REV_A',
            },
        ];
        const quantitiesByReference = {
            [buildReferenceRevisionKey('CARD_A', 'REV_A')]: { quantityToProduce: 3 },
            [buildReferenceRevisionKey('CARD_B', 'REV_B')]: { quantityToProduce: 1 },
        };
        const summary = {
            id: 99,
            items: [
                { bom_revision_id: 20, quantity_to_produce: 1 },
                { bom_revision_id: 10, quantity_to_produce: 3 },
            ],
        };

        expect(buildCommandContextSignature(entries, quantitiesByReference)).toBe('10:3|20:1');
        expect(buildCommandSummarySignature(summary)).toBe('10:3|20:1');
        expect(isCommandSummaryCurrent(summary, entries, quantitiesByReference)).toBe(true);
    });

    it('detects when a backend command no longer matches the current quantities', () => {
        const entries = [
            {
                bom_revision_id: 10,
                reference: 'CARD_A',
                revision: 'REV_A',
            },
        ];
        const quantitiesByReference = {
            [buildReferenceRevisionKey('CARD_A', 'REV_A')]: { quantityToProduce: 5 },
        };
        const summary = {
            id: 100,
            items: [
                { bom_revision_id: 10, quantity_to_produce: 2 },
            ],
        };

        expect(isCommandSummaryCurrent(summary, entries, quantitiesByReference)).toBe(false);
    });

    it('counts loaded revisions using the workspace cache and current BOM fallback', () => {
        const entries = [
            { bom_revision_id: 10, reference: 'CARD_A', revision: 'REV_A' },
            { bom_revision_id: 20, reference: 'CARD_B', revision: 'REV_B' },
        ];
        const revisionsById = {
            10: { bomRevisionId: 10, items: [] },
        };
        const currentBom = {
            bomRevisionId: 20,
        };

        expect(countLoadedCommandEntries(entries, revisionsById, currentBom)).toBe(2);
        expect(areSelectedCommandEntriesLoaded(entries, revisionsById, currentBom)).toBe(true);
        expect(areSelectedCommandEntriesLoaded(entries, revisionsById, null)).toBe(false);
    });
});
