import React from 'react';
import ArchiveRoundedIcon from '@mui/icons-material/ArchiveRounded';
import BackHandRoundedIcon from '@mui/icons-material/BackHandRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DriveFileRenameOutlineRoundedIcon from '@mui/icons-material/DriveFileRenameOutlineRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import {
    Box,
    Chip,
    IconButton,
    ListItemIcon,
    ListItemText,
    Menu,
    MenuItem,
    Stack,
    TableCell,
    TableRow,
    Tooltip,
    Typography,
} from '@mui/material';

function formatProductionDate(rawDate) {
    if (!rawDate) {
        return '--';
    }

    const parsedDate = new Date(rawDate);
    if (Number.isNaN(parsedDate.getTime())) {
        return rawDate;
    }

    return parsedDate.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function buildProductionTooltip(production) {
    if (!production) {
        return '';
    }

    const bomRevisions = Array.isArray(production.bomRevisions)
        ? production.bomRevisions
        : (Array.isArray(production.bom_revisions) ? production.bom_revisions : []);

    if (bomRevisions.length) {
        return bomRevisions
            .map((bomRevision) => {
                const reference = bomRevision.reference || 'BOM';
                const revision = bomRevision.revision || '';
                const side = bomRevision.side || '';
                return `${reference} ${revision} ${side}`.trim();
            })
            .join('\n');
    }

    const linkedReferences = Array.isArray(production.linkedReferences)
        ? production.linkedReferences
        : (Array.isArray(production.linked_references) ? production.linked_references : []);

    if (linkedReferences.length) {
        return linkedReferences.join('\n');
    }

    return "Aucune BOM rattachée pour le moment.";
}

function getProductionStatusUi(status) {
    switch (String(status || 'DRAFT').toUpperCase()) {
    case 'ACTIVE':
        return {
            label: 'Active',
            color: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
        };
    case 'COMPLETED':
        return {
            label: 'Terminée',
            color: '#3b82f6',
            backgroundColor: 'rgba(59,130,246, 0.12)',
        };
    case 'ARCHIVED':
        return {
            label: 'Archivée',
            color: '#a1a1aa',
            backgroundColor: 'rgba(161, 161, 170, 0.12)',
        };
    case 'DRAFT':
    default:
        return {
            label: 'Brouillon',
            color: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
        };
    }
}

const DashboardProductionRow = React.memo(function DashboardProductionRow({
    production,
    isSessionActive,
    isBusy,
    onRequestOpenProduction,
    onRequestDeleteProduction,
    onRequestRenameProduction,
    onRequestArchiveProduction,
    onRequestDuplicateProduction,
    onRequestAssemblyMode,
}) {
    const [menuAnchor, setMenuAnchor] = React.useState(null);
    const statusUi = React.useMemo(
        () => getProductionStatusUi(production.status),
        [production.status],
    );
    const tooltipContent = React.useMemo(
        () => buildProductionTooltip(production),
        [production],
    );
    const handleOpen = React.useCallback(() => {
        onRequestOpenProduction(production);
    }, [onRequestOpenProduction, production]);
    const handleDelete = React.useCallback(() => {
        setMenuAnchor(null);
        onRequestDeleteProduction(production);
    }, [onRequestDeleteProduction, production]);
    const handleRename = React.useCallback(() => {
        setMenuAnchor(null);
        onRequestRenameProduction(production);
    }, [onRequestRenameProduction, production]);
    const handleArchive = React.useCallback(() => {
        setMenuAnchor(null);
        onRequestArchiveProduction(production);
    }, [onRequestArchiveProduction, production]);
    const handleDuplicate = React.useCallback(() => {
        setMenuAnchor(null);
        onRequestDuplicateProduction(production);
    }, [onRequestDuplicateProduction, production]);
    const handleAssemblyMode = React.useCallback(() => {
        setMenuAnchor(null);
        onRequestAssemblyMode(production);
    }, [onRequestAssemblyMode, production]);

    const isArchived = String(production.status || '').toUpperCase() === 'ARCHIVED';

    return (
        <TableRow
            hover
            sx={{
                backgroundColor: isSessionActive ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                opacity: isArchived ? 0.6 : 1,
                '&:hover': {
                    backgroundColor: isSessionActive
                        ? 'rgba(16, 185, 129, 0.12)'
                        : 'rgba(255, 255, 255, 0.02)',
                    opacity: 1,
                },
            }}
        >
            <TableCell sx={{ color: '#f4f4f5', borderColor: '#27272a' }}>
                <Stack spacing={0.6}>
                    <Tooltip
                        title={(
                            <Box sx={{ whiteSpace: 'pre-line' }}>
                                {tooltipContent}
                            </Box>
                        )}
                        arrow
                        placement="top-start"
                    >
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: 600,
                                width: 'fit-content',
                                maxWidth: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {production.name}
                        </Typography>
                    </Tooltip>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip
                            label={statusUi.label}
                            size="small"
                            variant="outlined"
                            sx={{
                                borderColor: statusUi.color,
                                color: statusUi.color,
                                backgroundColor: statusUi.backgroundColor,
                            }}
                        />
                        {isSessionActive ? (
                            <Chip
                                label="Session"
                                size="small"
                                sx={{ backgroundColor: 'rgba(5,150,105,0.16)', color: '#10b981' }}
                            />
                        ) : null}
                    </Stack>
                </Stack>
            </TableCell>
            <TableCell sx={{ color: '#d4d4d8', borderColor: '#27272a' }}>
                {production.bom_count ?? 0}
            </TableCell>
            <TableCell sx={{ color: '#a1a1aa', borderColor: '#27272a' }}>
                {formatProductionDate(production.updated_at)}
            </TableCell>
            <TableCell sx={{ borderColor: '#27272a' }}>
                <Stack direction="row" spacing={0.5} alignItems="center">
                    <Tooltip title={production.status === 'ACTIVE' ? 'Ouvrir la production' : 'Activer et ouvrir'}>
                        <span>
                            <IconButton
                                size="small"
                                aria-label={production.status === 'ACTIVE'
                                    ? `Ouvrir la production ${production.name}`
                                    : `Activer et ouvrir la production ${production.name}`}
                                onClick={handleOpen}
                                disabled={isBusy}
                                sx={{
                                    border: '1px solid #3f3f46',
                                    color: '#f4f4f5',
                                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' },
                                }}
                            >
                                <OpenInNewRoundedIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Plus d'actions">
                        <span>
                            <IconButton
                                size="small"
                                aria-label={`Plus d'actions pour ${production.name}`}
                                onClick={(e) => setMenuAnchor(e.currentTarget)}
                                disabled={isBusy}
                                sx={{
                                    border: '1px solid #3f3f46',
                                    color: '#a1a1aa',
                                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' },
                                }}
                            >
                                <MoreVertRoundedIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Menu
                        anchorEl={menuAnchor}
                        open={Boolean(menuAnchor)}
                        onClose={() => setMenuAnchor(null)}
                        PaperProps={{ sx: { backgroundColor: '#18181b', border: '1px solid #27272a', minWidth: 180 } }}
                    >
                        <MenuItem onClick={handleRename}>
                            <ListItemIcon><DriveFileRenameOutlineRoundedIcon fontSize="small" sx={{ color: '#a1a1aa' }} /></ListItemIcon>
                            <ListItemText>Renommer</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={handleAssemblyMode}>
                            <ListItemIcon><BackHandRoundedIcon fontSize="small" sx={{ color: '#a1a1aa' }} /></ListItemIcon>
                            <ListItemText>Mode d'assemblage…</ListItemText>
                        </MenuItem>
                        <MenuItem onClick={handleDuplicate}>
                            <ListItemIcon><ContentCopyRoundedIcon fontSize="small" sx={{ color: '#a1a1aa' }} /></ListItemIcon>
                            <ListItemText>Dupliquer</ListItemText>
                        </MenuItem>
                        {!isArchived && (
                            <MenuItem onClick={handleArchive}>
                                <ListItemIcon><ArchiveRoundedIcon fontSize="small" sx={{ color: '#f59e0b' }} /></ListItemIcon>
                                <ListItemText sx={{ color: '#f59e0b' }}>Archiver</ListItemText>
                            </MenuItem>
                        )}
                        <MenuItem onClick={handleDelete}>
                            <ListItemIcon><DeleteOutlineRoundedIcon fontSize="small" sx={{ color: '#f87171' }} /></ListItemIcon>
                            <ListItemText sx={{ color: '#f87171' }}>Supprimer</ListItemText>
                        </MenuItem>
                    </Menu>
                </Stack>
            </TableCell>
        </TableRow>
    );
});

export default DashboardProductionRow;
