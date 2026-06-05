/**
 * Tokens couleur Machine PnP (palette sombre émeraude/zinc) — source unique pour
 * les composants de la page, afin d'éviter les hex en dur dupliqués.
 */
export const mpnColors = {
    surface: '#18181b',
    border: '#27272a',
    accent: '#059669',
    accentHover: '#047857',
    accentBright: '#10b981',
    textPrimary: '#f4f4f5',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',
    textFaint: '#52525b',
    warning: '#f59e0b',
    danger: '#ef4444',
};

export const panelCardSx = {
    backgroundColor: mpnColors.surface,
    border: `1px solid ${mpnColors.border}`,
};

/** Libellé de section (titre en petites capitales gris). */
export const mpnSectionLabelSx = {
    fontSize: '0.7rem',
    color: mpnColors.textMuted,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    mb: 1,
};

export const machineSlotCellSx = {
    borderRadius: 1.5,
    border: '1px solid #2f2f35',
    backgroundColor: '#111111',
    color: '#e4e4e7',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.72rem',
    fontWeight: 600,
};

export const machineLaneSx = {
    borderRadius: 3,
    border: '1px solid #2a2a31',
    background: 'linear-gradient(180deg, #0f1115 0%, #141821 100%)',
    px: 1,
    py: 1.1,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
};

export const machineFrameSx = {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 4,
    border: '1px solid #2a2a31',
    background: 'radial-gradient(circle at top, rgba(16,185,129,0.08), transparent 32%), linear-gradient(180deg, #121418 0%, #0d0f13 100%)',
    p: { xs: 1.5, md: 2 },
};

export const machineCommonAssignmentPalette = {
    borderColor: '#34d399',
    slotBackground: 'linear-gradient(180deg, #16241e 0%, #101813 100%)',
    labelColor: '#bbf7d0',
    chipBackground: 'rgba(52,211,153,0.12)',
    chipBorder: 'rgba(52,211,153,0.24)',
    chipColor: '#86efac',
    rowBackground: 'rgba(52,211,153,0.06)',
    rowHoverBackground: 'rgba(52,211,153,0.1)',
    rowBorder: 'rgba(52,211,153,0.14)',
    accentGlow: 'rgba(52,211,153,0.14)',
};

export const machineDefaultAssignmentPalette = {
    borderColor: '#38bdf8',
    slotBackground: 'linear-gradient(180deg, #10253a 0%, #0f1720 100%)',
    labelColor: '#bfdbfe',
    chipBackground: 'rgba(148,163,184,0.12)',
    chipBorder: 'rgba(148,163,184,0.22)',
    chipColor: '#cbd5e1',
    rowBackground: 'transparent',
    rowHoverBackground: 'rgba(148,163,184,0.06)',
    rowBorder: 'rgba(39,39,42,1)',
    accentGlow: 'rgba(56,189,248,0.12)',
};

export const tabLabelByKey = {
    machines: 'Machines',
    feeders: 'Feeders',
    carts: 'Chariots',
};

export const cartKindOptions = [
    { value: 'COMMON', label: 'Composants recurrents' },
    { value: 'CATEGORY', label: 'Categorie de cartes' },
    { value: 'CUSTOM', label: 'Chariot manuel' },
];

export const COMMON_FIXED_FEEDERS_CATEGORY_VALUE = '__COMMON_FIXED_FEEDERS__';

/** Nombre maximal de positions autorisé pour une machine PnP (#21) */
export const MAX_MACHINE_POSITIONS = 200;

/** Nombre maximal de positions pour un chariot */
export const MAX_CART_POSITIONS = 500;

export function isCommonMachineAssignment(assignment) {
    if (!assignment) {
        return false;
    }

    return Number(assignment.bom_presence_count || 0) > 1 || assignment.fixed_cart_kind === 'COMMON';
}

export function getMachineAssignmentPalette(assignment) {
    return isCommonMachineAssignment(assignment)
        ? machineCommonAssignmentPalette
        : machineDefaultAssignmentPalette;
}

export function getMachineAssignmentTypeLabel(assignment) {
    if (!assignment) {
        return '--';
    }

    return assignment.placement_group === 'FIXED'
        ? `Fixe${assignment.fixed_cart_name ? ` · ${assignment.fixed_cart_name}` : ''}`
        : 'Dynamique';
}

