import React from 'react';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded';
import {
    Box,
    Button,
    Chip,
    Collapse,
    IconButton,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Tooltip,
} from '@mui/material';
import { formatStoredBomDate } from '../../utils/bomFileExplorer';
import { formatRevisionLabel } from '../../utils/revision';

const cellSx = { borderColor: '#27272a', fontSize: '0.8rem', py: 1 };
const subHeadSx = { borderColor: '#27272a', color: '#71717a', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' };

function sideChip(side) {
    return (
        <Chip
            size="small"
            label={side || '—'}
            sx={{
                backgroundColor: side === 'TOP' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                color: side === 'TOP' ? '#fbbf24' : '#60a5fa',
                fontWeight: 500,
                minWidth: 56,
            }}
        />
    );
}

/**
 * Une révision = une ligne repliée (« Rev. X » + faces présentes + date la plus
 * récente + chevron). Au clic, un Collapse révèle le détail par face (statut,
 * date, Ouvrir / Supprimer). Le contenu reste monté (pas d'unmountOnExit) pour
 * rester accessible/testable même replié. (Prompt 019.)
 */
function RevisionGroupRow({ revGroup, open, onToggle, onOpenRevision, onDeleteRevision }) {
    const items = revGroup.items || [];
    const sides = items.map((it) => it.side).filter(Boolean);
    const hasTop = sides.includes('TOP');
    const hasBot = sides.includes('BOT');
    const lastDate = items.reduce((acc, it) => {
        const t = it.created_at ? Date.parse(it.created_at) : NaN;
        return Number.isNaN(t) ? acc : Math.max(acc, t);
    }, 0);

    return (
        <>
            <TableRow
                hover
                onClick={onToggle}
                sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'rgba(255,255,255,0.04)' } }}
            >
                <TableCell sx={{ ...cellSx, width: 44 }}>
                    <IconButton size="small" sx={{ color: '#a1a1aa' }}>
                        {open ? <KeyboardArrowUpRoundedIcon fontSize="small" /> : <KeyboardArrowDownRoundedIcon fontSize="small" />}
                    </IconButton>
                </TableCell>
                <TableCell sx={{ ...cellSx, color: '#f4f4f5', fontWeight: 600 }}>
                    {formatRevisionLabel(revGroup.revision)}
                </TableCell>
                <TableCell sx={cellSx}>
                    <Stack direction="row" spacing={0.5}>
                        {hasTop ? sideChip('TOP') : null}
                        {hasBot ? sideChip('BOT') : null}
                        {!hasTop && !hasBot ? <Box component="span" sx={{ color: '#71717a' }}>—</Box> : null}
                    </Stack>
                </TableCell>
                <TableCell sx={{ ...cellSx, color: '#a1a1aa' }}>
                    {lastDate ? formatStoredBomDate(new Date(lastDate).toISOString()) : '—'}
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell colSpan={4} sx={{ py: 0, border: 0 }}>
                    <Collapse in={open} timeout="auto">
                        <Box sx={{ m: 1, ml: 5, backgroundColor: 'rgba(255,255,255,0.015)', borderRadius: 1 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={subHeadSx}>Face</TableCell>
                                        <TableCell sx={subHeadSx}>Statut</TableCell>
                                        <TableCell sx={subHeadSx}>Importée le</TableCell>
                                        <TableCell sx={{ ...subHeadSx, textAlign: 'right' }}>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {items.map((item, iIdx) => (
                                        <TableRow key={item.bom_revision_id + '-' + item.side + '-' + iIdx}>
                                            <TableCell sx={cellSx}>{sideChip(item.side)}</TableCell>
                                            <TableCell sx={cellSx}>
                                                <Chip
                                                    size="small"
                                                    label={item.status || 'DRAFT'}
                                                    sx={{
                                                        backgroundColor: item.status === 'VALIDATED' ? 'rgba(16, 185, 129, 0.12)' : '#27272a',
                                                        color: item.status === 'VALIDATED' ? '#10b981' : '#a1a1aa',
                                                        fontWeight: 500,
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell sx={{ ...cellSx, color: '#a1a1aa' }}>
                                                {formatStoredBomDate(item.created_at)}
                                            </TableCell>
                                            <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                    <Tooltip title="Ouvrir dans la Revue BOM">
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            startIcon={<OpenInNewRoundedIcon sx={{ fontSize: 16 }} />}
                                                            onClick={() => onOpenRevision(item)}
                                                            sx={{ minWidth: 92, fontSize: '0.75rem' }}
                                                        >
                                                            Ouvrir
                                                        </Button>
                                                    </Tooltip>
                                                    <Tooltip title="Supprimer cette révision">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => onDeleteRevision?.(item)}
                                                            sx={{ color: '#a1a1aa', '&:hover': { color: '#ef4444' } }}
                                                        >
                                                            <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </>
    );
}

export default RevisionGroupRow;
