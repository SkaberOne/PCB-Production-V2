/**
 * Recherche texte insensible a la casse ET aux accents (prompt 020).
 * Normalise via NFD + suppression des diacritiques, minuscules, trim.
 */
export function normalizeText(value) {
    if (value == null) return '';
    return String(value)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
}

/**
 * Vrai si `query` (normalisee) est contenue dans au moins un des `fields`.
 * Une requete vide matche toujours.
 */
export function matchesQuery(query, fields) {
    const q = normalizeText(query);
    if (!q) return true;
    return (fields || []).some((f) => normalizeText(f).includes(q));
}
