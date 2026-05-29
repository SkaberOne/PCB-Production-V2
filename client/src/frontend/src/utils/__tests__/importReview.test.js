jest.mock('axios', () => ({
    __esModule: true,
    default: {
        patch: jest.fn(),
        get: jest.fn(),
        put: jest.fn(),
    },
}));

import axios from 'axios';
import {
    hasPersistableImportSelection,
    persistImportedBatchMetadata,
    persistImportWorkspaceBeforeReview,
} from '../importReview';

describe('importReview helpers', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('detects when the import workspace contains no persistable BOM', () => {
        expect(hasPersistableImportSelection({
            currentBom: null,
            importWorkspace: {
                result: { success: false, bom_revision_id: null },
                batchResults: [],
            },
        })).toBe(false);

        expect(hasPersistableImportSelection({
            currentBom: null,
            importWorkspace: {
                result: null,
                batchResults: [
                    { success: false, bom_revision_id: 1 },
                    { success: true, bom_revision_id: 2 },
                ],
            },
        })).toBe(true);
    });

    it('uses the renamed BOM reference id when persisting the category', async () => {
        axios.patch
            .mockResolvedValueOnce({
                data: {
                    bom_reference_id: 22,
                    bom_revision_id: 7,
                },
            })
            .mockResolvedValueOnce({
                data: { category: 'AMPLI' },
            });
        axios.get.mockResolvedValueOnce({
            data: {
                success: true,
                bom_reference_id: 22,
                bom_revision_id: 7,
                reference: 'NEW_REF',
                revision: 'REV_B',
                side: 'TOP',
                items: [],
                stats: {},
                warnings: [],
                errors: [],
                message: 'Loaded NEW_REF REV_B TOP',
            },
        });

        const persistedEntry = await persistImportedBatchMetadata({
            apiUrl: 'http://localhost:8000/api',
            batchItem: {
                success: true,
                bom_reference_id: 11,
                bom_revision_id: 7,
                file_name: 'new_ref_top.txt',
                reference: 'NEW_REF',
                revision: 'REV_B',
                side: 'BOT',
                category: 'AMPLI',
            },
        });

        expect(axios.patch).toHaveBeenNthCalledWith(
            1,
            'http://localhost:8000/api/bom/files/7',
            { reference: 'NEW_REF', revision: 'REV_B' },
        );
        expect(axios.patch).toHaveBeenNthCalledWith(
            2,
            'http://localhost:8000/api/bom/references/22/category',
            { category: 'AMPLI' },
        );
        expect(axios.get).toHaveBeenCalledWith('http://localhost:8000/api/bom/files/7/session');
        expect(persistedEntry).toMatchObject({
            bom_reference_id: 22,
            bom_revision_id: 7,
            side: 'TOP',
            category: 'AMPLI',
            file_name: 'new_ref_top.txt',
        });
    });

    it('persists batch categories during the global save-before-review flow', async () => {
        axios.patch
            .mockResolvedValueOnce({
                data: {
                    bom_reference_id: 33,
                    bom_revision_id: 5,
                },
            })
            .mockResolvedValueOnce({
                data: { category: 'POWER' },
            });
        axios.get.mockResolvedValueOnce({
            data: {
                success: true,
                bom_reference_id: 33,
                bom_revision_id: 5,
                reference: 'PSU_CARD',
                revision: 'REV_C',
                side: 'TOP',
                items: [
                    {
                        id: 101,
                        value_harmonized: '10R',
                        footprint_pnp: 'R0805',
                        notes: null,
                        dnp: false,
                    },
                ],
                stats: {},
                warnings: [],
                errors: [],
            },
        });
        axios.put.mockResolvedValueOnce({
            data: {
                success: true,
                bom_reference_id: 33,
                bom_revision_id: 5,
                revision_status: 'DRAFT',
                item_count: 1,
                items: [
                    {
                        id: 101,
                        value_harmonized: '10R',
                        footprint_pnp: 'R0805',
                        notes: null,
                        dnp: false,
                    },
                ],
                stats: {},
                warnings: [],
                errors: [],
            },
        });

        const setImportedBom = jest.fn();
        const persistedBom = await persistImportWorkspaceBeforeReview({
            apiUrl: 'http://localhost:8000/api',
            currentBom: null,
            setImportedBom,
            importWorkspace: {
                result: {
                    success: true,
                    bom_reference_id: 11,
                    bom_revision_id: 5,
                    reference: 'PSU_CARD',
                    revision: 'REV_C',
                    side: 'BOT',
                    file_name: 'psu_top.txt',
                    items: [
                        {
                            id: 101,
                            value_harmonized: '10R',
                            footprint_pnp: 'R0805',
                            notes: '',
                            dnp: false,
                        },
                    ],
                },
                batchResults: [
                    {
                        success: true,
                        bom_reference_id: 11,
                        bom_revision_id: 5,
                        reference: 'PSU_CARD',
                        revision: 'REV_C',
                        side: 'BOT',
                        category: 'POWER',
                        file_name: 'psu_top.txt',
                        items: [
                            {
                                id: 101,
                                value_harmonized: '10R',
                                footprint_pnp: 'R0805',
                                notes: '',
                                dnp: false,
                            },
                        ],
                    },
                ],
            },
        });

        expect(axios.patch).toHaveBeenNthCalledWith(
            2,
            'http://localhost:8000/api/bom/references/33/category',
            { category: 'POWER' },
        );
        expect(axios.put).toHaveBeenCalledWith(
            'http://localhost:8000/api/bom/33/revisions/5/review',
            {
                items: [
                    {
                        id: 101,
                        value_harmonized: '10R',
                        footprint_pnp: 'R0805',
                        notes: null,
                        dnp: false,
                    },
                ],
                create_mappings: true,
                mark_as_active: false,
            },
        );
        expect(persistedBom).toMatchObject({
            bom_reference_id: 33,
            bom_revision_id: 5,
            reference: 'PSU_CARD',
            revision: 'REV_C',
            side: 'TOP',
            category: 'POWER',
        });
        expect(setImportedBom).toHaveBeenCalledWith(expect.objectContaining({
            bom_reference_id: 33,
            bom_revision_id: 5,
            side: 'TOP',
            category: 'POWER',
        }));
    });
});
