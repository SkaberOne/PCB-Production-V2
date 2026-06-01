/**
 * Déclenche le download d'un CSV côté navigateur.
 *
 * Préfixe le contenu d'un BOM UTF-8 (`﻿`) pour qu'Excel ouvre le fichier
 * en interprétant correctement les caractères accentués.
 *
 * @param {string} fileName  Nom du fichier proposé au navigateur.
 * @param {string} content   Contenu CSV brut (texte).
 */
export function downloadCsvFile(fileName, content) {
    const bom = '﻿'; // UTF-8 BOM pour compatibilité Excel
    const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}
