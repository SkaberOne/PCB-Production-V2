jest.mock('axios', () => {
    // L'instance partage les mêmes jest.fn que le default, donc régler
    // axios.default.patch pilote aussi apiClient.patch (= axios.create()).
    const instance = {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
        interceptors: {
            request: { use: jest.fn() },
            response: { use: jest.fn() },
        },
    };
    return {
        __esModule: true,
        default: { ...instance, create: jest.fn(() => instance) },
    };
});

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
            '/bom/files/7',
            { reference: 'NEW_REF', revision: 'REV_B' },
            { signal: undefined },
        );
        expect(axios.patch).toHaveBeenNthCalledWith(
            2,
            '/bom/references/22/category',
            { category: 'AMPLI' },
            { signal: undefined },
        );
        expect(axios.get).toHaveBeenCalledWith('/bom/files/7/session', { signal: undefined });
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
            1,
            '/bom/files/5',
            { reference: 'PSU_CARD', revision: 'REV_C' },
            { signal: undefined },
        );
        expect(axios.patch).toHaveBeenNthCalledWith(
            2,
            '/bom/references/33/category',
            { category: 'POWER' },
            { signal: undefined },
        );
        expect(axios.get).toHaveBeenCalledWith('/bom/files/5/session', { signal: undefined });
        // Le flux ne fait plus de PUT /review ni d'appel à setImportedBom : il persiste
        // les métadonnées par lot et retourne { settledResults, activeRevisionMeta }.
        expect(axios.put).not.toHaveBeenCalled();
        expect(setImportedBom).not.toHaveBeenCalled();
        expect(persistedBom.activeRevisionMeta).toMatchObject({
            bom_reference_id: 33,
            bom_revision_id: 5,
            reference: 'PSU_CARD',
            revision: 'REV_C',
            side: 'TOP',
            category: 'POWER',
        });
    });
});
