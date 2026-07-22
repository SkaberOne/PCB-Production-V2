import React, { useCallback, useRef, useState } from 'react';
import CreateNewFolderRoundedIcon from '@mui/icons-material/CreateNewFolderRounded';
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import {
    Alert,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { useBomSession } from '../../context/BomSessionContext';

/** Extension d'un nom de fichier (extensions composées KiCad prioritaires). */
export function extensionOf(name) {
    const lower = String(name || '').toLowerCase();
    if (lower.endsWith('.kicad_pcb')) return '.kicad_pcb';
    if (lower.endsWith('.kicad_sch')) return '.kicad_sch';
    const dot = lower.lastIndexOf('.');
    return dot >= 0 ? lower.slice(dot) : '';
}

/** Détection CAO côté client (miroir de services/cao/detect). Eagle prioritaire. */
export function detectCao(fileList) {
    const tagged = Array.from(fileList || []).map((file) => ({ file, ext: extensionOf(file.name) }));
    const pick = (ext) => tagged.find((entry) => entry.ext === ext) || null;

    const eagleBoard = pick('.brd');
    const eagleSch = pick('.sch');
    if (eagleBoard) {
        return {
            kind: 'eagle',
            supported: true,
            board: eagleBoard,
            schematic: eagleSch,
            message: eagleSch ? null : 'Schéma .sch absent : les MPN ne seront pas enrichis.',
            caoFiles: [eagleBoard, eagleSch].filter(Boolean),
        };
    }

    const kicadBoard = pick('.kicad_pcb');
    const kicadSch = pick('.kicad_sch');
    if (kicadBoard) {
        return {
            kind: 'kicad',
            supported: false,
            board: kicadBoard,
            schematic: kicadSch,
            message: 'Support KiCad à venir (parseur non implémenté).',
            caoFiles: [kicadBoard, kicadSch].filter(Boolean),
        };
    }
    return null;
}

function inferReference(fileName) {
    const base = String(fileName || '').split(/[\\/]/).pop() || '';
    return base.replace(/\.[^.]+$/, '').trim();
}

/**
 * Import CAO par dossier : sélection d'un dossier carte, auto-détection des
 * fichiers CAO, envoi à `/bom/import-cao`, puis bascule vers la Revue peuplée.
 * KiCad est reconnu mais reporté (« support à venir »).
 */
function CaoFolderImport() {
    const navigate = useNavigate();
    const {
        setSelectedBomEntries,
        setImportedBom,
        activeProduction,
        setActiveProduction,
    } = useBomSession();

    const inputRef = useRef(null);
    const [detection, setDetection] = useState(null);
    const [reference, setReference] = useState('');
    const [revision, setRevision] = useState('REV_A');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState({ message: '', type: 'info' });
    const [result, setResult] = useState(null);

    const handleFolderChange = useCallback((event) => {
        setResult(null);
        setFeedback({ message: '', type: 'info' });
        const detected = detectCao(event.target.files);
        setDetection(detected);
        if (!detected) {
            setFeedback({
                message: 'Aucun fichier CAO reconnu (.brd/.sch ou .kicad_pcb/.kicad_sch).',
                type: 'error',
            });
        } else {
            setReference((current) => current.trim() || inferReference(detected.board.file.name));
            if (detected.message) {
                setFeedback({ message: detected.message, type: detected.supported ? 'warning' : 'info' });
            }
        }
        // Réinitialise pour permettre de re-sélectionner le même dossier.
        event.target.value = '';
    }, []);

    const canImport = Boolean(detection?.supported) && reference.trim() && revision.trim() && !loading;

    const handleImport = useCallback(async () => {
        if (!detection?.supported) return;
        setLoading(true);
        setFeedback({ message: '', type: 'info' });
        setResult(null);
        try {
            const formData = new FormData();
            detection.caoFiles.forEach((entry) => formData.append('files', entry.file, entry.file.name));

            const response = await apiClient.post('/bom/import-cao', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                params: {
                    reference: reference.trim(),
                    revision: revision.trim(),
                    name: name.trim() || undefined,
                },
            });

            const payload = response.data;
            if (!payload?.success) {
                setFeedback({ message: payload?.message || 'Import CAO non abouti.', type: 'warning' });
                return;
            }
            setResult(payload);
            setFeedback({ message: payload.message, type: 'success' });
        } catch (error) {
            setFeedback({
                message: error.response?.data?.detail || error.message || "Erreur lors de l'import CAO.",
                type: 'error',
            });
        } finally {
            setLoading(false);
        }
    }, [detection, reference, revision, name]);

    const handleOpenReview = useCallback(async () => {
        const entries = result?.revisions || [];
        if (!entries.length) return;
        setSelectedBomEntries(entries);
        setImportedBom(entries[0]);

        if (activeProduction?.id) {
            try {
                const attach = await apiClient.post(
                    `/marketplace/productions/${activeProduction.id}/bom-revisions`,
                    { bom_revision_ids: entries.map((entry) => entry.bom_revision_id).filter(Boolean) },
                );
                setActiveProduction(attach.data);
            } catch (error) {
                // Rattachement best-effort : la Revue reste accessible sans production.
            }
        }
        navigate('/bom');
    }, [result, activeProduction, setSelectedBomEntries, setImportedBom, setActiveProduction, navigate]);

    return (
        <Card sx={{ backgroundColor: '#18181b', border: '1px solid #27272a' }}>
            <CardContent>
                <Stack spacing={2.5}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <MemoryRoundedIcon sx={{ color: '#a1a1aa' }} />
                        <Typography variant="h6" sx={{ color: '#f4f4f5', fontWeight: 600 }}>
                            Import CAO par dossier
                        </Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                        Sélectionne le dossier de la carte : les fichiers CAO (Eagle .brd/.sch)
                        sont détectés automatiquement, puis la BOM + le centroïde alimentent la Revue.
                    </Typography>

                    <input
                        ref={(node) => {
                            inputRef.current = node;
                            if (node) {
                                node.webkitdirectory = true;
                                node.directory = true;
                            }
                        }}
                        type="file"
                        multiple
                        data-testid="cao-folder-input"
                        style={{ display: 'none' }}
                        onChange={handleFolderChange}
                    />

                    <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                        <Button
                            variant="outlined"
                            startIcon={<CreateNewFolderRoundedIcon />}
                            onClick={() => inputRef.current?.click()}
                        >
                            Choisir un dossier
                        </Button>
                        {detection && (
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Chip
                                    size="small"
                                    color={detection.supported ? 'success' : 'default'}
                                    label={`Type : ${detection.kind}`}
                                />
                                <Chip size="small" variant="outlined" label={`Carte : ${detection.board.file.name}`} />
                                <Chip
                                    size="small"
                                    variant="outlined"
                                    label={detection.schematic ? `Schéma : ${detection.schematic.file.name}` : 'Schéma : absent'}
                                />
                            </Stack>
                        )}
                    </Stack>

                    {feedback.message && (
                        <Alert severity={feedback.type} onClose={() => setFeedback({ message: '', type: 'info' })}>
                            {feedback.message}
                        </Alert>
                    )}

                    {detection?.supported && (
                        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                            <TextField
                                size="small"
                                label="Référence carte"
                                value={reference}
                                onChange={(event) => setReference(event.target.value)}
                                inputProps={{ 'data-testid': 'cao-reference' }}
                            />
                            <TextField
                                size="small"
                                label="Révision"
                                value={revision}
                                onChange={(event) => setRevision(event.target.value)}
                            />
                            <TextField
                                size="small"
                                label="Nom (optionnel)"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                            />
                        </Stack>
                    )}

                    {result?.success ? (
                        <Stack spacing={1.5}>
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                                    Faces importées :
                                </Typography>
                                {result.revisions.map((rev) => (
                                    <Chip
                                        key={rev.bom_revision_id}
                                        size="small"
                                        color="primary"
                                        label={`${rev.side} · ${rev.item_count} comp.`}
                                    />
                                ))}
                            </Stack>
                            <Button
                                variant="contained"
                                data-testid="cao-open-review"
                                onClick={handleOpenReview}
                            >
                                Ouvrir la Revue peuplée
                            </Button>
                        </Stack>
                    ) : (
                        <Button
                            variant="contained"
                            disabled={!canImport}
                            onClick={handleImport}
                            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
                            data-testid="cao-import"
                        >
                            {loading ? 'Import en cours…' : 'Importer le dossier CAO'}
                        </Button>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
}

export default CaoFolderImport;
