import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BomReviewTab from '../BomReviewTab';

// Renommage de valeur avec portée (prompt 002).
// On enveloppe BomReviewTab dans un harnais qui met à jour les items sur
// onValueChange / onBulkValueChange, comme le fait BomViewerPage en vrai.

function makeItems() {
    return [
        { id: 1, reference_item: 'C1', value_raw: '10uF', value_harmonized: '10µF', footprint_eagle: 'C0805', footprint_pnp: 'C0805', quantity: 1, dnp: false, notes: '' },
        { id: 2, reference_item: 'C2', value_raw: '10uF', value_harmonized: '10µF', footprint_eagle: 'C0805', footprint_pnp: 'C0805', quantity: 1, dnp: false, notes: '' },
        { id: 3, reference_item: 'R1', value_raw: '4.7k', value_harmonized: '4.7k', footprint_eagle: 'R0603', footprint_pnp: 'R0603', quantity: 1, dnp: false, notes: '' },
    ];
}

function Harness({ spies }) {
    const [items, setItems] = React.useState(makeItems);
    const onValueChange = React.useCallback((id, val) => {
        spies.onValueChange(id, val);
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, value_harmonized: val } : i)));
    }, [spies]);
    const onBulkValueChange = React.useCallback((oldV, newV) => {
        spies.onBulkValueChange(oldV, newV);
        setItems((prev) => prev.map((i) => ((i.value_harmonized || '') === oldV ? { ...i, value_harmonized: newV } : i)));
    }, [spies]);
    return (
        <BomReviewTab
            activeBom={{ items, warnings: [], errors: [], reference: 'BRD', revision: 'A', side: 'TOP' }}
            activeRevisionId={1}
            onValueChange={onValueChange}
            onBulkValueChange={onBulkValueChange}
            onFootprintChange={jest.fn()}
            onComponentTypeChange={jest.fn()}
            onDnpChange={jest.fn()}
            onNotesChange={jest.fn()}
            onBulkTypeChange={jest.fn()}
            onUndo={jest.fn()}
        />
    );
}

function renderTab() {
    const spies = { onValueChange: jest.fn(), onBulkValueChange: jest.fn() };
    render(<Harness spies={spies} />);
    return spies;
}

function valueInput(label) {
    // aria-label est porté par la racine du TextField MUI : on descend à l'<input>.
    const el = screen.getByLabelText(label);
    return el.tagName === 'INPUT' ? el : el.querySelector('input');
}

function editValue(label, newValue) {
    const input = valueInput(label);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: newValue } });
    fireEvent.blur(input);
    return input;
}

describe('BomReviewTab — renommage de valeur avec portée (002)', () => {
    it('ouvre le dialog de portée quand la valeur est partagée', async () => {
        renderTab();
        editValue('Valeur revue C1', '10µF/35V');
        expect(await screen.findByText('Portée du changement de valeur')).toBeInTheDocument();
        // 1 autre composant partage 10µF → « Tous (2) ».
        expect(screen.getByRole('button', { name: /Tous \(2\)/ })).toBeInTheDocument();
    });

    it('« Tous » applique la nouvelle valeur à toutes les lignes (onBulkValueChange)', async () => {
        const spies = renderTab();
        editValue('Valeur revue C1', '10µF/35V');
        fireEvent.click(await screen.findByRole('button', { name: /Tous \(2\)/ }));
        await waitFor(() => {
            expect(spies.onBulkValueChange).toHaveBeenCalledWith('10µF', '10µF/35V');
        });
    });

    it('« Ce composant uniquement » ne touche qu\'une ligne (pas de bulk)', async () => {
        const spies = renderTab();
        editValue('Valeur revue C1', '10µF/35V');
        fireEvent.click(await screen.findByRole('button', { name: /Ce composant uniquement/ }));
        await waitFor(() => {
            expect(screen.queryByText('Portée du changement de valeur')).not.toBeInTheDocument();
        });
        expect(spies.onBulkValueChange).not.toHaveBeenCalled();
    });

    it('valeur non partagée → aucun dialog', async () => {
        const spies = renderTab();
        editValue('Valeur revue R1', '5k');
        // Laisse les effets se dérouler.
        await waitFor(() => {
            expect(spies.onValueChange).toHaveBeenCalledWith(3, '5k');
        });
        expect(screen.queryByText('Portée du changement de valeur')).not.toBeInTheDocument();
        expect(spies.onBulkValueChange).not.toHaveBeenCalled();
    });

    it('« Annuler » rétablit l\'ancienne valeur sur la ligne éditée', async () => {
        const spies = renderTab();
        const input = editValue('Valeur revue C1', '10µF/35V');
        fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }));
        await waitFor(() => {
            expect(input).toHaveValue('10µF');
        });
        expect(spies.onBulkValueChange).not.toHaveBeenCalled();
    });
});
