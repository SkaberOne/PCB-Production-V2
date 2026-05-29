import {
    applyMachineFootprintCatalogDefaults,
    buildComponentTypeRefreshFeedback,
    buildMachineFootprintOptions,
    buildLibraryImportFeedback,
    buildMachineFootprintCatalogLookup,
    buildMachineFootprintImportFeedback,
    isSupportedLibraryFile,
    isSupportedMachineFootprintFile,
    lookupMachineFootprintCatalogEntry,
    normalizeMachineFootprintToken,
    normalizePackageFields,
} from '../componentLibraryForm';

describe('componentLibraryForm helpers', () => {
    it('keeps package and pnp footprint synchronized', () => {
        expect(normalizePackageFields('0603', '')).toEqual({
            package: '0603',
            footprint_pnp: '0603',
        });
        expect(normalizePackageFields('', 'R_0603')).toEqual({
            package: 'R_0603',
            footprint_pnp: 'R_0603',
        });
    });

    it('builds a warning feedback when import returns partial row errors', () => {
        expect(buildLibraryImportFeedback({
            message: 'Imported 1 component library rows',
            item_count: 1,
            created_count: 1,
            updated_count: 0,
            skipped_count: 0,
            errors: ['Row 3: missing Value/MPN'],
        })).toEqual({
            status: 'warning',
            message: 'Imported 1 component library rows 1 créé(s), 0 mis à jour, 0 ignoré(s).',
            details: ['Row 3: missing Value/MPN'],
        });
    });

    it('builds a success feedback when import completes cleanly', () => {
        expect(buildLibraryImportFeedback({
            message: 'Imported 2 component library rows',
            item_count: 2,
            created_count: 1,
            updated_count: 1,
            skipped_count: 0,
            errors: [],
        })).toEqual({
            status: 'success',
            message: 'Imported 2 component library rows 1 créé(s), 1 mis à jour, 0 ignoré(s).',
            details: [],
        });
    });

    it('accepts only supported Excel library files', () => {
        expect(isSupportedLibraryFile({ name: 'library.xlsx', type: '' })).toBe(true);
        expect(isSupportedLibraryFile({ name: 'library.xlsm', type: '' })).toBe(true);
        expect(isSupportedLibraryFile({ name: 'library.csv', type: 'text/csv' })).toBe(false);
        expect(isSupportedLibraryFile({ name: 'library.xls', type: 'application/vnd.ms-excel' })).toBe(false);
    });

    it('accepts txt or csv machine-footprint catalog files', () => {
        expect(isSupportedMachineFootprintFile({ name: 'machine_footprints.txt', type: '' })).toBe(true);
        expect(isSupportedMachineFootprintFile({ name: 'machine_footprints.csv', type: 'text/csv' })).toBe(true);
        expect(isSupportedMachineFootprintFile({ name: 'machine_footprints.xlsx', type: '' })).toBe(false);
    });

    it('indexes machine footprints case-insensitively and auto-applies catalog defaults', () => {
        const lookup = buildMachineFootprintCatalogLookup([
            {
                machine_footprint: 'r_0603',
                component_type: 'R',
                tape_width_mm: 8,
                pitch_mm: 4,
                feeder_type: 'CL8-4',
            },
        ]);

        expect(normalizeMachineFootprintToken(' r_0603 ')).toBe('R_0603');
        const entry = lookupMachineFootprintCatalogEntry(lookup, 'R_0603');
        expect(entry).toEqual({
            machine_footprint: 'R_0603',
            component_type: 'R',
            tape_width_mm: 8,
            pitch_mm: 4,
            feeder_type: 'CL8-4',
            variant_count: 1,
        });

        expect(applyMachineFootprintCatalogDefaults({
            reference: 'LIB-R0603',
            package: '',
            footprint_pnp: 'R_0603',
            component_type: '',
            tape_width_mm: '',
            pitch_mm: '',
            feeder_type: '',
        }, entry)).toEqual({
            reference: 'LIB-R0603',
            package: 'R_0603',
            footprint_pnp: 'R_0603',
            component_type: 'R',
            tape_width_mm: 8,
            pitch_mm: 4,
            feeder_type: 'CL8-4',
        });
    });

    it('keeps only unambiguous defaults when several variants share the same footprint', () => {
        const entries = [
            { machine_footprint: '1206', component_type: 'PASSIF', tape_width_mm: 8, pitch_mm: 4, feeder_type: 'CL8-4' },
            { machine_footprint: '1206', component_type: 'PASSIF', tape_width_mm: 8, pitch_mm: 8, feeder_type: 'CL8-4' },
            { machine_footprint: '1206', component_type: 'LED', tape_width_mm: 8, pitch_mm: 4, feeder_type: 'CL8-4' },
        ];
        const lookup = buildMachineFootprintCatalogLookup(entries);

        expect(buildMachineFootprintOptions(entries)).toEqual([{ machine_footprint: '1206' }]);

        expect(lookupMachineFootprintCatalogEntry(lookup, '1206')).toEqual({
            machine_footprint: '1206',
            component_type: null,
            tape_width_mm: 8,
            pitch_mm: null,
            feeder_type: 'CL8-4',
            variant_count: 3,
        });

        expect(lookupMachineFootprintCatalogEntry(lookup, '1206', 'LED')).toEqual({
            machine_footprint: '1206',
            component_type: 'LED',
            tape_width_mm: 8,
            pitch_mm: 4,
            feeder_type: 'CL8-4',
            variant_count: 1,
        });
    });

    it('builds a machine-footprint import success feedback with sync counters', () => {
        expect(buildMachineFootprintImportFeedback({
            message: 'Imported 2 machine footprint rows',
            item_count: 2,
            created_count: 1,
            updated_count: 1,
            skipped_count: 0,
            synchronized_component_count: 3,
            errors: [],
        })).toEqual({
            status: 'success',
            message: 'Imported 2 machine footprint rows 1 cree(s), 1 mis a jour, 0 ignore(s), 3 composant(s) complete(s).',
            details: [],
        });
    });

    it('builds a warning feedback when type refresh surfaces ambiguous suggestions', () => {
        expect(buildComponentTypeRefreshFeedback({
            message: 'Rattrapage termine: 4 composant(s) et 12 ligne(s) BOM mis a jour.',
            updated_component_count: 4,
            updated_bom_item_count: 12,
            inferred_type_count: 4,
            ambiguous_component_count: 1,
            manual_preserved_count: 3,
            skipped_count: 2,
        })).toEqual({
            status: 'warning',
            message: 'Rattrapage termine: 4 composant(s) et 12 ligne(s) BOM mis a jour.',
            details: [
                '4 type(s) inferes',
                '1 suggestion(s) ambigu(es) a verifier',
                '3 type(s) manuel(s) preserves',
                '2 element(s) ignores',
            ],
        });
    });
});
