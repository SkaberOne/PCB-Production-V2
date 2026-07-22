import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CaoFolderImport, { detectCao, extensionOf } from '../CaoFolderImport';
import { suppressActDeprecatedWarning } from '../../../testActWarnings';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

const mockPost = jest.fn();
jest.mock('../../../api/client', () => ({ __esModule: true, default: { post: (...args) => mockPost(...args) } }));

const mockSessionValue = {
    setSelectedBomEntries: jest.fn(),
    setImportedBom: jest.fn(),
    activeProduction: null,
    setActiveProduction: jest.fn(),
};
jest.mock('../../../context/BomSessionContext', () => ({ useBomSession: () => mockSessionValue }));

function makeFile(name) {
    return new File(['x'], name, { type: 'application/octet-stream' });
}

function selectFiles(names) {
    const input = screen.getByTestId('cao-folder-input');
    fireEvent.change(input, { target: { files: names.map(makeFile) } });
}

describe('detectCao / extensionOf', () => {
    it('reads composite KiCad extensions first', () => {
        expect(extensionOf('board.kicad_pcb')).toBe('.kicad_pcb');
        expect(extensionOf('OTR.brd')).toBe('.brd');
    });

    it('detects Eagle (supported) and pairs board + schematic', () => {
        const detected = detectCao([makeFile('OTR.brd'), makeFile('OTR.sch'), makeFile('notes.txt')]);
        expect(detected.kind).toBe('eagle');
        expect(detected.supported).toBe(true);
        expect(detected.caoFiles).toHaveLength(2);
    });

    it('recognizes KiCad but reports it unsupported', () => {
        const detected = detectCao([makeFile('b.kicad_pcb'), makeFile('b.kicad_sch')]);
        expect(detected.kind).toBe('kicad');
        expect(detected.supported).toBe(false);
    });

    it('returns null when no CAO file is present', () => {
        expect(detectCao([makeFile('readme.md')])).toBeNull();
    });
});

describe('<CaoFolderImport />', () => {
    let restoreConsoleError;

    beforeEach(() => {
        jest.clearAllMocks();
        restoreConsoleError = suppressActDeprecatedWarning();
    });

    afterEach(() => {
        restoreConsoleError?.();
    });

    it('shows an error when the selected folder has no CAO file', () => {
        render(<CaoFolderImport />);
        selectFiles(['readme.md', 'bom.xlsx']);
        expect(screen.getByText(/Aucun fichier CAO reconnu/i)).toBeInTheDocument();
    });

    it('detects Eagle, infers the reference and enables import', () => {
        render(<CaoFolderImport />);
        selectFiles(['OTR.brd', 'OTR.sch']);
        expect(screen.getByText('Type : eagle')).toBeInTheDocument();
        expect(screen.getByTestId('cao-reference')).toHaveValue('OTR');
        expect(screen.getByTestId('cao-import')).not.toBeDisabled();
    });

    it('reports KiCad as “à venir” and keeps import disabled', () => {
        render(<CaoFolderImport />);
        selectFiles(['board.kicad_pcb', 'board.kicad_sch']);
        expect(screen.getByText(/à venir/i)).toBeInTheDocument();
        expect(screen.getByTestId('cao-import')).toBeDisabled();
    });

    it('imports the folder and switches to the populated review', async () => {
        mockPost.mockResolvedValueOnce({
            data: {
                success: true,
                message: 'Import CAO eagle : 5 composant(s) sur 2 face(s) (TOP, BOT).',
                revisions: [
                    { bom_revision_id: 1, reference: 'OTR', revision: 'REV_A', side: 'TOP', item_count: 2 },
                    { bom_revision_id: 2, reference: 'OTR', revision: 'REV_A', side: 'BOT', item_count: 3 },
                ],
            },
        });

        render(<CaoFolderImport />);
        selectFiles(['OTR.brd', 'OTR.sch']);
        fireEvent.click(screen.getByTestId('cao-import'));

        await waitFor(() => expect(screen.getByTestId('cao-open-review')).toBeInTheDocument());
        expect(mockPost).toHaveBeenCalledWith(
            '/bom/import-cao',
            expect.any(FormData),
            expect.objectContaining({ params: expect.objectContaining({ reference: 'OTR', revision: 'REV_A' }) }),
        );

        fireEvent.click(screen.getByTestId('cao-open-review'));
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/bom'));
        expect(mockSessionValue.setSelectedBomEntries).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ bom_revision_id: 1 })]),
        );
    });
});
