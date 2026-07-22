// Lecture récursive d'un dossier déposé (drag-and-drop) via l'API File System
// Entries (prompt 012). Reconstruit le chemin relatif de chaque fichier — les
// fichiers déposés n'ont pas de `webkitRelativePath`.

function readAllEntries(reader) {
    return new Promise((resolve, reject) => {
        const all = [];
        const readBatch = () => {
            reader.readEntries((batch) => {
                // `readEntries` renvoie par lots : ré-appeler jusqu'à liste vide.
                if (!batch || !batch.length) {
                    resolve(all);
                    return;
                }
                all.push(...batch);
                readBatch();
            }, reject);
        };
        readBatch();
    });
}

function entryToFile(fileEntry) {
    return new Promise((resolve, reject) => fileEntry.file(resolve, reject));
}

async function walkEntry(entry, prefix, out) {
    if (!entry) return;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
        const file = await entryToFile(entry);
        out.push({ file, path });
    } else if (entry.isDirectory) {
        const children = await readAllEntries(entry.createReader());
        for (const child of children) {
            // eslint-disable-next-line no-await-in-loop
            await walkEntry(child, path, out);
        }
    }
}

/**
 * Parcourt les items d'un `DataTransfer` (drop) et renvoie tous les fichiers
 * avec leur chemin relatif.
 * @param {DataTransferItemList|Array} items
 * @returns {Promise<Array<{file:File, path:string}>>}
 */
export async function walkDropEntries(items) {
    const roots = [];
    for (const item of Array.from(items || [])) {
        const entry = item && item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry) roots.push(entry);
    }
    const out = [];
    for (const root of roots) {
        // eslint-disable-next-line no-await-in-loop
        await walkEntry(root, '', out);
    }
    return out;
}
