import { getBomItemType } from './bomSession';
import { buildReferenceRevisionKey } from './bomWorkspace';
import { lookupFootprint } from './eia481Footprint';

const DEFAULT_TAPE_THICKNESS_MM = 1.0;
const DEFAULT_SAFETY_PCT = 5;
// Moyeu (Ø intérieur) par défaut : normé EIA-481. Les bobines 7" (passifs
// courants type 0603/0805) ont un moyeu ~50 mm. Modifiable à la main pour
// les grosses bobines 13" (~100 mm).
const DEFAULT_HUB_DIAMETER_MM = 50;

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

// Épaisseur de bande par défaut selon la largeur de bande (mm).
// Approximation EIA-481 : bande papier fine pour 8 mm, plastique gaufré plus épais
// au-delà. Ces valeurs sont des défauts modifiables à la main dans l'UI.
export function defaultTapeThicknessMm(tapeWidthMm) {
    const width = toNumber(tapeWidthMm, 0);
    if (width <= 0) {
        return DEFAULT_TAPE_THICKNESS_MM;
    }
    // EIA-481 ne fixe pas l'épaisseur par largeur (elle dépend du composant et
    // du matériau : papier ≤1,1 mm pour passifs fins, gaufré ≤1,6 mm). Ces
    // valeurs sont des défauts réalistes par largeur, modifiables par bobine.
    if (width <= 8) {
        return 0.7;  // bande papier — passifs 0402/0603/0805/1206
    }
    if (width <= 12) {
        return 1.0;
    }
    if (width <= 16) {
        return 1.2;
    }
    return 1.6;       // bandes gaufrées larges (24 mm et +)
}

export function buildBoardQuantityRows(entries = [], quantitiesByReference = {}) {
    const groups = new Map();

    entries.forEach((entry) => {
        const key = buildReferenceRevisionKey(entry.reference, entry.revision);
        if (!groups.has(key)) {
            groups.set(key, {
                key,
                reference: entry.reference || '',
                revision: entry.revision || '',
                sides: [],
                bomRevisionIds: [],
                quantityToProduce: quantitiesByReference[key]?.quantityToProduce || 1,
            });
        }

        const group = groups.get(key);
        if (!group.sides.includes(entry.side)) {
            group.sides.push(entry.side);
        }
        if (entry.bom_revision_id && !group.bomRevisionIds.includes(entry.bom_revision_id)) {
            group.bomRevisionIds.push(entry.bom_revision_id);
        }
    });

    return Array.from(groups.values()).sort((left, right) => {
        const referenceCompare = left.reference.localeCompare(right.reference);
        if (referenceCompare !== 0) {
            return referenceCompare;
        }

        return left.revision.localeCompare(right.revision);
    });
}

export function buildComponentAggregateKey(value, footprint, type) {
    return [
        String(value || '').trim().toUpperCase(),
        String(footprint || '').trim().toUpperCase(),
        String(type || '').trim().toUpperCase(),
    ].join('__');
}

export function estimateReelQuantity({
    outerDiameterMm,
    hubDiameterMm,
    pitchMm,
    safetyPct = DEFAULT_SAFETY_PCT,
    tapeThicknessMm = DEFAULT_TAPE_THICKNESS_MM,
}) {
    const outer = toNumber(outerDiameterMm);
    const hub = toNumber(hubDiameterMm);
    const pitch = toNumber(pitchMm);
    const safety = toNumber(safetyPct, DEFAULT_SAFETY_PCT);
    const tapeThickness = toNumber(tapeThicknessMm, DEFAULT_TAPE_THICKNESS_MM);

    if (outer <= 0 || hub <= 0 || pitch <= 0 || outer <= hub || tapeThickness <= 0) {
        return null;
    }

    const tapeLengthMm = Math.PI * ((outer ** 2) - (hub ** 2)) / (4 * tapeThickness);
    const rawQuantity = tapeLengthMm / pitch;
    const safeRatio = Math.max(0, 1 - (safety / 100));

    return Math.max(0, Math.floor(rawQuantity * safeRatio));
}

export function buildStockSummary(line, stockDraft = {}) {
    const resolvedTapeThicknessMm = toNumber(stockDraft.tape_thickness_mm, 0) > 0
        ? toNumber(stockDraft.tape_thickness_mm)
        : defaultTapeThicknessMm(line.componentTapeWidthMm);

    // Ø extérieur effectif : soit saisi directement, soit déduit de l'épaisseur
    // radiale de la bande enroulée (Ø_ext = Ø_moyeu + 2 × épaisseur d'enroulement).
    // Le moyeu est requis dans les deux cas (la valeur est normée EIA-481).
    // Moyeu résolu : valeur saisie sinon défaut normé (pré-rempli côté UI).
    const resolvedHubDiameterMm = toNumber(stockDraft.reel_hub_diameter_mm, 0) > 0
        ? toNumber(stockDraft.reel_hub_diameter_mm)
        : DEFAULT_HUB_DIAMETER_MM;
    const woundThicknessMm = toNumber(stockDraft.reel_wound_thickness_mm, 0);
    let effectiveOuterDiameterMm = toNumber(stockDraft.reel_outer_diameter_mm, 0);
    if (effectiveOuterDiameterMm <= 0 && woundThicknessMm > 0 && resolvedHubDiameterMm > 0) {
        effectiveOuterDiameterMm = resolvedHubDiameterMm + (2 * woundThicknessMm);
    }

    const reelEstimatedQty = estimateReelQuantity({
        outerDiameterMm: effectiveOuterDiameterMm,
        hubDiameterMm: resolvedHubDiameterMm,
        pitchMm: stockDraft.pitch_mm || line.componentPitchMm,
        // Honore une marge de 0 % (|| écraserait 0 en 25 %).
        safetyPct: stockDraft.reel_safety_pct != null && stockDraft.reel_safety_pct !== ''
            ? stockDraft.reel_safety_pct
            : DEFAULT_SAFETY_PCT,
        tapeThicknessMm: resolvedTapeThicknessMm,
    });
    const reelManualOverrideQty = toNumber(stockDraft.reel_manual_override_qty, 0);
    const reelAvailableQty = reelManualOverrideQty > 0 ? reelManualOverrideQty : (reelEstimatedQty || 0);
    const bagQty = toNumber(stockDraft.bag_qty, 0);
    const tubeQty = toNumber(stockDraft.tube_qty, 0);
    const totalAvailableQty = reelAvailableQty + bagQty + tubeQty;
    const manualPlacement = Boolean(line.manualPlacementBase || bagQty > 0 || tubeQty > 0);
    const quantityToOrder = Math.max(0, line.requiredQuantity - totalAvailableQty);

    let status = 'À commander';
    if (manualPlacement) {
        status = 'Pose manuelle';
    } else if (quantityToOrder === 0) {
        status = 'OK stock';
    } else if (totalAvailableQty > 0) {
        status = 'Stock partiel';
    }

    return {
        reelEstimatedQty,
        resolvedTapeThicknessMm,
        resolvedHubDiameterMm,
        effectiveOuterDiameterMm: effectiveOuterDiameterMm > 0 ? effectiveOuterDiameterMm : null,
        reelAvailableQty,
        bagQty,
        tubeQty,
        totalAvailableQty,
        quantityToOrder,
        manualPlacement,
        status,
    };
}

