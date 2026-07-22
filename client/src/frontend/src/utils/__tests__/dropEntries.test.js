import { walkDropEntries } from '../dropEntries';

function fileEntry(name) {
    return { isFile: true, isDirectory: false, name, file: (cb) => cb({ name }) };
}

function dirEntry(name, children) {
    let served = false;
    return {
        isFile: false,
        isDirectory: true,
        name,
        createReader: () => ({
            // `readEntries` renvoie par lots : ici tout d'un coup, puis liste vide.
            readEntries: (cb) => {
                if (served) { cb([]); return; }
                served = true;
                cb(children);
            },
        }),
    };
}

describe('walkDropEntries', () => {
    it('parcourt récursivement et reconstruit les chemins', async () => {
        const root = dirEntry('KT1 - X', [
            dirEntry('Rev.A', [
                dirEntry('Conception', [fileEntry('a.brd'), fileEntry('a.sch')]),
            ]),
        ]);
        const items = [{ webkitGetAsEntry: () => root }];
        const out = await walkDropEntries(items);
        expect(out.map((e) => e.path).sort()).toEqual([
            'KT1 - X/Rev.A/Conception/a.brd',
            'KT1 - X/Rev.A/Conception/a.sch',
        ]);
    });

    it('ignore les items sans entry', async () => {
        const out = await walkDropEntries([{ webkitGetAsEntry: () => null }]);
        expect(out).toEqual([]);
    });
});