export function readAssignmentRevisionMetric(metricMap, bomRevisionId, fallback = 0) {
    if (!metricMap || !bomRevisionId) {
        return fallback;
    }

    const directValue = metricMap[bomRevisionId];
    if (Number.isFinite(Number(directValue))) {
        return Number(directValue);
    }

    const stringValue = metricMap[String(bomRevisionId)];
    if (Number.isFinite(Number(stringValue))) {
        return Number(stringValue);
    }

    return fallback;
}

export function getMachineAssignmentDisplayQuantities(assignment, selectedBomRevision = null, selectedBomBuildQuantity = null) {
    if (!assignment) {
        return {
            totalQuantity: 0,
            perBoardQuantity: 0,
            totalColumnLabel: 'Qte totale prod.',
            perBoardColumnLabel: 'Qte / carte',
            totalHelperLabel: 'sur production',
            perBoardHelperLabel: 'moyenne / carte',
            totalChipLabel: 'Prod.',
            perBoardChipLabel: '/ carte',
        };
    }

    if (!selectedBomRevision?.bom_revision_id) {
        return {
            totalQuantity: Number(assignment.total_board_quantity || 0),
            perBoardQuantity: Number(assignment.average_board_quantity || 0),
            totalColumnLabel: 'Qte totale prod.',
            perBoardColumnLabel: 'Qte / carte',
            totalHelperLabel: 'sur production',
            perBoardHelperLabel: 'moyenne / carte',
            totalChipLabel: 'Prod.',
            perBoardChipLabel: '/ carte',
        };
    }

    const targetRevisionId = selectedBomRevision.bom_revision_id;
    const hasRevisionScopedQuantities = Boolean(
        assignment.total_board_quantity_by_revision
        && Object.keys(assignment.total_board_quantity_by_revision).length,
    );
    if (!hasRevisionScopedQuantities) {
        return {
            totalQuantity: Number(assignment.total_board_quantity || 0),
            perBoardQuantity: Number(assignment.average_board_quantity || 0),
            totalColumnLabel: 'Qte totale prod.',
            perBoardColumnLabel: 'Qte / carte',
            totalHelperLabel: 'sur production',
            perBoardHelperLabel: 'moyenne / carte',
            totalChipLabel: 'Prod.',
            perBoardChipLabel: '/ carte',
        };
    }

    const perBoardQuantity = readAssignmentRevisionMetric(assignment.board_quantity_by_revision, targetRevisionId, 0);
    const plannedTotalQuantity = readAssignmentRevisionMetric(assignment.total_board_quantity_by_revision, targetRevisionId, 0);
    const parsedSelectedBomBuildQuantity = Number(selectedBomBuildQuantity || 0);
    const totalQuantity = Number.isFinite(parsedSelectedBomBuildQuantity) && parsedSelectedBomBuildQuantity > 0
        ? perBoardQuantity * parsedSelectedBomBuildQuantity
        : plannedTotalQuantity;

    return {
        totalQuantity,
        perBoardQuantity,
        totalColumnLabel: 'Qte totale BOM',
        perBoardColumnLabel: 'Qte / carte BOM',
        totalHelperLabel: 'pour cette BOM',
        perBoardHelperLabel: 'sur 1 carte',
        totalChipLabel: 'BOM',
        perBoardChipLabel: '/ carte BOM',
    };
}

export function createMachineFormState() {
    return {
        name: '',
        num_positions: '80',
        description: '',
        notes: '',
    };
}

export function createFeederFormState() {
    return {
        size_mm: '8',
        capacity: '',
        description: '',
        notes: '',
    };
}

export function createCartFormState() {
    return {
        name: '',
        kind: 'CUSTOM',
        target_category: '',
        capacity_positions: '80',
        description: '',
        notes: '',
    };
}

export function createCartEditFormState() {
    return {
        name: '',
        capacity_positions: '',
        description: '',
        notes: '',
    };
}

export function createFixedFeederFormState() {
    return {
        component_id: '',
        fixed_cart_id: '',
        feeder_id: '',
    };
}

export function formatDate(value) {
    if (!value) {
        return '--';
    }

    try {
        return new Date(value).toLocaleString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return value;
    }
}

export function parsePositiveInteger(value) {
    const normalized = String(value ?? '').trim();
    if (!normalized || !/^\d+$/.test(normalized)) {
        return null;
    }

    const parsed = Number(normalized);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function extractRequestError(requestError, fallbackMessage) {
    return requestError.response?.data?.detail || requestError.message || fallbackMessage;
}

export function formatDecimal(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return '--';
    }

    return new Intl.NumberFormat('fr-FR', {
        minimumFractionDigits: numericValue % 1 === 0 ? 0 : 1,
        maximumFractionDigits: 2,
    }).format(numericValue);
}