export function buildAggregatedComponents(
    revisionsById = {},
    quantityMap = {},
    stockDraftByComponentKey = {},
) {
    const groups = new Map();

    Object.values(revisionsById).forEach((revision) => {
        if (!revision?.items?.length) {
            return;
        }

        const quantityKey = buildReferenceRevisionKey(revision.reference, revision.revision);
        const boardsToProduce = toNumber(quantityMap[quantityKey]?.quantityToProduce, 1) || 1;

        revision.items.forEach((item) => {
            if (item.dnp) {
                return;
            }

            const value = item.value_harmonized || item.value_raw || 'Valeur non renseignee';
            const footprint = item.footprint_pnp || item.footprint_eagle || 'Empreinte non renseignee';
            const type = getBomItemType(item);
            const key = buildComponentAggregateKey(value, footprint, type);
            const requiredQuantity = (toNumber(item.quantity, 1) || 1) * boardsToProduce;

            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    value,
                    footprint,
                    type,
                    requiredQuantity: 0,
                    references: new Set(),
                    sources: new Set(),
                    componentLibraryIds: new Set(),
                    componentPitchCandidates: new Set(),
                    componentTapeWidthCandidates: new Set(),
                    componentLibraryName: null,
                    manualPlacementBase: false,
                });
            }

            const group = groups.get(key);
            group.requiredQuantity += requiredQuantity;
            group.references.add(item.reference || item.reference_item || '?');
            group.sources.add(`${revision.reference || 'BOM'} ${revision.revision || ''} ${revision.side || ''}`.trim());
            if (item.component_library_id) {
                group.componentLibraryIds.add(item.component_library_id);
            }
            if (item.component_library_pitch_mm) {
                group.componentPitchCandidates.add(item.component_library_pitch_mm);
            }
            if (item.component_library_tape_width_mm) {
                group.componentTapeWidthCandidates.add(item.component_library_tape_width_mm);
            }
            if (!group.componentLibraryName && item.component_library_name) {
                group.componentLibraryName = item.component_library_name;
            }
        });
    });

    return Array.from(groups.values())
        .map((group) => {
            const componentLibraryIds = Array.from(group.componentLibraryIds);
            const componentPitchCandidates = Array.from(group.componentPitchCandidates);
            const componentTapeWidthCandidates = Array.from(group.componentTapeWidthCandidates);
            const draft = stockDraftByComponentKey[group.key] || {};
            // Valeur stockée si une seule candidate, sinon repli sur la norme
            // EIA-481 déduite du footprint (ex. 0603 -> pitch 4 / largeur 8 mm).
            const storedPitchMm = componentPitchCandidates.length === 1 ? componentPitchCandidates[0] : null;
            const storedTapeWidthMm = componentTapeWidthCandidates.length === 1 ? componentTapeWidthCandidates[0] : null;
            const eia481 = lookupFootprint(group.footprint);
            const componentPitchMm = storedPitchMm != null ? storedPitchMm : eia481.pitchMm;
            const componentTapeWidthMm = storedTapeWidthMm != null ? storedTapeWidthMm : eia481.tapeWidthMm;
            const stock = buildStockSummary(
                {
                    requiredQuantity: group.requiredQuantity,
                    componentPitchMm,
                    componentTapeWidthMm,
                    manualPlacementBase: group.manualPlacementBase,
                },
                draft,
            );

            return {
                key: group.key,
                value: group.value,
                footprint: group.footprint,
                type: group.type,
                requiredQuantity: group.requiredQuantity,
                references: Array.from(group.references),
                sources: Array.from(group.sources),
                componentLibraryId: componentLibraryIds.length === 1 ? componentLibraryIds[0] : null,
                componentLibraryName: group.componentLibraryName,
                componentPitchMm,
                componentTapeWidthMm,
                manualPlacementBase: group.manualPlacementBase,
                draft,
                ...stock,
            };
        })
        .sort((left, right) => {
            if (right.requiredQuantity !== left.requiredQuantity) {
                return right.requiredQuantity - left.requiredQuantity;
            }

            return left.value.localeCompare(right.value);
        });
}
