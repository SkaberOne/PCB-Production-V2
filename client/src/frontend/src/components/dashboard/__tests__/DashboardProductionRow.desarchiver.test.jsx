/**
 * 027 — Menu ⋮ d'une production : action « Désarchiver » réservée aux archivées.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import DashboardProductionRow from '../DashboardProductionRow';

function renderRow(production, handlers = {}) {
    const props = {
        production,
        isSessionActive: false,
        isBusy: false,
        onRequestOpenProduction: jest.fn(),
        onRequestDeleteProduction: jest.fn(),
        onRequestRenameProduction: jest.fn(),
        onRequestArchiveProduction: jest.fn(),
        onRequestUnarchiveProduction: jest.fn(),
        onRequestDuplicateProduction: jest.fn(),
        onRequestAssemblyMode: jest.fn(),
        ...handlers,
    };
    render(
        <table><tbody>
            <DashboardProductionRow {...props} />
        </tbody></table>,
    );
    return props;
}

const baseProd = (over) => ({
    id: 7, name: 'PROD-X', status: 'DRAFT', bom_count: 0, updated_at: null,
    bom_revisions: [], linked_references: [], ...over,
});

function openMenu(name) {
    fireEvent.click(screen.getByLabelText(`Plus d'actions pour ${name}`));
}

describe('DashboardProductionRow — désarchiver (027)', () => {
    it('production archivée : « Désarchiver » présent, « Archiver » absent', () => {
        renderRow(baseProd({ status: 'ARCHIVED' }));
        openMenu('PROD-X');
        expect(screen.getByText('Désarchiver')).toBeInTheDocument();
        expect(screen.queryByText('Archiver')).not.toBeInTheDocument();
    });

    it('clic « Désarchiver » appelle onRequestUnarchiveProduction avec la prod', () => {
        const onRequestUnarchiveProduction = jest.fn();
        const prod = baseProd({ status: 'ARCHIVED' });
        renderRow(prod, { onRequestUnarchiveProduction });
        openMenu('PROD-X');
        fireEvent.click(screen.getByText('Désarchiver'));
        expect(onRequestUnarchiveProduction).toHaveBeenCalledWith(prod);
    });

    it.each(['DRAFT', 'ACTIVE', 'COMPLETED'])(
        'production %s : « Désarchiver » absent, « Archiver » présent',
        (status) => {
            renderRow(baseProd({ status }));
            openMenu('PROD-X');
            expect(screen.queryByText('Désarchiver')).not.toBeInTheDocument();
            expect(screen.getByText('Archiver')).toBeInTheDocument();
        },
    );
});