export function getComponentPrimaryLabel(component) {
    if (!component) {
        return 'Composant sans libelle';
    }

    return component.component_label || component.description || component.mpn || component.value || component.reference || 'Composant sans libelle';
}

export function getComponentSecondaryLabel(component) {
    if (!component?.reference) {
        return null;
    }

    return component.reference !== getComponentPrimaryLabel(component) ? component.reference : null;
}

export function buildFixedFeederFeedbackMessage(summary) {
    if (!summary) {
        return 'Calcul des feeders fixes termine.';
    }

    const detailParts = [];
    if (Number(summary.cleared_count || 0) > 0) {
        detailParts.push(`${summary.cleared_count} retire(s)`);
    }
    if (Number(summary.skipped_no_cart_count || 0) > 0) {
        detailParts.push(`${summary.skipped_no_cart_count} sans chariot`);
    }
    if (Number(summary.skipped_capacity_count || 0) > 0) {
        detailParts.push(`${summary.skipped_capacity_count} hors capacite`);
    }
    if (Number(summary.unmatched_bom_items || 0) > 0) {
        detailParts.push(`${summary.unmatched_bom_items} ligne(s) BOM non mappee(s)`);
    }

    return detailParts.length
        ? `${summary.message || 'Calcul des feeders fixes termine.'} ${detailParts.join(' | ')}.`
        : (summary.message || 'Calcul des feeders fixes termine.');
}

export function buildMachineTopView(numPositions) {
    const totalPositions = Math.max(0, Number(numPositions) || 0);
    const frontCount = Math.ceil(totalPositions / 2);
    const frontSlots = Array.from({ length: frontCount }, (_value, index) => index + 1);
    const backSlots = Array.from({ length: totalPositions - frontCount }, (_value, index) => frontCount + index + 1);

    return { frontSlots, backSlots };
}

export function getMachineSlotLayout(slotCount) {
    if (slotCount >= 45) {
        return {
            gap: 0.2,
            height: 18,
            fontSize: '0.43rem',
            borderRadius: 0.85,
        };
    }

    if (slotCount >= 36) {
        return {
            gap: 0.28,
            height: 20,
            fontSize: '0.5rem',
            borderRadius: 1,
        };
    }

    if (slotCount >= 28) {
        return {
            gap: 0.36,
            height: 23,
            fontSize: '0.58rem',
            borderRadius: 1.1,
        };
    }

    if (slotCount >= 20) {
        return {
            gap: 0.5,
            height: 26,
            fontSize: '0.64rem',
            borderRadius: 1.2,
        };
    }

    return {
        gap: 0.65,
        height: 30,
        fontSize: '0.72rem',
        borderRadius: 1.4,
    };
}

/**
 * Palette des slots par TAILLE de feeder (8 / 12 / 16 mm), palette sombre émeraude/zinc.
 * Choisie pour la vue machine (slot-strip) : la couleur encode la taille de feeder,
 * le détail composant/type passe par le survol + la table d'affectation.
 */
export const feederSizePalette = {
    8: { borderColor: '#2dd4bf', slotBackground: 'rgba(45,212,191,0.16)', labelColor: '#99f6e4' },
    12: { borderColor: '#38bdf8', slotBackground: 'rgba(56,189,248,0.16)', labelColor: '#bae6fd' },
    16: { borderColor: '#f59e0b', slotBackground: 'rgba(245,158,11,0.16)', labelColor: '#fde68a' },
};

/** Feeder de taille non standard / inconnue. */
export const feederSizeUnknownPalette = {
    borderColor: '#a78bfa', slotBackground: 'rgba(167,139,250,0.16)', labelColor: '#ddd6fe',
};

/** Slot libre (aucune affectation). */
export const slotEmptyPalette = {
    borderColor: '#2f2f35', slotBackground: 'transparent', labelColor: '#52525b',
};

/** Tailles de feeder présentées dans la légende de la vue machine. */
export const FEEDER_SIZE_LEGEND = [8, 12, 16];

export function getFeederSizePalette(sizeMm) {
    const key = Number(sizeMm);
    return feederSizePalette[key] || feederSizeUnknownPalette;
}
