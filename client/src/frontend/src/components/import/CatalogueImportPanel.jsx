import React from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Stack, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import apiClient, { extractApiError } from '../../api/client';
import { colors } from '../../theme';

const STATUS_LABEL = {
    importable: { label: 'Importable', color: '#3b82f6' },
    imported: { label: 'Importée', color: '#22c55e' },
    ignored: { label: 'Déjà en base', color: '#a1a1aa' },
    kicad: { label: 'KiCad (à venir)', color: '#f59e0b' },
    empty: { label: 'Sans CAO', color: '#a1a1aa' },
    error: { label: 'Erreur', color: '#ef4444' },
};

/**
 * Import en masse du catalogue (prompt 011) : parcours serveur du dossier des
 * projets (réglage Paramètres), aperçu (dry-run) puis import réel des révisions
 * Eagle absentes. KiCad détecté et listé (non importé).
 */
function CatalogueImportPanel() {
    const [rootPath, setRootPath] = React.useState('');
    const [override, setOverride] = React.useState('');
    const [report, setReport] = React.useState(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);

    React.useEffect(() => {
        apiClient.get('/marketplace/stock/settings')
            .then((res) => setRootPath(res.data?.projects_root_path || ''))
            .catch(() => {});
    }, []);

    const run = async (dryRun) => {
        setBusy(true); setError(null); setReport(null);
        try {
            const params = { dry_run: dryRun };
            if (override.trim()) params.root_path = override.trim();
            const res = await apiClient.post('/bom/import-catalogue', null, { params });
            setReport(res.data);
        } catch (e) {
            setError(extractApiError(e) || "Échec de l'import catalogue.");
        } finally {
            setBusy(false);
        }
    };

    const rows = report?.rows || [];

    return (
        <Box>
            <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 1.5 }}>
                Peuple le catalogue (cartes Eagle + composants) depuis le dossier des projets configuré
                dans Paramètres. <b>Idempotent</b> : seules les révisions absentes sont importées ;
                les cartes KiCad sont listées (import à venir). Lecture seule sur le partage.
            </Typography>

            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" useFlexGap>
                <Chip
                    size="small" variant="outlined"
                    label={rootPath ? `Dossier configuré : ${rootPath}` : 'Aucun dossier configuré (Paramètres)'}
                    sx={{ borderColor: colors.border, color: rootPath ? colors.textSecondary : '#f59e0b' }}
                />
            </Stack>

            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
                <TextField
                    size="small" label="Chemin override (optionnel)" value={override}
                    onChange={(e) => setOverride(e.target.value)} sx={{ minWidth: 360 }}
                    placeholder="Sinon, le réglage Paramètres est utilisé"
                    data-testid="catalogue-override"
                />
                <Button
                    variant="outlined" startIcon={<PlayArrowRoundedIcon />} disabled={busy}
                    onClick={() => run(true)} data-testid="catalogue-dryrun"
                >
                    Aperçu (dry-run)
                </Button>
                <Button
                    variant="contained" startIcon={<DownloadRoundedIcon />} disabled={busy}
                    onClick={() => run(false)} data-testid="catalogue-import"
                >
                    Importer
                </Button>
                {busy ? <CircularProgress size={20} /> : null}
            </Stack>

            {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

            {report ? (
                <Box>
                    <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                        <Chip label={`${report.cards_scanned} carte(s) scannée(s)`} variant="outlined" />
                        <Chip label={`${report.revisions_imported} révision(s) importée(s)`} sx={{ color: '#22c55e' }} variant="outlined" />
                        <Chip label={`${report.components_created} composant(s) créé(s)`} variant="outlined" />
                        <Chip label={report.dry_run ? 'Aperçu (rien écrit)' : 'Import réel'} color={report.dry_run ? 'default' : 'success'} />
                    </Stack>
                    {(report.skipped?.length || report.skipped_dirs?.length) ? (
                        <Alert severity="warning" sx={{ mb: 2 }} data-testid="catalogue-skipped">
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                {(report.skipped?.length ?? report.skipped_dirs.length)} dossier(s) ignoré(s) (non importé(s)) :
                            </Typography>
                            {report.skipped?.length
                                ? report.skipped.map((d) => (
                                    <Typography key={d.name} variant="body2">
                                        {d.name} — {d.label || d.reason}
                                    </Typography>
                                ))
                                : (
                                    <Typography variant="body2">{report.skipped_dirs.join(', ')}</Typography>
                                )}
                        </Alert>
                    ) : null}
                    <TableContainer sx={{ maxHeight: 460 }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Référence</TableCell>
                                    <TableCell>Nom</TableCell>
                                    <TableCell>Révision</TableCell>
                                    <TableCell>Statut</TableCell>
                                    <TableCell>Détail</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} sx={{ textAlign: 'center', color: colors.textSecondary, py: 3 }}>Aucune carte trouvée.</TableCell></TableRow>
                                ) : rows.map((r, i) => {
                                    const st = STATUS_LABEL[r.status] || { label: r.status, color: colors.textSecondary };
                                    return (
                                        <TableRow key={`${r.reference}-${r.revision}-${i}`}>
                                            <TableCell>{r.reference}</TableCell>
                                            <TableCell sx={{ color: colors.textSecondary }}>{r.name}</TableCell>
                                            <TableCell>{r.revision}</TableCell>
                                            <TableCell><Chip size="small" label={st.label} sx={{ color: st.color, borderColor: st.color }} variant="outlined" /></TableCell>
                                            <TableCell sx={{ color: colors.textSecondary }}>{r.message || ''}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            ) : null}
        </Box>
    );
}

export default CatalogueImportPanel;
