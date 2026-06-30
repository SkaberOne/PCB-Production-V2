import React from 'react';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Grid,
    IconButton,
    InputAdornment,
    Stack,
    TextField,
    Typography,
} from '@mui/material';

// Pont Electron exposé par preload.js (ADR 0009). Absent en contexte web/dev.
// Lu DYNAMIQUEMENT (et non capturé au chargement du module) : le preload peut
// l'exposer après l'évaluation du module, et les tests l'injectent au runtime.
const getDbApi = () => (typeof window !== 'undefined' ? window.electronAPI?.dbConfig : undefined);

const emptyForm = {
    host: '',
    port: '1433',
    user: '',
    password: '',
    database: 'ECB_Production',
    driver: 'ODBC Driver 17 for SQL Server',
};

function DatabaseSettings() {
    const [available, setAvailable] = React.useState(null); // null = en cours, false = web/dev
    const [unavailableReason, setUnavailableReason] = React.useState('');
    const [form, setForm] = React.useState(emptyForm);
    const [passwordSet, setPasswordSet] = React.useState(false);
    const [overrideActive, setOverrideActive] = React.useState(null);
    const [showPassword, setShowPassword] = React.useState(false);
    const [loading, setLoading] = React.useState(true);
    const [testing, setTesting] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [conn, setConn] = React.useState({ state: 'unknown', message: '' }); // unknown|ok|error
    const [feedback, setFeedback] = React.useState({ status: 'idle', message: '' });

    const load = React.useCallback(async () => {
        const api = getDbApi();
        if (!api) {
            setAvailable(false);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const data = await api.get();
            if (!data || !data.available) {
                setAvailable(false);
                setUnavailableReason(data?.reason || '');
            } else {
                setAvailable(true);
                setForm({
                    host: data.host || '',
                    port: String(data.port || '1433'),
                    user: data.user || '',
                    password: '',
                    database: data.database || 'ECB_Production',
                    driver: data.driver || 'ODBC Driver 17 for SQL Server',
                });
                setPasswordSet(Boolean(data.passwordSet));
                setOverrideActive(data.databaseUrlOverride || null);
            }
        } catch (error) {
            setFeedback({ status: 'error', message: error?.message || 'Lecture de la configuration impossible.' });
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => { load(); }, [load]);

    const updateField = (field) => (event) => {
        const { value } = event.target;
        setForm((current) => ({ ...current, [field]: value }));
    };

    const handleTest = async () => {
        setTesting(true);
        setConn({ state: 'unknown', message: '' });
        setFeedback({ status: 'idle', message: '' });
        try {
            const result = await getDbApi().test(form);
            if (result?.ok) {
                setConn({ state: 'ok', message: result.detail || 'Connexion réussie.' });
            } else {
                setConn({ state: 'error', message: result?.detail || 'Connexion impossible.' });
            }
        } catch (error) {
            setConn({ state: 'error', message: error?.message || 'Échec du test.' });
        } finally {
            setTesting(false);
        }
    };

    const handleSaveAndRestart = async () => {
        setSaving(true);
        setFeedback({ status: 'idle', message: '' });
        try {
            const api = getDbApi();
            const saved = await api.save(form);
            if (!saved?.ok) {
                setFeedback({ status: 'error', message: saved?.detail || "Échec de l'enregistrement." });
                return;
            }
            setFeedback({ status: 'info', message: 'Configuration enregistrée. Redémarrage du moteur…' });
            const restarted = await api.restart();
            if (!restarted?.ok) {
                // Le backend n'a pas redémarré : la config est enregistrée mais la
                // base reste injoignable. Le panneau reste utilisable (piloté par
                // Electron, pas par le backend) pour corriger puis réessayer.
                setConn({ state: 'error', message: restarted?.detail || 'Le moteur n\'a pas redémarré.' });
                setFeedback({
                    status: 'error',
                    message: 'Enregistré, mais le moteur n\'a pas pu redémarrer avec cette configuration. '
                        + 'Corrigez les paramètres puis réessayez.',
                });
                return;
            }
            // Succès : le process principal recharge le renderer (nouveau port).
            setFeedback({ status: 'success', message: 'Connecté. Rechargement…' });
        } catch (error) {
            setFeedback({ status: 'error', message: error?.message || 'Erreur lors de l\'enregistrement.' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={18} />
                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>Lecture de la configuration…</Typography>
            </Stack>
        );
    }

    if (available === false) {
        return (
            <Alert severity="info">
                La connexion à la base se configure depuis l'application installée sur le poste.
                {unavailableReason === 'dev'
                    ? ' En développement, le backend est lancé séparément et lit serveur/.env.'
                    : ''}
            </Alert>
        );
    }

    const connChip = {
        unknown: { color: 'default', icon: <HelpOutlineRoundedIcon />, label: 'Non testée' },
        ok: { color: 'success', icon: <CheckCircleRoundedIcon />, label: 'Connectée' },
        error: { color: 'error', icon: <ErrorRoundedIcon />, label: 'Injoignable' },
    }[conn.state];

    return (
        <Stack spacing={2}>
            <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="body2" sx={{ color: '#a1a1aa', flexGrow: 1 }}>
                    Paramètres de connexion au SQL Server central partagé par les postes. Le mot de passe
                    n'est jamais réaffiché : laissez le champ vide pour conserver celui déjà enregistré.
                </Typography>
                <Chip
                    size="small"
                    variant="outlined"
                    color={connChip.color}
                    icon={connChip.icon}
                    label={connChip.label}
                />
            </Stack>

            {overrideActive ? (
                <Alert severity="warning">
                    Une surcharge <Box component="code" sx={{ color: '#e4e4e7' }}>DATABASE_URL</Box> est active
                    (<Box component="code" sx={{ color: '#e4e4e7' }}>{overrideActive}</Box>) : le moteur ignore les
                    paramètres SQL Server ci-dessous tant qu'elle est présente. Utile pour un poste de test local.
                </Alert>
            ) : null}

            {feedback.status !== 'idle' ? (
                <Alert severity={feedback.status} onClose={() => setFeedback({ status: 'idle', message: '' })}>
                    {feedback.message}
                </Alert>
            ) : null}

            {conn.state === 'error' && conn.message ? (
                <Alert severity="error">{conn.message}</Alert>
            ) : null}
            {conn.state === 'ok' && conn.message ? (
                <Alert severity="success">{conn.message}</Alert>
            ) : null}

            <Grid container spacing={2}>
                <Grid item xs={12} sm={8}>
                    <TextField
                        fullWidth
                        size="small"
                        label="Hôte SQL Server"
                        value={form.host}
                        onChange={updateField('host')}
                        placeholder="ex. 192.168.1.20 ou localhost"
                    />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <TextField
                        fullWidth
                        size="small"
                        label="Port"
                        value={form.port}
                        onChange={updateField('port')}
                        placeholder="1433"
                    />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <TextField
                        fullWidth
                        size="small"
                        label="Utilisateur"
                        value={form.user}
                        onChange={updateField('user')}
                        placeholder="ex. pcbflow"
                    />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <TextField
                        fullWidth
                        size="small"
                        label="Mot de passe"
                        type={showPassword ? 'text' : 'password'}
                        value={form.password}
                        onChange={updateField('password')}
                        placeholder={passwordSet ? 'Déjà enregistré (laisser vide pour conserver)' : 'Saisir le mot de passe'}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        size="small"
                                        onClick={() => setShowPassword((v) => !v)}
                                        aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                                    >
                                        {showPassword ? <VisibilityOffRoundedIcon fontSize="small" /> : <VisibilityRoundedIcon fontSize="small" />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <TextField
                        fullWidth
                        size="small"
                        label="Base de données"
                        value={form.database}
                        onChange={updateField('database')}
                        placeholder="ECB_Production"
                    />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <TextField
                        fullWidth
                        size="small"
                        label="Pilote ODBC"
                        value={form.driver}
                        onChange={updateField('driver')}
                    />
                </Grid>
            </Grid>

            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                <Button variant="outlined" onClick={handleTest} disabled={testing || saving}>
                    {testing ? 'Test en cours…' : 'Tester la connexion'}
                </Button>
                <Button variant="contained" onClick={handleSaveAndRestart} disabled={saving || testing}>
                    {saving ? 'Enregistrement…' : 'Enregistrer & redémarrer'}
                </Button>
            </Stack>

            <Box sx={{ border: '1px dashed #3f3f46', borderRadius: 1, p: 1.5 }}>
                <Typography variant="caption" sx={{ color: '#71717a' }}>
                    Prérequis sur chaque poste : pilote <strong>ODBC Driver 17 for SQL Server</strong>. « Enregistrer
                    & redémarrer » applique la configuration et relance le moteur de production ; en cas d'échec, la
                    config reste modifiable ici (le panneau fonctionne même base injoignable).
                </Typography>
            </Box>
        </Stack>
    );
}

export default DatabaseSettings;
