import React from 'react';
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Typography,
} from '@mui/material';
import { setStoredApiKey } from '../../api/client';

/**
 * Fenêtre d'accès (mode web LAN).
 *
 * S'affiche quand le serveur refuse une requête faute de clé valide
 * (événement `api:auth:required` émis par le client API sur un 401). L'utilisateur
 * saisit la clé d'accès une seule fois : elle est mémorisée dans le navigateur
 * (localStorage), puis toutes les requêtes la portent. Après validation, la page
 * est rechargée pour rejouer les appels avec la clé.
 *
 * Inerte en mode desktop (Electron injecte sa propre clé → pas de 401) et en dev
 * sans clé serveur (aucun 401 → fenêtre jamais affichée).
 */
export default function ApiKeyGate() {
    const [open, setOpen] = React.useState(false);
    const [key, setKey] = React.useState('');
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        const onAuthRequired = () => setOpen(true);
        window.addEventListener('api:auth:required', onAuthRequired);
        return () => window.removeEventListener('api:auth:required', onAuthRequired);
    }, []);

    const submit = () => {
        const value = key.trim();
        if (!value) {
            setError("Merci d'entrer la clé d'accès.");
            return;
        }
        setStoredApiKey(value);
        // Recharge la page pour rejouer tous les appels avec la nouvelle clé.
        window.location.reload();
    };

    return (
        <Dialog open={open} disableEscapeKeyDown maxWidth="xs" fullWidth>
            <DialogTitle>Accès à l'application</DialogTitle>
            <DialogContent>
                <Typography variant="body2" sx={{ mb: 2 }}>
                    Entrez la clé d'accès fournie par votre administrateur. Elle sera
                    mémorisée sur ce navigateur : vous n'aurez à la saisir qu'une seule fois.
                </Typography>
                <TextField
                    autoFocus
                    fullWidth
                    type="password"
                    label="Clé d'accès"
                    value={key}
                    onChange={(event) => { setKey(event.target.value); setError(''); }}
                    onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
                />
                {error ? <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert> : null}
            </DialogContent>
            <DialogActions>
                <Button variant="contained" onClick={submit}>Valider</Button>
            </DialogActions>
        </Dialog>
    );
}
