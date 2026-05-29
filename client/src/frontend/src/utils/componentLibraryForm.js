export const emptyComponent = {
    id: null,
    reference: '',
    value: '',
    mpn: '',
    component_type: '',
    package: '',
    tape_width_mm: '',
    pitch_mm: '',
    supplier_code: '',
    footprint_eagle: '',
    footprint_pnp: '',
    feeder_type: '',
    description: '',
    notes: '',
};

export const emptyFeedback = { status: 'idle', message: '', details: [] };

export const stickyEditorSx = { position: { xs: 'static', lg: 'sticky' }, top: { lg: 96 }, alignSelf: 'flex-start' };

const SUPPORTED_LIBRARY_EXTENSIONS = ['.xlsx', '.xlsm'];
const SUPPORTED_LIBRARY_TYPES = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
];
const SUPPORTED_MACHINE_FOOTPRINT_EXTENSIONS = ['.txt', '.csv'];
const SUPPORTED_MACHINE_FOOTPRINT_TYPES = [
    'text/plain',
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
];

export function pickComponentField(item, keys) {
    for (const key of keys) {
        const value = item?.[key];
        if (value !== undefined && value !== null && `${value}`.trim() !== '') {
            return `${value}`;
        }
    }
    return '';
}

export function readComponentBooleanField(item, keys) {
    for (const key of keys) {
        const value = item?.[key];
        if (typeof value === 'boolean') {
            return value;
        }

        if (value === 1 || value === '1') {
            return true;
        }

        if (value === 0 || value === '0') {
            return false;
        }

        const normalizedValue = String(value || '').trim().toLowerCase();
        if (normalizedValue === 'true') {
            return true;
        }

        if (normalizedValue === 'false') {
            return false;
        }
    }

    return false;
}

export function normalizeComponentsPayload(payload) {
    return Array.isArray(payload) ? payload : payload?.components || payload?.items || payload?.results || payload?.data || [];
}

export function safeDecodeFileName(name) {
    try {
        return decodeURIComponent(name);
    } catch (_error) {
        return name;
    }
}

export function isSupportedLibraryFile(file) {
    if (!file) {
        return false;
    }

    const lowerName = String(file.name || '').toLowerCase();
    if (SUPPORTED_LIBRARY_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
        return true;
    }

    return SUPPORTED_LIBRARY_TYPES.includes(String(file.type || '').toLowerCase());
}

export function isSupportedMachineFootprintFile(file) {
    if (!file) {
        return false;
    }

    const lowerName = String(file.name || '').toLowerCase();
    if (SUPPORTED_MACHINE_FOOTPRINT_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
        return true;
    }

    return SUPPORTED_MACHINE_FOOTPRINT_TYPES.includes(String(file.type || '').toLowerCase());
}

export function buildLibraryImportFeedback(payload) {
    const details = Array.isArray(payload?.errors)
        ? payload.errors.filter((item) => String(item || '').trim() !== '')
        : [];
    const createdCount = Number(payload?.created_count || 0);
    const updatedCount = Number(payload?.updated_count || 0);
    const skippedCount = Number(payload?.skipped_count || 0);
    const importedCount = Number(payload?.item_count || 0);
    const countersLabel = `${createdCount} créé(s), ${updatedCount} mis à jour, ${skippedCount} ignoré(s).`;

    if (details.length) {
        return {
            status: importedCount > 0 || createdCount > 0 || updatedCount > 0 ? 'warning' : 'error',
            message: `${payload?.message || 'Import terminé avec avertissements.'} ${countersLabel}`,
            details,
        };
    }

    return {
        status: 'success',
        message: `${payload?.message || 'Bibliothèque importée avec succès.'} ${countersLabel}`,
        details: [],
    };
}

export function buildMachineFootprintImportFeedback(payload) {
    const details = Array.isArray(payload?.errors)
        ? payload.errors.filter((item) => String(item || '').trim() !== '')
        : [];
    const createdCount = Number(payload?.created_count || 0);
    const updatedCount = Number(payload?.updated_count || 0);
    const skippedCount = Number(payload?.skipped_count || 0);
    const synchronizedComponentCount = Number(payload?.synchronized_component_count || 0);
    const importedCount = Number(payload?.item_count || 0);
    const countersLabel = `${createdCount} cree(s), ${updatedCount} mis a jour, ${skippedCount} ignore(s), ${synchronizedComponentCount} composant(s) complete(s).`;

    if (details.length) {
        return {
            status: importedCount > 0 || createdCount > 0 || updatedCount > 0 ? 'warning' : 'error',
            message: `${payload?.message || 'Import termine avec avertissements.'} ${countersLabel}`,
            details,
        };
    }

    return {
        status: 'success',
        message: `${payload?.message || 'Catalogue MachineFootprint importe avec succes.'} ${countersLabel}`,
        details: [],
    };
}

export function buildComponentTypeRefreshFeedback(payload) {
    const updatedComponentCount = Number(payload?.updated_component_count || 0);
    const updatedBomItemCount = Number(payload?.updated_bom_item_count || 0);
    const inferredTypeCount = Number(payload?.inferred_type_count || 0);
    const ambiguousComponentCount = Number(payload?.ambiguous_component_count || 0);
    const manualPreservedCount = Number(payload?.manual_preserved_count || 0);
    const skippedCount = Number(payload?.skipped_count || 0);
    const details = [
        `${inferredTypeCount} type(s) inferes`,
        `${ambiguousComponentCount} suggestion(s) ambigu(es) a verifier`,
        `${manualPreservedCount} type(s) manuel(s) preserves`,
        `${skippedCount} element(s) ignores`,
    ];

    return {
        status: ambiguousComponentCount > 0 ? 'warning' : 'success',
        message: payload?.message
            || `${updatedComponentCount} composant(s) et ${updatedBomItemCount} ligne(s) BOM mis a jour.`,
        details,
    };
}

