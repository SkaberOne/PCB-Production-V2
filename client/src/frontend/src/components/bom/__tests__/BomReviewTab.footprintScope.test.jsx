import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BomReviewTab from '../BomReviewTab';

// Changement de footprint avec portée (prompt 005) — parité avec la valeur (002).
// Harnais : met à jour footprint_pnp sur onFootprintChange / onBulkFootprintChange,
// comme le fait BomViewerPage en vrai.

function makeItems() {
    return [
        { id: 1, reference_item: 'R1', value_raw: '4.7k', value_harmonized: '4.7k', footprint_eagle: 'R1206', footprint_pnp: '1206', quantity: 1, dnp: false, notes: '' },
        { id: 2, reference_item: 'R2', value_raw: '4.7k', value_harmonized: '4.7k', footprint_eagle: 'R1206', footprint_pnp: '1206', quantity: 1, dnp: false, notes: '' },
        { id: 3, reference_item: 'R3', value_raw: '10k', value_harmonized: '10k', footprint_eagle: 'R1206', footprint_pnp: '1206', quantity: 1, dnp: false, notes: '' },
        { id: 4, reference_item: 'R4', value_raw: '4.7k', value_harmonized: '4.7k', footprint_eagle: 'R0603', footprint_pnp: '0603', quantity: 1, dnp: false, notes: '' },
    ];
}

function Harness({ spies }) {
    const [items, setItems] = React.useState(makeItems);
    const onFootprintChange = React.useCallback((item, val) => {
        spies.onFootprintChange(item, val);
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, footprint_pnp: val } : i)));
    }, [spies]);
    const onBulkFootprintChange = React.useCallback((value, oldFp, newFp) => {
        spies.onBulkFootprintChange(value, oldFp, newFp);
        setItems((prev) => prev.map((i) => (
            (i.value_harmonized || '') === value && (i.footprint_pnp || '') === oldFp
                ? { ...i, footprint_pnp: newFp }
                : i
        )));
    }, [spies]);
    return (
        <BomReviewTab
            activeBom={{ items, warnings: [], errors: [], reference: 'BRD', revision: 'A', side: 'TOP' }}
            activeRevisionId={1}
            onValueChange={jest.fn()}
            onBulkValueChange={jest.fn()}
            onFootprintChange={onFootprintChange}
            onBulkFootprintChange={onBulkFootprintChange}
            onComponentTypeChange={jest.fn()}
            onDnpChange={jest.fn()}
            onNotesChange={jest.fn()}
            onBulkTypeChange={jest.fn()}
            onUndo={jest.fn()}
        />
    );
}

function renderTab() {
    const spies = { onFootprintChange: jest.fn(), onBulkFootprintChange: jest.fn() };
    render(<Harness spies={spies} />);
    return spies;
}

function fpInput(label) {
    const el = screen.getByLabelText(label);
    return el.tagName === 'INPUT' ? el : el.querySelector('input');
}

function editFootprint(label, newValue) {
    const input = fpInput(label);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: newValue } });
    fireEvent.blur(input);
    return input;
}

describe('BomReviewTab — changement de footprint avec portée (005)', () => {
    it('ouvre le dialog de portée quand (valeur + footprint) est partagé', async () => {
        renderTab();
        editFootprint('Empreinte PnP R1', '0603');
        expect(await screen.findByText("Portée du changement d'empreinte")).toBeInTheDocument();
        // R1 (édité) + R2 partagent 4.7k en 1206 → « Tous les 4.7k en 1206 (2) ».
        expect(screen.getByRole('button', { name: /Tous les 4\.7k en 1206 \(2\)/ })).toBeInTheDocument();
    });

    it('« Tous » ne cible que (même valeur + même ancien footprint)', async () => {
        const spies = renderTab();
        editFootprint('Empreinte PnP R1', '0603');
        fireEvent.click(await screen.findByRole('button', { name: /Tous les 4\.7k en 1206 \(2\)/ }));
        await waitFor(() => {
            expect(spies.onBulkFootprintChange).toHaveBeenCalledWith('4.7k', '1206', '0603');
        });
    });

    it('« Ce composant uniquement » ne déclenche pas de bulk', async () => {
        const spies = renderTab();
        editFootprint('Empreinte PnP R1', '0603');
        fireEvent.click(await screen.findByRole('button', { name: /Ce composant uniquement/ }));
        await waitFor(() => {
            expect(screen.queryByText("Portée du changement d'empreinte")).not.toBeInTheDocument();
        });
        expect(spies.onBulkFootprintChange).not.toHaveBeenCalled();
    });

    it('footprint non partagé (valeur+footprint uniques) → aucun dialog', async () => {
        const spies = renderTab();
        editFootprint('Empreinte PnP R4', '0402');
        await waitFor(() => {
            expect(spies.onFootprintChange).toHaveBeenCalled();
        });
        expect(screen.queryByText("Portée du changement d'empreinte")).not.toBeInTheDocument();
        expect(spies.onBulkFootprintChange).not.toHaveBeenCalled();
    });

    it('« Annuler » rétablit l\'ancien footprint sur la ligne éditée', async () => {
        const spies = renderTab();
        const input = editFootprint('Empreinte PnP R1', '0603');
        fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }));
        await waitFor(() => {
            expect(input).toHaveValue('1206');
        });
        expect(spies.onBulkFootprintChange).not.toHaveBeenCalled();
    });
});
