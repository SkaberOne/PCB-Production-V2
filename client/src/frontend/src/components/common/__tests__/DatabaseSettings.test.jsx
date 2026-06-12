import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DatabaseSettings from '../DatabaseSettings';

afterEach(() => {
    delete window.electronAPI;
    jest.clearAllMocks();
});

describe('DatabaseSettings', () => {
    test('hors application installée (pas de pont Electron) : message informatif', async () => {
        render(<DatabaseSettings />);
        expect(
            await screen.findByText(/se configure depuis l'application installée/i),
        ).toBeInTheDocument();
    });

    test('charge la config et masque le mot de passe déjà enregistré', async () => {
        window.electronAPI = {
            dbConfig: {
                get: jest.fn().mockResolvedValue({
                    available: true,
                    host: '192.168.1.20',
                    port: '1433',
                    user: 'pcbflow',
                    database: 'ECB_Production',
                    driver: 'ODBC Driver 17 for SQL Server',
                    passwordSet: true,
                    databaseUrlOverride: null,
                }),
                test: jest.fn(),
                save: jest.fn(),
                restart: jest.fn(),
            },
        };

        render(<DatabaseSettings />);

        expect(await screen.findByDisplayValue('192.168.1.20')).toBeInTheDocument();
        // Mot de passe non réaffiché : champ vide + placeholder « déjà enregistré ».
        expect(screen.getByPlaceholderText(/déjà enregistré/i)).toHaveValue('');
        expect(screen.getByText('Non testée')).toBeInTheDocument();
    });

    test('le bouton Tester appelle le pont et affiche le résultat', async () => {
        const test = jest.fn().mockResolvedValue({ ok: true, engine: 'mssql', detail: 'Connexion réussie (192.168.1.20)' });
        window.electronAPI = {
            dbConfig: {
                get: jest.fn().mockResolvedValue({
                    available: true, host: '192.168.1.20', port: '1433', user: 'pcbflow',
                    database: 'ECB_Production', driver: 'ODBC Driver 17 for SQL Server',
                    passwordSet: true, databaseUrlOverride: null,
                }),
                test,
                save: jest.fn(),
                restart: jest.fn(),
            },
        };

        render(<DatabaseSettings />);
        await screen.findByDisplayValue('192.168.1.20');

        fireEvent.click(screen.getByRole('button', { name: /tester la connexion/i }));

        await waitFor(() => expect(test).toHaveBeenCalledTimes(1));
        expect(await screen.findByText('Connectée')).toBeInTheDocument();
    });

    test('Enregistrer & redémarrer enchaîne save puis restart', async () => {
        const save = jest.fn().mockResolvedValue({ ok: true });
        const restart = jest.fn().mockResolvedValue({ ok: true });
        window.electronAPI = {
            dbConfig: {
                get: jest.fn().mockResolvedValue({
                    available: true, host: 'localhost', port: '1433', user: 'pcbflow',
                    database: 'ECB_Production', driver: 'ODBC Driver 17 for SQL Server',
                    passwordSet: false, databaseUrlOverride: null,
                }),
                test: jest.fn(),
                save,
                restart,
            },
        };

        render(<DatabaseSettings />);
        await screen.findByDisplayValue('localhost');

        fireEvent.click(screen.getByRole('button', { name: /enregistrer & redémarrer/i }));

        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    });

    test('signale une surcharge DATABASE_URL active', async () => {
        window.electronAPI = {
            dbConfig: {
                get: jest.fn().mockResolvedValue({
                    available: true, host: '', port: '1433', user: '',
                    database: 'ECB_Production', driver: 'ODBC Driver 17 for SQL Server',
                    passwordSet: false, databaseUrlOverride: 'sqlite:///./database/dev.db',
                }),
                test: jest.fn(), save: jest.fn(), restart: jest.fn(),
            },
        };

        render(<DatabaseSettings />);
        expect(await screen.findByText(/surcharge/i)).toBeInTheDocument();
    });
});
