/**
 * 028 #3 — le message « Backend non disponible » est générique : il ne mentionne
 * plus le port 8000 (faux en staging :8001).
 */
import React from 'react';
import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppShell from '../AppShell';

jest.mock('../../../context/BomSessionContext', () => ({
    __esModule: true,
    useBomSession: () => ({ activeProduction: null, currentBom: null, bomWorkspace: null }),
}));

function renderShell() {
    render(
        <MemoryRouter>
            <AppShell pages={[]}><div>contenu</div></AppShell>
        </MemoryRouter>,
    );
}

describe('AppShell — message backend down générique (028 #3)', () => {
    it('affiche un message sans « 8000 » quand le backend est injoignable', async () => {
        renderShell();
        act(() => {
            window.dispatchEvent(new CustomEvent('api:backend:down', { detail: { message: 'Network Error' } }));
        });
        const alert = await screen.findByText(/Backend non disponible/i);
        expect(alert).toBeInTheDocument();
        expect(alert.textContent).not.toMatch(/8000/);
        expect(alert.textContent).not.toMatch(/port/i);
    });
});
