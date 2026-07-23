import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import ConfirmDialog from '../ConfirmDialog';

describe('ConfirmDialog', () => {
    test('affiche titre + message quand open', () => {
        render(<ConfirmDialog open title="Supprimer le client" message="Sur ?" onConfirm={() => {}} onClose={() => {}} />);
        expect(screen.getByText('Supprimer le client')).toBeInTheDocument();
        expect(screen.getByText('Sur ?')).toBeInTheDocument();
    });

    test('onConfirm au clic Confirmer, onClose au clic Annuler', () => {
        const onConfirm = jest.fn();
        const onClose = jest.fn();
        render(<ConfirmDialog open title="T" message="M" confirmLabel="Supprimer" onConfirm={onConfirm} onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('ferme => pas de contenu rendu', () => {
        render(<ConfirmDialog open={false} title="Hidden" message="X" onConfirm={() => {}} onClose={() => {}} />);
        expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
    });
});
