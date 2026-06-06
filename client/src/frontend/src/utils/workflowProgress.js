import { getBomItemStatus, BOM_ITEM_STATUSES } from './bomSession';
import { buildAggregatedComponents } from './bomPlanning';

function clamp01(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
}

function getReviewableRevisions(bomWorkspace, currentBom) {
    const revisions = Object.values(bomWorkspace?.revisionsById || {})
        .filter((revision) => revision?.items?.length);

    if (revisions.length > 0) {
        return revisions;
    }

    if (currentBom?.items?.length) {
        return [currentBom];
    }

    return [];
}

/**
 * Progression réelle du workflow (0..1 par étape), dérivée de l'état de session.
 *
 * Index alignés sur les pages workflow (step 1..5) :
 *   0 Productions   — production active sélectionnée
 *   1 Import BOM    — fraction des révisions sélectionnées chargées
 *   2 Revue BOM     — 1 si stock validé, sinon 0.9 × fraction d'items sans
 *                     statut « À vérifier » / « Erreur » (jamais plein sans validation)
 *   3 Commande      — fraction de composants agrégés couverts (OK stock / pose
 *                     manuelle). Approximation côté client : l'état des commandes
 *                     passées n'est pas dans la session.
 *   4 Machine PnP   — pas d'état client (plans côté API) → 0, la bulle active
 *                     suffit visuellement.
 */
export function computeWorkflowProgress({ activeProduction, currentBom, bomWorkspace } = {}) {
    const workspace = bomWorkspace || {};
    const entries = Array.isArray(workspace.selectedRevisionEntries)
        ? workspace.selectedRevisionEntries
        : [];

    // ── 1. Productions ──
    const productionProgress = activeProduction?.id ? 1 : 0;

    // ── 2. Import BOM ──
    let importProgress = 0;
    if (entries.length > 0) {
        const loadedCount = entries.filter(
            (entry) => workspace.revisionsById?.[entry.bom_revision_id]?.loaded,
        ).length;
        importProgress = clamp01(loadedCount / entries.length);
    } else if (currentBom?.items?.length) {
        importProgress = 1;
    }

    // ── 3. Revue BOM ──
    let reviewProgress = 0;
    if (workspace.stockValidation?.isValidated) {
        reviewProgress = 1;
    } else {
        const revisions = getReviewableRevisions(workspace, currentBom);
        let totalItems = 0;
        let cleanItems = 0;

        revisions.forEach((revision) => {
            const warnings = revision.warnings || [];
            const errors = revision.errors || [];
            (revision.items || []).forEach((item) => {
                totalItems += 1;
                const status = getBomItemStatus(item, warnings, errors);
                if (status !== BOM_ITEM_STATUSES.REVIEW && status !== BOM_ITEM_STATUSES.ERROR) {
                    cleanItems += 1;
                }
            });
        });

        if (totalItems > 0) {
            reviewProgress = 0.9 * clamp01(cleanItems / totalItems);
        }
    }

    // ── 4. Commande ──
    let commandProgress = 0;
    if (Object.keys(workspace.revisionsById || {}).length > 0) {
        const lines = buildAggregatedComponents(
            workspace.revisionsById,
            workspace.quantitiesByReference || {},
            workspace.stockDraftByComponentKey || {},
        );
        if (lines.length > 0) {
            const coveredCount = lines.filter(
                (line) => line.status === 'OK stock' || line.status === 'Pose manuelle',
            ).length;
            commandProgress = clamp01(coveredCount / lines.length);
        }
    }

    return [productionProgress, importProgress, reviewProgress, commandProgress, 0];
}
