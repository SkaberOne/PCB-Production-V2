import React from 'react';
import apiClient from '../../api/client';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    IconButton,
    InputAdornment,
    MenuItem,
    Stack,
    TextField,
    Typography,
} from '@mui/material';

const CREDENTIALS_URL = '/marketplace/supplier-offers/credentials';
const STATUS_URL = '/marketplace/supplier-offers/status';

const PROVIDERS = [
    { key: 'mouser', label: 'Mouser', defaultAuth: 'api_key' },
    { key: 'digikey', label: 'DigiKey', defaultAuth: 'client_credentials' },
    { key: 'farnell', label: 'Farnell', defaultAuth: 'api_key' },
];

const AUTH_OPTIONS = [
    { value: 'api_key', label: 'Clé API' },
    { value: 'client_credentials', label: 'Client ID + Secret' },
];

const emptyForm = {
    mouser: { auth_type: 'api_key', api_key: '', client_id: '', client_secret: '' },
    digikey: { auth_type: 'client_credentials', api_key: '', client_id: '', client_secret: '' },
    farnell: { auth_type: 'api_key', api_key: '', client_id: '', client_secret: '' },
};

function buildFormFromMeta(meta) {
    const next = JSON.parse(JSON.stringify(emptyForm));
    PROVIDERS.forEach(({ key, defaultAuth }) => {
        const providerMeta = meta?.[key] || {};
        next[key].auth_type = providerMeta.auth_type || defaultAuth;
        next[key].client_id = providerMeta.client_id || '';
        // Secrets are never returned in clear: leave inputs empty (placeholder shows the hint).
        next[key].api_key = '';
        next[key].client_secret = '';
    });
    return next;
}

