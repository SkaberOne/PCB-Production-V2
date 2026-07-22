import React from 'react';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import apiClient from '../../api/client';

/**
 * Réglage « Dossier des projets » (prompt 011) : chemin racine du dépôt de
 * conception (partage réseau), **persistant côté serveur** (STOCK_SETTINGS) et
 * éditable ici — jamais codé en dur. Utilisé par l'import en masse du catalogue.
 */
function ProjectsRootSetting() {
    const [path, setPath] = React.useState('');
    const [loaded, setLoaded] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [status, setStatus] = React.useState(null);

    React.useEffect(() => {
        apiClient.get('/marketplace/stock/settings')
            .then((res) => { setPath(res.data?.projects_root_path || ''); setLoaded(true); })
            .catch(() => setLoaded(true));
    }, []);

    const save = async () => {
        setSaving(true); setStatus(null);
        try {
            const res = await apiClient.put('/marketplace/stock/projects-root', {
                projects_root_path: path.trim() || null,
            });
            setPath(res.data?.projects_root_path || '');
            setStatus({ type: 'success', msg: res.data?.projects_root_path ? 'Chemin enregistré.' : 'Chemin effacé.' });
        } catch (e) {
            setStatus({ type: 'error', msg: "Échec de l'enregistrement du chemin." });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Stack spacing={1.5}>
            <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                Dossier racine des projets de conception (partage réseau), utilisé par l'<b>import
                en masse du catalogue</b>. Lecture seule côté serveur. Exemple :{' '}
                <Box component="code" sx={{ color: '#e4e4e7' }}>\\rs\Elec\00 - Conception PCB\Articles sur plan</Box>.
            </Typography>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                <TextField
                    size="small"
                    label="Dossier des projets (import catalogue)"
                    value={path}
                    onChange={(e) => { setPath(e.target.value); setStatus(null); }}
                    inputProps={{ maxLength: 500 }}
                    sx={{ minWidth: 420 }}
                    disabled={!loaded || saving}
                    data-testid="projects-root-input"
                />
                <Button variant="outlined" onClick={save} disabled={!loaded || saving} data-testid="projects-root-save">
                    Enregistrer
                </Button>
            </Stack>
            {status ? <Alert severity={status.type} sx={{ py: 0 }}>{status.msg}</Alert> : null}
        </Stack>
    );
}

export default ProjectsRootSetting;
