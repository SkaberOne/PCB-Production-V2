import React from 'react';
import apiClient from '../../api/client';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import { compactCellSx, compactTableContainerSx, compactTableSx } from '../../utils/compactTable';
import {
    emptyFeedback,
    buildMachineFootprintOptions,
    buildMachineFootprintCatalogLookup,
    normalizeMachineFootprintCatalogPayload,
    buildMachineFootprintImportFeedback,
    isSupportedMachineFootprintFile,
} from '../../utils/componentLibraryForm';


function EmpreintesPanel() {
    const machineFootprintFileInputRef = React.useRef(null);
    const [machineFootprintFile, setMachineFootprintFile] = React.useState(null);
    const [machineFootprintCatalog, setMachineFootprintCatalog] = React.useState([]);
    const [machineFootprintLookup, setMachineFootprintLookup] = React.useState({});
    const [machineFootprintLoading, setMachineFootprintLoading] = React.useState(false);
    const [machineFootprintImporting, setMachineFootprintImporting] = React.useState(false);
    const [machineFootprintFeedback, setMachineFootprintFeedback] = React.useState(emptyFeedback);
    const machineFootprintOptions = React.useMemo(
        () => buildMachineFootprintOptions(machineFootprintCatalog),
        [machineFootprintCatalog],
    );
    const loadMachineFootprints = React.useCallback(async () => {
        setMachineFootprintLoading(true);
        try {
            const response = await apiClient.get(`/bom/machine-footprints`, {
                params: { limit: 5000 },
            });
            const entries = normalizeMachineFootprintCatalogPayload(response.data);
            setMachineFootprintCatalog(entries);
            setMachineFootprintLookup(buildMachineFootprintCatalogLookup(entries));
        } catch (error) {
            setMachineFootprintCatalog([]);
            setMachineFootprintLookup({});
            setMachineFootprintFeedback({
                status: 'error',
                message: error.response?.data?.detail || error.response?.data?.message || error.message || 'Erreur lors du chargement du catalogue MachineFootprint',
                details: [],
            });
        } finally {
            setMachineFootprintLoading(false);
        }
    }, []);
    React.useEffect(() => { loadMachineFootprints(); }, [loadMachineFootprints]);
    const handleMachineFootprintFileSelection = (event) => {
        const nextFile = event.target.files?.[0] || null;
        if (nextFile && !isSupportedMachineFootprintFile(nextFile)) {
            if (machineFootprintFileInputRef.current) {
                machineFootprintFileInputRef.current.value = '';
            }
            setMachineFootprintFile(null);
            setMachineFootprintFeedback({
                status: 'error',
                message: 'Seuls les fichiers texte .txt ou .csv séparés par ; sont supportés pour le catalogue MachineFootprint.',
                details: [],
            });
            return;
        }
        setMachineFootprintFile(nextFile);
    };
    const importMachineFootprints = async () => {
        if (!machineFootprintFile) {
            setMachineFootprintFeedback({
                status: 'error',
                message: 'Choisissez un fichier TXT ou CSV avant de lancer l\'import MachineFootprint.',
                details: [],
            });
            return;
        }
        if (!isSupportedMachineFootprintFile(machineFootprintFile)) {
            setMachineFootprintFeedback({
                status: 'error',
                message: 'Seuls les fichiers texte .txt ou .csv séparés par ; sont supportés pour le catalogue MachineFootprint.',
                details: [],
            });
            return;
        }
        setMachineFootprintImporting(true);
        setMachineFootprintFeedback(emptyFeedback);
        try {
            const formData = new FormData();
            formData.append('file', machineFootprintFile);
            const response = await apiClient.post(`/bom/machine-footprints/import`, formData);
            setMachineFootprintFeedback(buildMachineFootprintImportFeedback(response.data));
            setMachineFootprintFile(null);
            if (machineFootprintFileInputRef.current) {
                machineFootprintFileInputRef.current.value = '';
            }
            await loadMachineFootprints();
        } catch (error) {
            setMachineFootprintFeedback({
                status: 'error',
                message: error.response?.data?.detail || error.response?.data?.message || error.message || "Erreur lors de l'import du catalogue MachineFootprint",
                details: [],
            });
        } finally {
            setMachineFootprintImporting(false);
        }
    };

    return (
        <Stack spacing={3}>
                    {machineFootprintFeedback.status !== 'idle' ? (
                        <Alert severity={machineFootprintFeedback.status} onClose={() => setMachineFootprintFeedback(emptyFeedback)}>
                            <Stack spacing={1}>
                                <span>{machineFootprintFeedback.message}</span>
                                {machineFootprintFeedback.details?.length ? (
                                    <Box component="ul" sx={{ mb: 0, mt: 0, pl: 2.5 }}>
                                        {machineFootprintFeedback.details.slice(0, 5).map((detail) => (
                                            <li key={detail}>{detail}</li>
                                        ))}
                                        {machineFootprintFeedback.details.length > 5 ? <li>{`... ${machineFootprintFeedback.details.length - 5} autre(s) message(s)`}</li> : null}
                                    </Box>
                                ) : null}
                            </Stack>
                        </Alert>
                    ) : null}
                    <Card sx={{ backgroundColor: '#18181b', border: '1px solid #1f2937' }}>
                        <CardContent>
                            <Stack spacing={3}>
                                <Stack direction="row" spacing={1.5} alignItems="center">
                                    <StorageRoundedIcon sx={{ color: '#3b82f6' }} />
                                    <Typography variant="h6">Empreintes machine</Typography>
                                </Stack>
                                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                                    Catalogue MachineFootprint utilisé pour compléter automatiquement les composants (Type, Footprint, Tape width, Pitch, Feeder).
                                </Typography>
                                <Card variant="outlined" sx={{ borderColor: 'var(--border)' }}>
                                    <CardContent sx={{ py: 2 }}>
                                        <Stack spacing={1.5}>
                                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', md: 'center' }}>
                                                <Stack spacing={0.5} sx={{ flexGrow: 1 }}>
                                                    <Typography variant="subtitle1">Catalogue MachineFootprint</Typography>
                                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                                        Importe le tableau `Type;Footprint;Tape_width_mm;Pitch_mm;Feeder` pour completer automatiquement les composants.
                                                    </Typography>
                                                </Stack>
                                                <Chip size="small" variant="outlined" label={`${machineFootprintOptions.length} empreinte(s)`} />
                                                {machineFootprintLoading ? <Chip size="small" color="info" variant="outlined" label="Chargement..." /> : null}
                                            </Stack>
                                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
                                                <Button variant="outlined" startIcon={<UploadFileRoundedIcon />} onClick={() => machineFootprintFileInputRef.current?.click()}>
                                                    Choisir le catalogue
                                                </Button>
                                                <input
                                                    ref={machineFootprintFileInputRef}
                                                    type="file"
                                                    accept=".txt,.csv,text/plain,text/csv"
                                                    onChange={handleMachineFootprintFileSelection}
                                                    style={{ display: 'none' }}
                                                />
                                                <Typography variant="body2" sx={{ color: 'text.secondary', flexGrow: 1 }}>
                                                    {machineFootprintFile
                                                        ? `Fichier sélectionné : ${machineFootprintFile.name}`
                                                        : machineFootprintCatalog.length > 0
                                                            ? `Catalogue actif : ${machineFootprintCatalog.length} empreinte(s) chargée(s) depuis la base de données.`
                                                            : 'Aucun catalogue en base — importez un fichier TXT/CSV pour démarrer.'}
                                                </Typography>
                                                <Button variant="contained" onClick={importMachineFootprints} disabled={machineFootprintImporting || !machineFootprintFile}>
                                                    {machineFootprintImporting ? 'Import en cours...' : 'Importer le catalogue'}
                                                </Button>
                                                <Button variant="text" onClick={loadMachineFootprints} disabled={machineFootprintLoading}>
                                                    Actualiser la liste
                                                </Button>
                                            </Stack>
                                        </Stack>
                                    </CardContent>
                                </Card>
                                <Card variant="outlined" sx={{ borderColor: 'var(--border)' }}>
                                    <CardContent sx={{ py: 2 }}>
                                        <Stack spacing={1.5}>
                                            <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
                                                <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>Empreintes chargées</Typography>
                                                <Chip size="small" variant="outlined" label={`${machineFootprintCatalog.length} entrée(s)`} />
                                                <Button variant="text" size="small" onClick={loadMachineFootprints} disabled={machineFootprintLoading}>
                                                    Actualiser
                                                </Button>
                                            </Stack>
                                            {machineFootprintLoading ? (
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <CircularProgress size={18} />
                                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Chargement du catalogue...</Typography>
                                                </Stack>
                                            ) : !machineFootprintCatalog.length ? (
                                                <Typography variant="body2" sx={{ color: 'text.secondary', py: 1 }}>
                                                    Aucune empreinte en base. Importez un catalogue TXT/CSV ci-dessus pour démarrer.
                                                </Typography>
                                            ) : (
                                                <TableContainer sx={{ ...compactTableContainerSx, maxHeight: 460, overflowY: 'auto' }}>
                                                    <Table stickyHeader sx={compactTableSx}>
                                                        <TableHead>
                                                            <TableRow>
                                                                <TableCell sx={{ width: '32%' }}>Footprint</TableCell>
                                                                <TableCell sx={{ width: '20%' }}>Type</TableCell>
                                                                <TableCell sx={{ width: '16%' }}>Tape (mm)</TableCell>
                                                                <TableCell sx={{ width: '16%' }}>Pitch (mm)</TableCell>
                                                                <TableCell sx={{ width: '16%' }}>Feeder</TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {machineFootprintCatalog.map((entry, index) => (
                                                                <TableRow hover key={`${entry.machine_footprint || 'fp'}-${index}`}>
                                                                    <TableCell sx={compactCellSx}>{entry.machine_footprint || '-'}</TableCell>
                                                                    <TableCell sx={compactCellSx}>{entry.component_type || '-'}</TableCell>
                                                                    <TableCell sx={compactCellSx}>{entry.tape_width_mm ?? '-'}</TableCell>
                                                                    <TableCell sx={compactCellSx}>{entry.pitch_mm ?? '-'}</TableCell>
                                                                    <TableCell sx={compactCellSx}>{entry.feeder_type || '-'}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            )}
                                        </Stack>
                                    </CardContent>
                                </Card>
                            </Stack>
                        </CardContent>
                    </Card>
        </Stack>
    );
}

export default EmpreintesPanel;
