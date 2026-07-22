import React, { useCallback, useRef, useState } from 'react';
import CreateNewFolderRoundedIcon from '@mui/icons-material/CreateNewFolderRounded';
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import {
    Alert,
    Box,
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
import { detectCao, extensionOf } from '../../utils/caoDetect';
import { parseCardTree } from '../../utils/cardTree';
import { walkDropEntries } from '../../utils/dropEntries';
import CaoImportReport from './CaoImportReport';

// Ré-export pour compat (tests 006 importent depuis ce module).
export { detectCao, extensionOf };

function inferReference(fileName) {
    const base = String(fileName || '').split(/[\\/]/).pop() || '';
    return base.replace(/\.[^.]+$/, '').trim();
}

/** Ensemble « REFERENCE__REVISION » des révisions déjà en base. */
async function fetchExistingRevisions(reference) {
    try {
        const response = await apiClient.get('/bom/files', { params: { sort: 'alpha' } });
        const items = response.data?.items || response.data || [];
        const wanted = String(reference || '').trim().toUpperCase();
        const set = new Set();
        items.forEach((item) => {
            const ref = String(item.reference || '').trim().toUpperCase();
            const rev = String(item.revision || '').trim().toUpperCase();
            if (ref && rev && (!wanted || ref === wanted)) set.add(`${ref}__${rev}`);
        });
        return set;
    } catch (error) {
        return new Set(); // best-effort : sans info, on tente l'import (l'endpoint reste idempotent côté ré-import).
    }
}

/**
 * Import CAO par **dossier carte** (prompt 012) : glisser-déposer d'un dossier
 * `KT<réf> - <nom>/Rev.X/Conception/…`, extraction auto réf/nom/révisions, import
 * de toutes les révisions Eagle absentes via `/bom/import-cao`. Fallback 006 :
 * dossier non conforme → détection simple + champs éditables. KiCad = « à venir ».
 */
function CaoFolderImport() {
    const navigate = useNavigate();
    const { setSelectedBomEntries, setImportedBom, activeProduction, setActiveProduction } = useBomSession();

    const inputRef = useRef(null);
    const [dragActive, setDragActive] = useState(false);
    const [tree, setTree] = useState(null);      // arbo conforme { reference, name, revisions }
    const [single, setSingle] = useState(null);  // fallback 006 : { detection, reference, revision, name }
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState({ message: '', type: 'info' });
    const [report, setReport] = useState(null);
    const [reviewEntries, setReviewEntries] = useState([]);

    const resetOutputs = () => {
        setReport(null);
        setReviewEntries([]);
        setFeedback({ message: '', type: 'info' });
    };

    const ingestEntries = useCallback((entries) => {
        resetOutputs();
        const parsed = parseCardTree(entries);
        if (parsed.conform) {
            setSingle(null);
            setTree(parsed);
            return;
        }
        // Fallback 006 : détection simple sur l'ensemble des fichiers.
        setTree(null);
        const files = entries.map((entry) => entry.file || entry).filter(Boolean);
        const detection = detectCao(files);
        if (!detection) {
            setSingle(null);
            setFeedback({ message: 'Aucun fichier CAO reconnu (.brd/.sch ou .kicad_pcb/.kicad_sch).', type: 'error' });
            return;
        }
        setSingle({
            detection,
            reference: inferReference(detection.board.file.name),
            revision: 'REV_A',
            name: '',
        });
        if (detection.message) {
            setFeedback({ message: detection.message, type: detection.supported ? 'warning' : 'info' });
        }
    }, []);

    const handleFolderChange = useCallback((event) => {
        const entries = Array.from(event.target.files || []).map((file) => ({ file, path: file.webkitRelativePath || file.name }));
        ingestEntries(entries);
        event.target.value = '';
    }, [ingestEntries]);

    const handleDrop = useCallback(async (event) => {
        event.preventDefault();
        setDragActive(false);
        const items = event.dataTransfer?.items;
        if (!items || !items.length) return;
        setLoading(true);
        try {
            const entries = await walkDropEntries(items);
            ingestEntries(entries);
        } catch (error) {
            setFeedback({ message: "Lecture du dossier déposé impossible.", type: 'error' });
        } finally {
            setLoading(false);
        }
    }, [ingestEntries]);

    const importOneRevision = useCallback(async (reference, name, revision, caoFiles) => {
        const formData = new FormData();
        caoFiles.forEach((file) => formData.append('files', file, file.name));
        const response = await apiClient.post('/bom/import-cao', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            params: { reference, revision, name: name || undefined },
        });
        return response.data;
    }, []);

    const runTreeImport = useCallback(async () => {
        if (!tree) return;
        setLoading(true);
        resetOutputs();
        try {
            const existing = await fetchExistingRevisions(tree.reference);
            const rows = [];
            const entries = [];
            for (const rev of tree.revisions) {
                const key = `${tree.reference.toUpperCase()}__${rev.revision.toUpperCase()}`;
                if (existing.has(key)) {
                    rows.push({ revision: rev.revision, status: 'ignored' });
                } else if (rev.kind === 'kicad') {
                    rows.push({ revision: rev.revision, status: 'kicad' });
                } else if (!rev.caoFiles.length || !rev.supported) {
                    rows.push({ revision: rev.revision, status: 'empty' });
                } else {
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        const payload = await importOneRevision(tree.reference, tree.name, rev.revision, rev.caoFiles);
                        if (payload?.success) {
                            (payload.revisions || []).forEach((entry) => entries.push(entry));
                            const comps = (payload.revisions || []).reduce((sum, r) => sum + (r.item_count || 0), 0);
                            rows.push({ revision: rev.revision, status: 'imported', message: `${comps} comp.` });
                        } else {
                            rows.push({ revision: rev.revision, status: 'kicad', message: payload?.message });
                        }
                    } catch (error) {
                        rows.push({ revision: rev.revision, status: 'error', message: error.response?.data?.detail || error.message });
                    }
                }
            }
            setReviewEntries(entries);
            setReport({ reference: tree.reference, name: tree.name, rows });
            const importedCount = rows.filter((r) => r.status === 'imported').length;
            setFeedback({
                message: `${importedCount} révision(s) importée(s) sur ${rows.length}.`,
                type: importedCount ? 'success' : 'info',
            });
        } finally {
            setLoading(false);
        }
    }, [tree, importOneRevision]);

    const runSingleImport = useCallback(async () => {
        if (!single?.detection?.supported) return;
        setLoading(true);
        resetOutputs();
        try {
            const payload = await importOneRevision(
                single.reference.trim(),
                single.name.trim(),
                single.revision.trim(),
                single.detection.caoFiles.map((entry) => entry.file),
            );
            if (!payload?.success) {
                setFeedback({ message: payload?.message || 'Import CAO non abouti.', type: 'warning' });
                return;
            }
            setReviewEntries(payload.revisions || []);
            setReport({
                reference: single.reference.trim(),
                name: single.name.trim(),
                rows: [{ revision: single.revision.trim(), status: 'imported', message: payload.message }],
            });
            setFeedback({ message: payload.message, type: 'success' });
        } catch (error) {
            setFeedback({ message: error.response?.data?.detail || error.message || "Erreur lors de l'import CAO.", type: 'error' });
        } finally {
            setLoading(false);
        }
    }, [single, importOneRevision]);

    const handleOpenReview = useCallback(async () => {
        if (!reviewEntries.length) return;
        setSelectedBomEntries(reviewEntries);
        setImportedBom(reviewEntries[0]);
        if (activeProduction?.id) {
            try {
                const attach = await apiClient.post(`/marketplace/productions/${activeProduction.id}/bom-revisions`, {
                    bom_revision_ids: reviewEntries.map((entry) => entry.bom_revision_id).filter(Boolean),
                });
                setActiveProduction(attach.data);
            } catch (error) { /* rattachement best-effort */ }
        }
        navigate('/bom');
    }, [reviewEntries, activeProduction, setSelectedBomEntries, setImportedBom, setActiveProduction, navigate]);

    const canReview = reviewEntries.length > 0;

    return (
        <Card sx={{ backgroundColor: '#18181b', border: '1px solid #27272a' }}>
            <CardContent>
                <Stack spacing={2.5}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <MemoryRoundedIcon sx={{ color: '#a1a1aa' }} />
                        <Typography variant="h6" sx={{ color: '#f4f4f5', fontWeight: 600 }}>Import CAO par dossier</Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                        Dépose le dossier carte <code>KT… - …/Rev.X/Conception/</code> (ou utilise le bouton).
                        Référence, nom et révisions sont extraits de l'arborescence ; les révisions Eagle absentes sont importées.
                    </Typography>

                    <Box
                        data-testid="cao-dropzone"
                        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={handleDrop}
                        sx={{
                            border: '1.5px dashed', borderColor: dragActive ? '#10b981' : '#3f3f46',
                            backgroundColor: dragActive ? 'rgba(16,185,129,0.06)' : 'transparent',
                            borderRadius: 2, p: 3, textAlign: 'center', transition: 'all .12s',
                        }}
                    >
                        <Typography variant="body2" sx={{ color: dragActive ? '#10b981' : '#a1a1aa' }}>
                            Glisse-dépose ici le dossier de la carte
                        </Typography>
                    </Box>

                    <input
                        ref={(node) => { inputRef.current = node; if (node) { node.webkitdirectory = true; node.directory = true; } }}
                        type="file" multiple data-testid="cao-folder-input" style={{ display: 'none' }} onChange={handleFolderChange}
                    />

                    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Button variant="outlined" startIcon={<CreateNewFolderRoundedIcon />} onClick={() => inputRef.current?.click()}>
                            Choisir un dossier
                        </Button>
                        {tree ? (
                            <Chip size="small" color="success" data-testid="cao-tree-summary"
                                label={`${tree.reference} — ${tree.revisions.length} révision(s)`} />
                        ) : null}
                        {single?.detection ? (
                            <Chip size="small" color={single.detection.supported ? 'success' : 'default'} label={`Type : ${single.detection.kind}`} />
                        ) : null}
                    </Stack>

                    {feedback.message ? (
                        <Alert severity={feedback.type} onClose={() => setFeedback({ message: '', type: 'info' })}>{feedback.message}</Alert>
                    ) : null}

                    {tree && !report ? (
                        <Stack spacing={1.5}>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                {tree.revisions.map((rev) => (
                                    <Chip key={rev.revision} size="small" variant="outlined"
                                        label={`Rev.${rev.revision} · ${rev.kind || 'aucun CAO'}`} />
                                ))}
                            </Stack>
                            <Button variant="contained" data-testid="cao-import-tree" disabled={loading}
                                onClick={runTreeImport} startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}>
                                {loading ? 'Import en cours…' : 'Importer les révisions absentes'}
                            </Button>
                        </Stack>
                    ) : null}

                    {single && !report ? (
                        <Stack spacing={1.5}>
                            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                                <TextField size="small" label="Référence carte" value={single.reference}
                                    onChange={(e) => setSingle((s) => ({ ...s, reference: e.target.value }))}
                                    inputProps={{ 'data-testid': 'cao-reference' }} />
                                <TextField size="small" label="Révision" value={single.revision}
                                    onChange={(e) => setSingle((s) => ({ ...s, revision: e.target.value }))} />
                                <TextField size="small" label="Nom (optionnel)" value={single.name}
                                    onChange={(e) => setSingle((s) => ({ ...s, name: e.target.value }))} />
                            </Stack>
                            <Button variant="contained" data-testid="cao-import"
                                disabled={!single.detection.supported || !single.reference.trim() || !single.revision.trim() || loading}
                                onClick={runSingleImport} startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}>
                                {loading ? 'Import en cours…' : 'Importer le dossier CAO'}
                            </Button>
                        </Stack>
                    ) : null}

                    {report ? <CaoImportReport report={report} canReview={canReview} onOpenReview={handleOpenReview} /> : null}
                </Stack>
            </CardContent>
        </Card>
    );
}

export default CaoFolderImport;
