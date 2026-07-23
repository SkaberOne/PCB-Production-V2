// Normalisation d'AFFICHAGE des révisions de cartes (prompt 018).
//
// Les révisions sont stockées sous des formes hétérogènes selon la source
// d'import : « REV_A » (import CAO/txt, défaut backend), « A » / « F » (import
// catalogue 011, dérivé de « Rev.X »), saisie manuelle, ou vide. Ces helpers
// harmonisent uniquement le RENDU — la valeur stockée n'est jamais modifiée
// (le matching (référence, révision) et l'idempotence de l'import 011 sont
// préservés).

/**
 * Extrait le code de révision canonique en majuscules, sans préfixe « Rev ».
 * Ex. : « REV_A » → « A », « Rev.A » → « A », « rev a » → « A », « F » → « F ».
 * Vide / « — » → chaîne vide.
 * @param {*} raw valeur stockée
 * @returns {string} code normalisé (ex. « A ») ou '' si aucune révision
 */
export function normalizeRevisionCode(raw) {
    if (raw == null) return '';
    const s = String(raw).trim();
    if (!s || s === '—' || s === '-') return '';
    // Retire un préfixe « REV » suivi d'un séparateur (_ . espace -) : « REV_A » → « A ».
    // Exige le séparateur pour ne pas amputer une révision légitime commençant par « R ».
    const stripped = s.replace(/^rev[._\s-]+/i, '').trim();
    return (stripped || s).toUpperCase();
}

/**
 * Libellé d'affichage homogène d'une révision.
 * Ex. : « REV_A » → « Rev. A », vide → « Sans révision ».
 * @param {*} raw valeur stockée
 * @returns {string}
 */
export function formatRevisionLabel(raw) {
    const code = normalizeRevisionCode(raw);
    return code ? `Rev. ${code}` : 'Sans révision';
}
