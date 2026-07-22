import { parseCardTree, parseCardFolderName } from '../cardTree';

function entry(path) {
    return { file: { name: path.split('/').pop() }, path };
}

describe('parseCardFolderName', () => {
    it('extrait référence + nom', () => {
        expect(parseCardFolderName('KT190562 - NanoSH MK2')).toEqual({ reference: 'KT190562', name: 'NanoSH MK2' });
        expect(parseCardFolderName('KT190406A - Autre carte')).toEqual({ reference: 'KT190406A', name: 'Autre carte' });
    });
    it('renvoie null hors convention', () => {
        expect(parseCardFolderName('dossier random')).toBeNull();
        expect(parseCardFolderName('')).toBeNull();
    });
});

describe('parseCardTree', () => {
    it('extrait réf/nom + révision Eagle depuis Rev.X/Conception', () => {
        const tree = parseCardTree([
            entry('KT190562 - NanoSH MK2/Rev.A/Conception/board.brd'),
            entry('KT190562 - NanoSH MK2/Rev.A/Conception/sch.sch'),
            entry('KT190562 - NanoSH MK2/Rev.A/Production/notes.txt'),
        ]);
        expect(tree.conform).toBe(true);
        expect(tree.reference).toBe('KT190562');
        expect(tree.name).toBe('NanoSH MK2');
        expect(tree.revisions).toHaveLength(1);
        expect(tree.revisions[0].revision).toBe('A');
        expect(tree.revisions[0].kind).toBe('eagle');
        expect(tree.revisions[0].caoFiles).toHaveLength(2);
    });

    it('gère plusieurs révisions et détecte KiCad', () => {
        const tree = parseCardTree([
            entry('KT1 - X/Rev.A/Conception/a.brd'),
            entry('KT1 - X/Rev.A/Conception/a.sch'),
            entry('KT1 - X/Rev.B/Conception/b.kicad_pcb'),
        ]);
        expect(tree.revisions.map((r) => r.revision)).toEqual(['A', 'B']);
        expect(tree.revisions[0].kind).toBe('eagle');
        expect(tree.revisions[1].kind).toBe('kicad');
        expect(tree.revisions[1].supported).toBe(false);
    });

    it('dossier non conforme → conform=false (fallback)', () => {
        expect(parseCardTree([entry('dossier/board.brd')]).conform).toBe(false);
        expect(parseCardTree([]).conform).toBe(false);
    });
});
