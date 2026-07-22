// Détection CAO côté client (miroir de serveur/src/services/cao/detect).
// Extrait en util partagé (prompt 012) pour être réutilisé par CaoFolderImport
// et l'analyse d'arborescence (cardTree), sans dépendance circulaire.

/** Extension d'un nom de fichier (extensions composées KiCad prioritaires). */
export function extensionOf(name) {
    const lower = String(name || '').toLowerCase();
    if (lower.endsWith('.kicad_pcb')) return '.kicad_pcb';
    if (lower.endsWith('.kicad_sch')) return '.kicad_sch';
    const dot = lower.lastIndexOf('.');
    return dot >= 0 ? lower.slice(dot) : '';
}

const CAO_EXTENSIONS = ['.brd', '.sch', '.kicad_pcb', '.kicad_sch'];

/** Vrai si le fichier est un fichier CAO reconnu (Eagle ou KiCad). */
export function isCaoFile(name) {
    return CAO_EXTENSIONS.includes(extensionOf(name));
}

/** Détection Eagle (prioritaire) / KiCad (reporté) sur un lot de fichiers. */
export function detectCao(fileList) {
    const tagged = Array.from(fileList || []).map((file) => ({ file, ext: extensionOf(file.name) }));
    const pick = (ext) => tagged.find((entry) => entry.ext === ext) || null;

    const eagleBoard = pick('.brd');
    const eagleSch = pick('.sch');
    if (eagleBoard) {
        return {
            kind: 'eagle',
            supported: true,
            board: eagleBoard,
            schematic: eagleSch,
            message: eagleSch ? null : 'Schéma .sch absent : les MPN ne seront pas enrichis.',
            caoFiles: [eagleBoard, eagleSch].filter(Boolean),
        };
    }

    const kicadBoard = pick('.kicad_pcb');
    const kicadSch = pick('.kicad_sch');
    if (kicadBoard) {
        return {
            kind: 'kicad',
            supported: false,
            board: kicadBoard,
            schematic: kicadSch,
            message: 'Support KiCad à venir (parseur non implémenté).',
            caoFiles: [kicadBoard, kicadSch].filter(Boolean),
        };
    }
    return null;
}
