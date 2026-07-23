import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import PageHeader from '../PageHeader';

describe('PageHeader', () => {
    test('rend le titre', () => {
        render(<PageHeader title="Mon titre" />);
        expect(screen.getByText('Mon titre')).toBeInTheDocument();
    });

    test('affiche `subtitle` comme sous-titre (alias de description)', () => {
        render(<PageHeader title="T" subtitle="Sous-titre alias" />);
        expect(screen.getByText('Sous-titre alias')).toBeInTheDocument();
    });

    test('description a priorite sur subtitle si les deux sont fournis', () => {
        render(<PageHeader title="T" description="desc" subtitle="sub" />);
        expect(screen.getByText('desc')).toBeInTheDocument();
        expect(screen.queryByText('sub')).not.toBeInTheDocument();
    });
});
