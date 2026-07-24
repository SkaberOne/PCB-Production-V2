/**
 * Libellé d'affichage unifié d'une carte (prompt 029) : « RÉFÉRENCE — Nom ».
 *
 * Réutilisé partout où une carte est listée/choisie (import BOM « BOM
 * enregistrées », sélecteur de carte des commandes client/machine, BomPickerDialog).
 * Carte sans nom (legacy) → référence seule, jamais de « — » orphelin.
 *
 * @param {string} reference - référence catalogue (ex. « AMPLI_GEN6 »)
 * @param {string} [name] - nom lisible de la carte (optionnel)
 * @returns {string} « RÉFÉRENCE — Nom » si un nom non vide, sinon « RÉFÉRENCE »
 */
export function formatCardLabel(reference, name) {
    const ref = (reference == null ? '' : String(reference)).trim();
    const label = (name == null ? '' : String(name)).trim();
    if (ref && label) return `${ref} — ${label}`;
    return ref || label;
}

export default formatCardLabel;
