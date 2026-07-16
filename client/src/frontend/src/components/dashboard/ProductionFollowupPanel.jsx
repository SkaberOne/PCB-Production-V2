import React from 'react';
import {
    Box,
    Card,
    CardContent,
    IconButton,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import apiClient from '../../api/client';
import useEventStream from '../../hooks/useEventStream';
import { compactCellSx, compactTableContainerSx, compactTableSx } from '../../utils/compactTable';

function fmtDate(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
    } catch (_) {
        return '—';
    }
}

const FIELDS = ['cards_tested', 'cards_validated', 'cards_to_debug', 'followup_note'];

/**
 * Barre de progression du suivi : sur le total produit, part **validée** (vert),
 * **à débugger** (orange), **testée en attente** (bleu = testées − validées − à
 * débugger), le reste **non testée** (fond gris). Reflète les 3 compteurs.
 */
function SuiviBar({ produced, tested, validated, toDebug }) {
    const p = Math.max(Number(produced) || 0, 0);
    const t = Math.max(Number(tested) || 0, 0);
    const v = Math.max(Number(validated) || 0, 0);
    const d = Math.max(Number(toDebug) || 0, 0);
    const base = Math.max(p, v + d, t);
    const pending = Math.max(t - v - d, 0);
    const pct = (n) => (base > 0 ? `${(n / base) * 100}%` : '0%');
    return (
        <Tooltip
            arrow
            title={`Validées ${v} · À débugger ${d} · Testées ${t} / produites ${p}`}
        >
            <Box sx={{ display: 'flex', width: 130, height: 9, borderRadius: 5, overflow: 'hidden', bgcolor: '#3f3f46' }}>
                <Box sx={{ width: pct(v), bgcolor: '#22c55e' }} />
                <Box sx={{ width: pct(d), bgcolor: '#f59e0b' }} />
                <Box sx={{ width: pct(pending), bgcolor: '#3b82f6' }} />
            </Box>
        </Tooltip>
    );
}

function draftFrom(p) {
    return {
        cards_tested: String(p.cards_tested ?? 0),
        cards_validated: String(p.cards_validated ?? 0),
        cards_to_debug: String(p.cards_to_debug ?? 0),
        followup_note: p.followup_note || '',
    };
}

/**
 * « Suivi des productions terminées » : liste toutes les productions terminées
 * (cartes produites + date de fin) avec, saisis à la main, les compteurs
 * testées / validées / à débugger et une note. Sauvegarde par ligne.
 */
