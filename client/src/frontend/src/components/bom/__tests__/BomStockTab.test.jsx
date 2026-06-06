import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BomStockTab from '../BomStockTab';

jest.mock('../BomStockTable', () => () => null);

const baseProps = {
    aggregatedPreview: [],
    loadedEntryCount: 1,
    selectedEntries: [{ bom_revision_id: 1 }],
    canValidateStock: true,
    onValidateStock: jest.fn(),
    onOpenCommandPage: jest.fn(),
    onOpenStockDialog: jest.fn(),
};

describe('BomStockTab — CTA unique de validation', () => {
    beforeEach(() => jest.clearAllMocks());

    it('affiche « Valider le stock » tant que non validé', () => {
        render(<BomStockTab {...baseProps} stockValidation={{ isValidated: false }} />);

        const button = screen.getByRole('button', { name: /valider le stock/i });
        fireEvent.click(button);
        expect(baseProps.onValidateStock).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: /commande composant/i })).toBeNull();
    });

    it('devient « Commande Composant » une fois validé', () => {
        render(<BomStockTab {...baseProps} stockValidation={{ isValidated: true }} />);

        const button = screen.getByRole('button', { name: /commande composant/i });
        fireEvent.click(button);
        expect(baseProps.onOpenCommandPage).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: /valider le stock/i })).toBeNull();
    });

    it('désactive la validation tant que les BOM ne sont pas chargées', () => {
        render(
            <BomStockTab
                {...baseProps}
                canValidateStock={false}
                stockValidation={{ isValidated: false }}
            />,
        );

        expect(screen.getByRole('button', { name: /valider le stock/i })).toBeDisabled();
    });
});
