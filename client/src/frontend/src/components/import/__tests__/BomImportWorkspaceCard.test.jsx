import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import BomImportWorkspaceCard from '../BomImportWorkspaceCard';
import { suppressActDeprecatedWarning } from '../../../testActWarnings';

function buildProps() {
    return {
        dragActive: false,
        handleDrag: jest.fn(),
        handleDrop: jest.fn(),
        handleFileChange: jest.fn(),
        uploadSummaryLabel: '2 fichiers selectionnes',
        uploadSummaryMeta: 'imported.txt | draft.txt',
        hasFiles: true,
        isBatchMode: true,
        sessionRows: [],
        paginatedSessionRows: [],
        sessionPage: 0,
        sessionRowsPerPage: 25,
        setSessionPage: jest.fn(),
        setSessionRowsPerPage: jest.fn(),
        result: null,
        rowActionState: { action: '', key: null },
        handleBatchResultFieldChange: jest.fn(),
        handleDraftFieldChange: jest.fn(),
        selectBatchResult: jest.fn(),
        handlePersistBatchMetadata: jest.fn(),
        handleDeleteImportedBom: jest.fn(),
        handleDraftRowRemove: jest.fn(),
        hasWorkspaceContent: true,
        handleClear: jest.fn(),
        handleUpload: jest.fn(),
        loading: false,
        showVisualizationAction: false,
        handleOpenVisualization: jest.fn(),
        reviewNavigationLoading: false,
    };
}

describe('BomImportWorkspaceCard', () => {
    let restoreConsoleError;

    beforeEach(() => {
        restoreConsoleError = suppressActDeprecatedWarning();
    });

    afterEach(() => {
        restoreConsoleError?.();
    });

    it('keeps imported BOM sides read-only while draft rows stay editable', () => {
        const props = buildProps();
        props.sessionRows = [
            {
                row_key: 'imported-1',
                bom_revision_id: 101,
                file_name: 'imported.txt',
                category: 'AMPLI',
                reference: 'CARD_A',
                revision: 'REV_A',
                side: 'TOP',
                item_count: 12,
                success: true,
                isImported: true,
            },
            {
                row_key: 'draft-1',
                file_name: 'draft.txt',
                category: '',
                reference: 'CARD_B',
                revision: 'REV_B',
                side: 'BOT',
                item_count: 0,
                success: false,
                isImported: false,
            },
        ];
        props.paginatedSessionRows = props.sessionRows;
        props.result = props.sessionRows[0];

        render(<BomImportWorkspaceCard {...props} />);

        expect(screen.getByText('TOP')).toBeInTheDocument();
        const comboboxValues = screen.getAllByRole('combobox').map((element) => element.textContent);
        expect(comboboxValues).toEqual(expect.arrayContaining(['BOT', '25']));
        expect(comboboxValues).not.toContain('TOP');
    });
});