function ProductionFollowupPanel() {
    const [rows, setRows] = React.useState(null);
    const [drafts, setDrafts] = React.useState({});
    const [busy, setBusy] = React.useState(null);
    const [error, setError] = React.useState(null);

    const load = React.useCallback(async (silent = false) => {
        if (!silent) setError(null);
        try {
            const res = await apiClient.get('/reports/productions-history?limit=500');
            const list = Array.isArray(res.data) ? res.data : [];
            setRows(list);
            setDrafts((prev) => {
                const next = { ...prev };
                list.forEach((p) => { if (!next[p.id]) next[p.id] = draftFrom(p); });
                return next;
            });
        } catch (err) {
            if (!silent) setError(err?.response?.data?.detail || 'Suivi indisponible.');
            setRows([]);
        }
    }, []);

    React.useEffect(() => { load(); }, [load]);
    useEventStream('stock', React.useCallback(() => { load(true); }, [load]));

    const setField = (id, field) => (e) => {
        const value = e.target.value;
        setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    };

    const changed = (p) => {
        const d = drafts[p.id];
        if (!d) return false;
        return FIELDS.some((f) => String(d[f]) !== String(draftFrom(p)[f]));
    };

    const save = async (p) => {
        const d = drafts[p.id];
        if (!d) return;
        setBusy(p.id);
        setError(null);
        try {
            await apiClient.patch(`/marketplace/productions/${p.id}/followup`, {
                cards_tested: Number(d.cards_tested) || 0,
                cards_validated: Number(d.cards_validated) || 0,
                cards_to_debug: Number(d.cards_to_debug) || 0,
                note: d.followup_note.trim() || null,
            });
            await load(true);
        } catch (err) {
            setError(err?.response?.data?.detail || 'Enregistrement impossible.');
        } finally {
            setBusy(null);
        }
    };

    return (
        <Card sx={{ backgroundColor: '#18181b', border: '1px solid #1f2937' }}>
            <CardContent>
                <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }}>
                    <Typography variant="h6" sx={{ flexGrow: 1, color: '#f4f4f5', fontWeight: 600 }}>
                        Suivi des productions terminées
                    </Typography>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        {[
                            ['#22c55e', 'Validées'],
                            ['#f59e0b', 'À débugger'],
                            ['#3b82f6', 'Testées'],
                            ['#3f3f46', 'Non testées'],
                        ].map(([c, label]) => (
                            <Stack key={label} direction="row" spacing={0.5} alignItems="center">
                                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c }} />
                                <Typography variant="caption" sx={{ color: '#a1a1aa' }}>{label}</Typography>
                            </Stack>
                        ))}
                    </Stack>
                </Stack>

                {error ? <Typography variant="body2" sx={{ color: '#f87171', mb: 1 }}>{error}</Typography> : null}

                {rows === null ? (
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>Chargement…</Typography>
                ) : rows.length === 0 ? (
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>Aucune production terminée pour l'instant.</Typography>
                ) : (
                    <TableContainer sx={{ ...compactTableContainerSx, maxHeight: 420 }}>
                        <Table sx={compactTableSx} size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={compactCellSx}>Production</TableCell>
                                    <TableCell sx={compactCellSx}>Date de fin</TableCell>
                                    <TableCell sx={compactCellSx} align="right">Produites</TableCell>
                                    <TableCell sx={compactCellSx} align="center">Testées</TableCell>
                                    <TableCell sx={compactCellSx} align="center">Validées</TableCell>
                                    <TableCell sx={compactCellSx} align="center">À débugger</TableCell>
                                    <TableCell sx={compactCellSx} align="center">Progression</TableCell>
                                    <TableCell sx={compactCellSx}>Note</TableCell>
                                    <TableCell sx={compactCellSx} align="center"> </TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.map((p) => {
                                    const d = drafts[p.id] || draftFrom(p);
                                    const num = (field) => (
                                        <TextField
                                            size="small"
                                            type="number"
                                            value={d[field]}
                                            onChange={setField(p.id, field)}
                                            inputProps={{ min: 0, style: { textAlign: 'center', width: 48 } }}
                                            variant="standard"
                                        />
                                    );
                                    return (
                                        <TableRow key={p.id}>
                                            <TableCell sx={compactCellSx}>{p.name}</TableCell>
                                            <TableCell sx={{ ...compactCellSx, color: '#a1a1aa' }}>{fmtDate(p.date_fin)}</TableCell>
                                            <TableCell sx={{ ...compactCellSx, color: '#a1a1aa' }} align="right">{p.boards_produced}</TableCell>
                                            <TableCell sx={compactCellSx} align="center">{num('cards_tested')}</TableCell>
                                            <TableCell sx={compactCellSx} align="center">{num('cards_validated')}</TableCell>
                                            <TableCell sx={compactCellSx} align="center">{num('cards_to_debug')}</TableCell>
                                            <TableCell sx={compactCellSx} align="center">
                                                <SuiviBar
                                                    produced={p.boards_produced}
                                                    tested={d.cards_tested}
                                                    validated={d.cards_validated}
                                                    toDebug={d.cards_to_debug}
                                                />
                                            </TableCell>
                                            <TableCell sx={compactCellSx}>
                                                <TextField
                                                    size="small"
                                                    value={d.followup_note}
                                                    onChange={setField(p.id, 'followup_note')}
                                                    placeholder="ex. C3 HS…"
                                                    variant="standard"
                                                    sx={{ minWidth: 160 }}
                                                    inputProps={{ maxLength: 1000 }}
                                                />
                                            </TableCell>
                                            <TableCell sx={compactCellSx} align="center">
                                                <IconButton
                                                    size="small"
                                                    color="success"
                                                    title="Enregistrer"
                                                    disabled={!changed(p) || busy === p.id}
                                                    onClick={() => save(p)}
                                                >
                                                    <CheckRoundedIcon fontSize="small" />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </CardContent>
        </Card>
    );
}

export default ProductionFollowupPanel;
