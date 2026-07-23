import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import RevisionGroupRow from '../RevisionGroupRow';

function renderRow(props) {
    return render(
        <table><tbody>
            <RevisionGroupRow
                revGroup={{ revision: 'REV_A', items: [
                    { bom_revision_id: 1, side: 'TOP', status: 'VALIDATED', created_at: '2026-07-01T10:00:00' },
                    { bom_revision_id: 2, side: 'BOT', status: 'DRAFT', created_at: '2026-07-03T10:00:00' },
                ] }}
                open={false}
                onToggle={() => {}}
                onOpenRevision={() => {}}
                onDeleteRevision={() => {}}
                {...props}
            />
        </tbody></table>
    );
}

describe('RevisionGroupRow', () => {
    test('ligne repliée : libellé « Rev. A » (normalisé depuis REV_A) + faces TOP/BOT', () => {
        renderRow();
        expect(screen.getByText('Rev. A')).toBeInTheDocument();
        // faces présentes résumées
        expect(screen.getAllByText('TOP').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('BOT').length).toBeGreaterThanOrEqual(1);
    });

    test('détail par face accessible (Ouvrir + Supprimer présents)', () => {
        renderRow({ open: true });
        expect(screen.getAllByRole('button', { name: /Ouvrir/i })).toHaveLength(2);
        expect(screen.getByText('VALIDATED')).toBeInTheDocument();
    });

    test('clic sur la ligne déclenche onToggle', () => {
        const onToggle = jest.fn();
        renderRow({ onToggle });
        fireEvent.click(screen.getByText('Rev. A'));
        expect(onToggle).toHaveBeenCalled();
    });

    test('Ouvrir appelle onOpenRevision avec la face', () => {
        const onOpenRevision = jest.fn();
        renderRow({ open: true, onOpenRevision });
        fireEvent.click(screen.getAllByRole('button', { name: /Ouvrir/i })[0]);
        expect(onOpenRevision).toHaveBeenCalledTimes(1);
    });
});
