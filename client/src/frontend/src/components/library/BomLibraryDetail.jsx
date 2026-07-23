import React from 'react';
import { useNavigate } from 'react-router-dom';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import LabelRoundedIcon from '@mui/icons-material/LabelRounded';
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Divider,
    IconButton,
    MenuItem,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
} from '@mui/material';
import { formatStoredBomDate } from '../../utils/bomFileExplorer';
import RevisionGroupRow from './RevisionGroupRow';

const cardSx = {
    backgroundColor: '#18181b',
    border: '1px solid #27272a',
    height: '100%',
};

const cellSx = {
    fontSize: '0.875rem',
    py: 1.25,
    px: 1.5,
    borderBottom: '1px solid #27272a',
};

const headCellSx = {
    ...cellSx,
    color: '#a1a1aa',
    fontWeight: 600,
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    backgroundColor: '#18181b',
};

/**
 * Panneau de détail d'une référence BOM sélectionnée.
 * Affiche la méta + la table des révisions/faces avec actions.
 */
function BomLibraryDetail({
    referenceNode,
    categoryName,
    availableCategories = [],
    onCategoryChange,
    onDeleteRevision,
    onReload,
}) {
    const navigate = useNavigate();

    const [openRevs, setOpenRevs] = React.useState(() => new Set());
    const toggleRev = (key) => setOpenRevs((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });


    if (!referenceNode) {
        return (
            <Card sx={cardSx}>
                <CardContent sx={{ p: 5, textAlign: 'center' }}>
                    <Typography variant="body1" sx={{ color: '#71717a', mb: 0.5 }}>
                        Aucune référence sélectionnée
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#52525b' }}>
                        Choisis une référence BOM dans le panneau de gauche pour voir ses révisions.
                    </Typography>
                </CardContent>
            </Card>
        );
    }

    const allItems = (referenceNode.revisions || []).flatMap((rev) => rev.items || []);
    const totalRevisions = referenceNode.revisions?.length || 0;
    const totalSides = allItems.length;
    const lastImport = allItems.reduce((latest, item) => {
        const ts = item?.created_at ? new Date(item.created_at).getTime() : 0;
        return ts > latest ? ts : latest;
    }, 0);

    const handleOpenRevision = (item) => {
        navigate(`/bom?revision=${item.bom_revision_id}`);
    };

    return (
        <>
        <Card sx={cardSx}>
            <CardContent sx={{ p: 3 }}>
                {/* Header méta de la référence */}
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="h5" sx={{ color: '#f4f4f5', fontWeight: 700, mb: 0.5 }}>
                            {referenceNode.reference}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                            {categoryName} · {totalRevisions} révision{totalRevisions > 1 ? 's' : ''} · {totalSides} fichier{totalSides > 1 ? 's' : ''}
                        </Typography>
                    </Box>
                    {availableCategories.length > 0 && (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <LabelRoundedIcon sx={{ color: '#71717a', fontSize: 18 }} />
                            <Select
                                size="small"
                                value={categoryName || ''}
                                onChange={(e) => onCategoryChange?.(referenceNode.bomReferenceId, e.target.value)}
                                sx={{
                                    minWidth: 180,
                                    backgroundColor: '#18181b',
                                    fontSize: '0.875rem',
                                    '& .MuiSelect-select': { py: 0.75 },
                                }}
                            >
                                {availableCategories.map((cat) => (
                                    <MenuItem key={cat} value={cat}>
                                        {cat}
                                    </MenuItem>
                                ))}
                            </Select>
                        </Stack>
                    )}
                </Stack>

                <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
                    <Chip
                        size="small"
                        label={`${totalRevisions} révision${totalRevisions > 1 ? 's' : ''}`}
                        sx={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981', fontWeight: 500 }}
                    />
                    <Chip
                        size="small"
                        label={categoryName || 'Sans catégorie'}
                        sx={{ backgroundColor: '#27272a', color: '#a1a1aa' }}
                    />
                    {lastImport > 0 && (
                        <Chip
                            size="small"
                            label={`Dernier import : ${new Date(lastImport).toLocaleDateString('fr-FR')}`}
                            sx={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa' }}
                        />
                    )}
                </Stack>

                <Divider sx={{ my: 2.5, borderColor: '#27272a' }} />

                {/* Table des révisions */}
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ ...headCellSx, width: 44 }} />
                                <TableCell sx={headCellSx}>Révision</TableCell>
                                <TableCell sx={headCellSx}>Faces</TableCell>
                                <TableCell sx={headCellSx}>Dernier import</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {(referenceNode.revisions || []).map((revGroup, gIdx) => (
                                <RevisionGroupRow
                                    key={revGroup.revision != null ? String(revGroup.revision) + '-' + gIdx : gIdx}
                                    revGroup={revGroup}
                                    open={openRevs.has(gIdx)}
                                    onToggle={() => toggleRev(gIdx)}
                                    onOpenRevision={handleOpenRevision}
                                    onDeleteRevision={onDeleteRevision}
                                />
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </CardContent>
        </Card>
        </>
    );
}

export default BomLibraryDetail;