function SupplierApiSettings() {
    const [meta, setMeta] = React.useState(null);
    const [form, setForm] = React.useState(emptyForm);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [testing, setTesting] = React.useState(false);
    const [feedback, setFeedback] = React.useState({ status: 'idle', message: '' });
    const [showSecret, setShowSecret] = React.useState({});
    const [statusConfigured, setStatusConfigured] = React.useState({});

    const loadCredentials = React.useCallback(async () => {
        setLoading(true);
        try {
            const response = await apiClient.get(CREDENTIALS_URL);
            const providers = response.data?.providers || {};
            setMeta(providers);
            setForm(buildFormFromMeta(providers));
        } catch (error) {
            setFeedback({
                status: 'error',
                message: error.response?.data?.detail || error.message || 'Erreur lors du chargement des identifiants fournisseurs.',
            });
        } finally {
            setLoading(false);
        }
    }, []);

    const loadStatus = React.useCallback(async () => {
        // Effective state including the .env fallback (same source as "Vérifier la connexion").
        try {
            const response = await apiClient.get(STATUS_URL);
            const map = {};
            (response.data?.connectors || []).forEach((connector) => {
                map[(connector.supplier || '').toLowerCase()] = Boolean(connector.configured);
            });
            setStatusConfigured(map);
        } catch (error) {
            // Status is optional; the badge falls back to the stored-credential flags.
        }
    }, []);

    React.useEffect(() => { loadCredentials(); loadStatus(); }, [loadCredentials, loadStatus]);

    const updateField = (providerKey, field) => (event) => {
        const value = event.target.value;
        setForm((current) => ({
            ...current,
            [providerKey]: { ...current[providerKey], [field]: value },
        }));
    };

    const toggleSecret = (id) => setShowSecret((current) => ({ ...current, [id]: !current[id] }));

    const handleSave = async () => {
        setSaving(true);
        setFeedback({ status: 'idle', message: '' });
        try {
            const payload = {};
            PROVIDERS.forEach(({ key }) => {
                const entry = form[key];
                if (entry.auth_type === 'api_key') {
                    payload[key] = { auth_type: 'api_key', api_key: entry.api_key };
                } else {
                    payload[key] = {
                        auth_type: 'client_credentials',
                        client_id: entry.client_id,
                        client_secret: entry.client_secret,
                    };
                }
            });
            const response = await apiClient.put(CREDENTIALS_URL, payload);
            const providers = response.data?.providers || {};
            setMeta(providers);
            setForm(buildFormFromMeta(providers));
            loadStatus();
            setFeedback({ status: 'success', message: 'Identifiants fournisseurs enregistrés.' });
        } catch (error) {
            setFeedback({
                status: 'error',
                message: error.response?.data?.detail || error.message || "Erreur lors de l'enregistrement des identifiants.",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setFeedback({ status: 'idle', message: '' });
        try {
            const response = await apiClient.get(STATUS_URL, { params: { test: true } });
            const connectors = response.data?.connectors || [];
            const statusMap = {};
            connectors.forEach((connector) => {
                statusMap[(connector.supplier || '').toLowerCase()] = Boolean(connector.configured);
            });
            setStatusConfigured(statusMap);
            const summary = connectors
                .map((connector) => {
                    if (!connector.configured) return `${connector.supplier} : non configuré`;
                    if (connector.live_test === 'ok') return `${connector.supplier} : OK (${connector.offers_found} offre(s))`;
                    if (connector.live_test === 'error') return `${connector.supplier} : erreur`;
                    return `${connector.supplier} : configuré`;
                })
                .join(' · ');
            setFeedback({ status: 'info', message: summary || 'Aucun connecteur.' });
        } catch (error) {
            setFeedback({
                status: 'error',
                message: error.response?.data?.detail || error.message || 'Erreur lors du test des connecteurs.',
            });
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return (
            <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={18} />
                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>Chargement des identifiants...</Typography>
            </Stack>
        );
    }

    return (
        <Stack spacing={2}>
            <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                Identifiants utilisés pour l'enrichissement automatique des fiches composants (MPN, prix,
                disponibilité). Les secrets ne sont jamais réaffichés : laissez le champ vide pour conserver
                la valeur déjà enregistrée.
            </Typography>

            {feedback.status !== 'idle' ? (
                <Alert severity={feedback.status} onClose={() => setFeedback({ status: 'idle', message: '' })}>
                    {feedback.message}
                </Alert>
            ) : null}

            {PROVIDERS.map(({ key, label }) => {
                const entry = form[key];
                const providerMeta = meta?.[key] || {};
                const isApiKey = entry.auth_type === 'api_key';
                const apiKeySecretId = `${key}-api_key`;
                const clientSecretId = `${key}-client_secret`;
                const storeConfigured = isApiKey ? providerMeta.api_key_set : providerMeta.client_secret_set;
                // Prefer the effective state (store OR .env); fall back to the stored flag.
                const configured = statusConfigured[key] ?? storeConfigured;
                return (
                    <Card key={key} variant="outlined" sx={{ borderColor: 'var(--border)' }}>
                        <CardContent sx={{ py: 2 }}>
                            <Stack spacing={1.5}>
                                <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
                                    <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>{label}</Typography>
                                    <Chip
                                        size="small"
                                        variant="outlined"
                                        color={configured ? 'success' : 'default'}
                                        icon={configured ? <CheckCircleRoundedIcon /> : <RadioButtonUncheckedRoundedIcon />}
                                        label={configured ? 'Configuré' : 'Non configuré'}
                                    />
                                </Stack>

                                <TextField
                                    select
                                    size="small"
                                    label="Type d'authentification"
                                    value={entry.auth_type}
                                    onChange={updateField(key, 'auth_type')}
                                    sx={{ maxWidth: 260 }}
                                >
                                    {AUTH_OPTIONS.map((option) => (
                                        <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                                    ))}
                                </TextField>

                                {isApiKey ? (
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Clé API"
                                        type={showSecret[apiKeySecretId] ? 'text' : 'password'}
                                        value={entry.api_key}
                                        onChange={updateField(key, 'api_key')}
                                        placeholder={providerMeta.api_key_set ? `Déjà enregistrée (${providerMeta.api_key_hint})` : 'Saisir la clé API'}
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => toggleSecret(apiKeySecretId)}
                                                        aria-label={showSecret[apiKeySecretId] ? 'Masquer la clé API' : 'Afficher la clé API'}
                                                    >
                                                        {showSecret[apiKeySecretId] ? <VisibilityOffRoundedIcon fontSize="small" /> : <VisibilityRoundedIcon fontSize="small" />}
                                                    </IconButton>
                                                </InputAdornment>
                                            ),
                                        }}
                                    />
                                ) : (
                                    <>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label="Client ID"
                                            value={entry.client_id}
                                            onChange={updateField(key, 'client_id')}
                                            placeholder="Identifiant client OAuth"
                                        />
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label="Client Secret"
                                            type={showSecret[clientSecretId] ? 'text' : 'password'}
                                            value={entry.client_secret}
                                            onChange={updateField(key, 'client_secret')}
                                            placeholder={providerMeta.client_secret_set ? `Déjà enregistré (${providerMeta.client_secret_hint})` : 'Saisir le secret client'}
                                            InputProps={{
                                                endAdornment: (
                                                    <InputAdornment position="end">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => toggleSecret(clientSecretId)}
                                                            aria-label={showSecret[clientSecretId] ? 'Masquer le secret' : 'Afficher le secret'}
                                                        >
                                                            {showSecret[clientSecretId] ? <VisibilityOffRoundedIcon fontSize="small" /> : <VisibilityRoundedIcon fontSize="small" />}
                                                        </IconButton>
                                                    </InputAdornment>
                                                ),
                                            }}
                                        />
                                    </>
                                )}
                            </Stack>
                        </CardContent>
                    </Card>
                );
            })}

            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                <Button variant="contained" onClick={handleSave} disabled={saving}>
                    {saving ? 'Enregistrement...' : 'Enregistrer les identifiants'}
                </Button>
                <Button variant="outlined" onClick={handleTest} disabled={testing}>
                    {testing ? 'Test en cours...' : 'Vérifier la connexion'}
                </Button>
            </Stack>

            <Box sx={{ border: '1px dashed #3f3f46', borderRadius: 1, p: 1.5 }}>
                <Typography variant="caption" sx={{ color: '#71717a' }}>
                    Les identifiants sont stockés côté serveur (hors dépôt Git) et prennent le pas sur les valeurs
                    du fichier .env. L'enrichissement MPN qui les consomme se trouve dans Bibliothèque › Base de
                    données › Enrichissement MPN.
                </Typography>
            </Box>
        </Stack>
    );
}

export default SupplierApiSettings;