export function normalizeMachineFootprintToken(value) {
    return String(value || '').trim().toUpperCase();
}

export function normalizeComponentTypeToken(value) {
    return String(value || '').trim().toUpperCase();
}

export function normalizeMachineFootprintCatalogPayload(payload) {
    return Array.isArray(payload) ? payload : payload?.items || payload?.results || payload?.data || [];
}

export function buildMachineFootprintCatalogLookup(entries) {
    return normalizeMachineFootprintCatalogPayload(entries).reduce((lookup, entry) => {
        const token = normalizeMachineFootprintToken(entry?.machine_footprint);
        if (token) {
            if (!lookup[token]) {
                lookup[token] = [];
            }
            lookup[token].push({
                ...entry,
                machine_footprint: token,
            });
        }
        return lookup;
    }, {});
}

function resolveSharedCatalogValue(entries, fieldName) {
    const values = entries.reduce((items, entry) => {
        const value = entry?.[fieldName];
        if (value !== undefined && value !== null && `${value}`.trim() !== '' && !items.includes(value)) {
            items.push(value);
        }
        return items;
    }, []);

    return values.length === 1 ? values[0] : null;
}

export function lookupMachineFootprintCatalogEntry(lookup, value, componentType = '') {
    const machineFootprint = normalizeMachineFootprintToken(value);
    const entries = lookup?.[machineFootprint] || [];
    if (!entries.length) {
        return null;
    }

    const componentTypeToken = normalizeComponentTypeToken(componentType);
    const narrowedEntries = componentTypeToken
        ? entries.filter((entry) => normalizeComponentTypeToken(entry?.component_type) === componentTypeToken)
        : [];
    const selectedEntries = narrowedEntries.length ? narrowedEntries : entries;

    return {
        machine_footprint: machineFootprint,
        component_type: resolveSharedCatalogValue(selectedEntries, 'component_type'),
        tape_width_mm: resolveSharedCatalogValue(selectedEntries, 'tape_width_mm'),
        pitch_mm: resolveSharedCatalogValue(selectedEntries, 'pitch_mm'),
        feeder_type: resolveSharedCatalogValue(selectedEntries, 'feeder_type'),
        variant_count: selectedEntries.length,
    };
}

export function buildMachineFootprintOptions(entries) {
    const seen = new Set();
    return normalizeMachineFootprintCatalogPayload(entries).reduce((items, entry) => {
        const token = normalizeMachineFootprintToken(entry?.machine_footprint);
        if (!token || seen.has(token)) {
            return items;
        }

        seen.add(token);
        items.push({ machine_footprint: token });
        return items;
    }, []);
}

export function applyMachineFootprintCatalogDefaults(component, catalogEntry) {
    if (!catalogEntry) {
        return component;
    }

    const machineFootprint = `${catalogEntry.machine_footprint || component.footprint_pnp || component.package || ''}`.trim();
    return {
        ...component,
        component_type: `${catalogEntry.component_type ?? component.component_type ?? ''}`.trim(),
        package: machineFootprint,
        tape_width_mm: catalogEntry.tape_width_mm ?? component.tape_width_mm ?? '',
        pitch_mm: catalogEntry.pitch_mm ?? component.pitch_mm ?? '',
        footprint_pnp: machineFootprint,
        feeder_type: `${catalogEntry.feeder_type ?? component.feeder_type ?? ''}`.trim(),
    };
}

export function formatMachineFootprintCatalogSummary(entry) {
    if (!entry) {
        return '';
    }

    const parts = [
        entry.variant_count > 1 ? `${entry.variant_count} variantes` : null,
        entry.component_type ? `Type ${entry.component_type}` : null,
        entry.tape_width_mm !== null && entry.tape_width_mm !== undefined && `${entry.tape_width_mm}` !== ''
            ? `Tape ${entry.tape_width_mm} mm`
            : null,
        entry.pitch_mm !== null && entry.pitch_mm !== undefined && `${entry.pitch_mm}` !== ''
            ? `Pitch ${entry.pitch_mm} mm`
            : null,
        entry.feeder_type ? `Feeder ${entry.feeder_type}` : null,
    ].filter(Boolean);

    return parts.join(' | ');
}

export function normalizePackageFields(packageValue, footprintPnpValue) {
    const sharedValue = `${footprintPnpValue || packageValue || ''}`.trim();
    return {
        package: sharedValue,
        footprint_pnp: sharedValue,
    };
}

export function componentToForm(item) {
    if (!item) {
        return emptyComponent;
    }

    return {
        id: item.id ?? null,
        reference: pickComponentField(item, ['reference']),
        value: pickComponentField(item, ['value', 'Value']),
        mpn: pickComponentField(item, ['mpn', 'MPN']),
        component_type: pickComponentField(item, ['component_type', 'Type']),
        package: pickComponentField(item, ['package', 'footprint_pnp', 'MachineFootprint']),
        tape_width_mm: pickComponentField(item, ['tape_width_mm', 'TapeWidthMm']),
        pitch_mm: pickComponentField(item, ['pitch_mm', 'PitchMm']),
        supplier_code: pickComponentField(item, ['supplier_code']),
        footprint_eagle: pickComponentField(item, ['footprint_eagle', 'EagleFootprint']),
        footprint_pnp: pickComponentField(item, ['footprint_pnp', 'MachineFootprint', 'package']),
        feeder_type: pickComponentField(item, ['feeder_type', 'FeederType']),
        description: pickComponentField(item, ['description']),
        notes: pickComponentField(item, ['notes']),
    };
}
