/**
 * Smoke test de rendu de l'orchestrateur V2 Machine PnP (MachinePnpWorkspace).
 *
 * Sert de filet pour les refactors de la V2 (découpe de hooks, promotion en défaut) :
 * vérifie que la page V2 se monte, charge ses données (apiClient mocké) et rend ses
 * onglets sans planter. Volontairement indépendant du feature flag (monte le
 * composant V2 directement).
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import MachinePnpWorkspace from '../components/machine/MachinePnpWorkspace';
import apiClient from '../api/client';
import { useBomSession } from '../context/BomSessionContext';

jest.mock('../api/client', () => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
}));

jest.mock('../context/BomSessionContext', () => ({
    useBomSession: jest.fn(),
}));

const EMPTY_SESSION = {
    activeProduction: null,
    bomWorkspace: { quantitiesByReference: {} },
};

// Couvre les formes data[], items[] et tableau brut consommées par useWorkspaceData.
const EMPTY_RESPONSE = { data: { data: [], items: [] } };

beforeEach(() => {
    useBomSession.mockReturnValue(EMPTY_SESSION);
    apiClient.get.mockResolvedValue(EMPTY_RESPONSE);
});

afterEach(() => {
    jest.clearAllMocks();
});

describe('MachinePnpWorkspace (V2)', () => {
    it('rend le titre V2 et les trois onglets', () => {
        render(<MachinePnpWorkspace />);
        expect(screen.getByRole('heading', { name: /plan d'implantation/i })).toBeInTheDocument();
        expect(screen.getByText('Machines')).toBeInTheDocument();
        expect(screen.getByText('Feeders fixes')).toBeInTheDocument();
        expect(screen.getByText('Chariots')).toBeInTheDocument();
    });

    it('charge les données puis affiche l\'onglet Machines (bouton Nouvelle machine)', async () => {
        render(<MachinePnpWorkspace />);
        await waitFor(() => {
            expect(screen.getByText(/Nouvelle machine/i)).toBeInTheDocument();
        });
        // Le chargement initial déclenche au moins les GET du workspace.
        expect(apiClient.get).toHaveBeenCalled();
    });
});
