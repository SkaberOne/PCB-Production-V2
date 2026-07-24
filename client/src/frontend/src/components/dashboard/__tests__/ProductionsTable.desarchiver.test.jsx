/**
 * 027 — ProductionsTable relaie bien onRequestUnarchiveProduction jusqu'à la ligne.
 * (Garde-fou contre un oubli de forward du prop à travers le composant table.)
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import ProductionsTable from '../ProductionsTable';

const noop = () => {};

function renderTable(prod, onRequestUnarchiveProduction) {
    render(
        <ProductionsTable
            productions={[prod]}
            filteredProductions={[prod]}
            loading={false}
            refreshCooldown={0}
            actionLoadingId={null}
            searchQuery=""
            onSearchQueryChange={noop}
            sortField="updated_at"
            sortDir="desc"
            onSortChange={noop}
            onRefresh={noop}
            onOpenCreateDialog={noop}
            activeProductionId={null}
            onRequestOpenProduction={noop}
            onRequestDeleteProduction={noop}
            onRequestRenameProduction={noop}
            onRequestArchiveProduction={noop}
            onRequestUnarchiveProduction={onRequestUnarchiveProduction}
            onRequestDuplicateProduction={noop}
            onRequestAssemblyMode={noop}
        />,
    );
}

const archived = {
    id: 42, name: 'ARCH-42', status: 'ARCHIVED', bom_count: 0, updated_at: null,
    bom_revisions: [], linked_references: [],
};

describe('ProductionsTable — forward désarchiver (027)', () => {
    it('« Désarchiver » cliqué depuis la table appelle bien le handler avec la prod', () => {
        const onRequestUnarchiveProduction = jest.fn();
        renderTable(archived, onRequestUnarchiveProduction);
        fireEvent.click(screen.getByLabelText("Plus d'actions pour ARCH-42"));
        fireEvent.click(screen.getByText('Désarchiver'));
        expect(onRequestUnarchiveProduction).toHaveBeenCalledWith(archived);
    });
});
