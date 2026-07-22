// Extraction de la structure d'un dossier carte (prompt 012) :
//   KT<référence> - <nom carte>/ Rev.<X>/ Conception/ <fichiers CAO>
// Réutilise la même convention que l'import masse serveur (011). Pur & testable :
// prend une liste de { file, path } (path = chemin relatif au dossier déposé /
// sélectionné) et en déduit référence, nom et révisions.

import { detectCao, isCaoFile } from './caoDetect';

const CARD_FOLDER_RE = /^(KT\d+[A-Za-z]?)\s*-\s*(.+)$/;
const REV_SEGMENT_RE = /^Rev\.?\s*([A-Za-z0-9]+)$/i;

/** « KT190562 - NanoSH MK2 » → { reference:'KT190562', name:'NanoSH MK2' } ; null sinon. */
export function parseCardFolderName(folderName) {
    const match = CARD_FOLDER_RE.exec(String(folderName || '').trim());
    if (!match) return null;
    return { reference: match[1], name: match[2].trim() };
}

function normalizeEntry(entry) {
    const file = entry && entry.file ? entry.file : entry;
    const rawPath = (entry && entry.path)
        || (file && file.webkitRelativePath)
        || (file && file.name)
        || '';
    return { file, path: String(rawPath).replace(/\\/g, '/').replace(/^\/+/, '') };
}

/**
 * Analyse une arborescence de dossier carte.
 * @param {Array<{file:File, path:string}>|FileList} entries
 * @returns {{ conform:boolean, reference:string, name:string,
 *             revisions: Array<{revision:string, caoFiles:File[], kind:string|null, supported:boolean, detection:object|null}> }}
 */
export function parseCardTree(entries) {
    const list = Array.from(entries || []).map(normalizeEntry).filter((e) => e.path);
    if (!list.length) {
        return { conform: false, reference: '', name: '', revisions: [] };
    }

    const topFolder = list[0].path.split('/')[0];
    const card = parseCardFolderName(topFolder);

    // Regroupe les fichiers par révision (segment « Rev.X » où qu'il soit dans le chemin).
    const byRevision = new Map();
    for (const entry of list) {
        const segments = entry.path.split('/');
        const revSegment = segments.find((seg) => REV_SEGMENT_RE.test(seg));
        if (!revSegment) continue;
        const revision = REV_SEGMENT_RE.exec(revSegment)[1].toUpperCase();
        if (!byRevision.has(revision)) byRevision.set(revision, []);
        byRevision.get(revision).push(entry);
    }

    const revisions = [];
    for (const [revision, revEntries] of byRevision) {
        // Préférer les fichiers sous « Conception/ » ; sinon tout le sous-arbre de la révision.
        const conception = revEntries.filter((e) => /(^|\/)conception(\/|$)/i.test(e.path));
        const pool = conception.length ? conception : revEntries;
        const caoFiles = pool.map((e) => e.file).filter((f) => f && isCaoFile(f.name));
        const detection = detectCao(caoFiles);
        revisions.push({
            revision,
            caoFiles,
            kind: detection ? detection.kind : null,
            supported: Boolean(detection && detection.supported),
            detection,
        });
    }
    revisions.sort((a, b) => a.revision.localeCompare(b.revision));

    return {
        conform: Boolean(card) && revisions.length > 0,
        reference: card ? card.reference : '',
        name: card ? card.name : '',
        revisions,
    };
}
