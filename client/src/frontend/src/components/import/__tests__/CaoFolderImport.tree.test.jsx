import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CaoFolderImport from '../CaoFolderImport';
import { suppressActDeprecatedWarning } from '../../../testActWarnings';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('../../../api/client', () => ({ __esModule: true, default: { get: (...a) => mockGet(...a), post: (...a) => mockPost(...a) } }));

const mockSessionValue = { setSelectedBomEntries: jest.fn(), setImportedBom: jest.fn(), activeProduction: null, setActiveProduction: jest.fn() };
jest.mock('../../../context/BomSessionContext', () => ({ useBomSession: () => mockSessionValue }));

function treeFile(path) {
    const f = new File(['x'], path.split('/').pop(), { type: 'application/octet-stream' });
    Object.defineProperty(f, 'webkitRelativePath', { value: path });
    return f;
}
function selectTree(paths) {
    fireEvent.change(screen.getByTestId('cao-folder-input'), { target: { files: paths.map(treeFile) } });
}

describe('<CaoFolderImport /> — dossier carte (012)', () => {
    let restore;
    beforeEach(() => { jest.clearAllMocks(); restore = suppressActDeprecatedWarning(); });
    afterEach(() => restore?.());

    it('extrait la référence et liste les révisions depuis l\'arborescence', () => {
        render(<CaoFolderImport />);
        selectTree([
            'KT190562 - NanoSH MK2/Rev.A/Conception/a.brd',
            'KT190562 - NanoSH MK2/Rev.A/Conception/a.sch',
        ]);
        expect(screen.getByTestId('cao-tree-summary')).toHaveTextContent('KT190562');
        expect(screen.getByTestId('cao-import-tree')).toBeInTheDocument();
    });

    it('importe les révisions absentes et ignore celles déjà en base', async () => {
        mockGet.mockResolvedValueOnce({ data: { items: [{ reference: 'KT1', revision: 'A', side: 'TOP' }] } });
        mockPost.mockResolvedValueOnce({ data: { success: true, message: 'ok', revisions: [{ bom_revision_id: 9, side: 'TOP', item_count: 3 }] } });

        render(<CaoFolderImport />);
        selectTree([
            'KT1 - X/Rev.A/Conception/a.brd', 'KT1 - X/Rev.A/Conception/a.sch', // déjà en base -> ignorée
            'KT1 - X/Rev.B/Conception/b.brd', 'KT1 - X/Rev.B/Conception/b.sch', // absente -> importée
        ]);
        fireEvent.click(screen.getByTestId('cao-import-tree'));

        await waitFor(() => expect(screen.getByTestId('cao-report')).toBeInTheDocument());
        expect(mockPost).toHaveBeenCalledTimes(1);
        expect(mockPost).toHaveBeenCalledWith(
            '/bom/import-cao',
            expect.any(FormData),
            expect.objectContaining({ params: expect.objectContaining({ reference: 'KT1', revision: 'B' }) }),
        );
        expect(screen.getByText(/1 importée/)).toBeInTheDocument();
        expect(screen.getByText(/1 déjà en base/)).toBeInTheDocument();
    });

    it('bouton fallback : dossier simple non conforme → mode détection 006', () => {
        render(<CaoFolderImport />);
        // Fichiers plats sans structure KT.../Rev.X -> fallback single.
        fireEvent.change(screen.getByTestId('cao-folder-input'), {
            target: { files: [treeFile('OTR.brd'), treeFile('OTR.sch')] },
        });
        expect(screen.getByTestId('cao-reference')).toHaveValue('OTR');
        expect(screen.getByTestId('cao-import')).toBeInTheDocument();
    });
});
