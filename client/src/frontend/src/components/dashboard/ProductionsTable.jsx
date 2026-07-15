import React from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import {
    Box,
    Button,
    Card,
    CardContent,
    InputAdornment,
    Skeleton,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    TextField,
    Typography,
} from '@mui/material';
import DashboardProductionRow from './DashboardProductionRow';
import { compactTableContainerSx, compactTableSx } from '../../utils/compactTable';

function ProductionsTable({
    productions,
    filteredProductions,
    loading,
    refreshCooldown,
    actionLoadingId,
    searchQuery,
    onSearchQueryChange,
    sortField,
    sortDir,
    onSortChange,
    onRefresh,
    onOpenCreateDialog,
    activeProductionId,
    onRequestOpenProduction,
    onRequestDeleteProduction,
    onRequestRenameProduction,
    onRequestArchiveProduction,
    onRequestDuplicateProduction,
    onRequestAssemblyMode,
}) {
    return (
        <Card sx={{ backgroundColor: '#18181b', border: '1px solid #27272a' }}>
            <CardContent>
                <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={2}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', md: 'flex-start' }}
                    sx={{ mb: 3 }}
                >
                    <Box>
                        <Typography variant="h6" sx={{ mb: 1, color: '#f4f4f5', fontWeight: 600 }}>
                            Productions créées
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#a1a1aa', maxWidth: 680 }}>
                            Charge une production pour reprendre le travail dans BOM ou continue l&apos;import de nouvelles BOM dans la même production.
                        </Typography>
                    </Box>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <TextField
                            size="small"
                            placeholder="Rechercher une production..."
                            aria-label="Rechercher une production"
                            value={searchQuery}
                            onChange={(e) => onSearchQueryChange(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchRoundedIcon fontSize="small" sx={{ color: '#71717a' }} />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{ minWidth: 220 }}
                        />
                        <Button
                            variant="outlined"
                            startIcon={<RefreshRoundedIcon />}
                            onClick={onRefresh}
                            disabled={loading || actionLoadingId !== null || refreshCooldown}
                        >
                            {refreshCooldown ? 'Actualisation...' : 'Actualiser'}
                        </Button>
                        <Button
                            variant="contained"
                            startIcon={<AddRoundedIcon />}
                            onClick={onOpenCreateDialog}
                            disabled={actionLoadingId !== null}
                        >
                            Nouvelle production
                        </Button>
                    </Stack>
                </Stack>

                <TableContainer sx={compactTableContainerSx}>
                    <Table sx={compactTableSx}>
                        <TableHead sx={{ backgroundColor: 'background.default' }}>
                            <TableRow>
                                <TableCell
                                    sx={{ width: '42%' }}
                                    aria-sort={sortField === 'name' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                                >
                                    <TableSortLabel
                                        active={sortField === 'name'}
                                        direction={sortField === 'name' ? sortDir : 'asc'}
                                        onClick={() => onSortChange('name')}
                                        sx={{ color: '#a1a1aa', '&.Mui-active': { color: '#10b981' }, '& .MuiTableSortLabel-icon': { color: '#10b981 !important' } }}
                                    >
                                        PRODUCTION
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell
                                    sx={{ width: '16%' }}
                                    aria-sort={sortField === 'bom_count' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                                >
                                    <TableSortLabel
                                        active={sortField === 'bom_count'}
                                        direction={sortField === 'bom_count' ? sortDir : 'asc'}
                                        onClick={() => onSortChange('bom_count')}
                                        sx={{ color: '#a1a1aa', '&.Mui-active': { color: '#10b981' }, '& .MuiTableSortLabel-icon': { color: '#10b981 !important' } }}
                                    >
                                        BOM LIÉES
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell
                                    sx={{ width: '22%' }}
                                    aria-sort={sortField === 'updated_at' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                                >
                                    <TableSortLabel
                                        active={sortField === 'updated_at'}
                                        direction={sortField === 'updated_at' ? sortDir : 'desc'}
                                        onClick={() => onSortChange('updated_at')}
                                        sx={{ color: '#a1a1aa', '&.Mui-active': { color: '#10b981' }, '& .MuiTableSortLabel-icon': { color: '#10b981 !important' } }}
                                    >
                                        DERNIÈRE MÀJ
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell sx={{ width: '20%' }}>ACTIONS</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading && !productions.length ? (
                                [0, 1, 2].map((i) => (
                                    <TableRow key={i}>
                                        <TableCell sx={{ borderColor: '#27272a' }}>
                                            <Stack spacing={0.75}>
                                                <Skeleton variant="text" width="55%" height={18} sx={{ bgcolor: '#27272a' }} />
                                                <Skeleton variant="rounded" width={72} height={20} sx={{ bgcolor: '#27272a' }} />
                                            </Stack>
                                        </TableCell>
                                        <TableCell sx={{ borderColor: '#27272a' }}>
                                            <Skeleton variant="text" width={24} height={18} sx={{ bgcolor: '#27272a' }} />
                                        </TableCell>
                                        <TableCell sx={{ borderColor: '#27272a' }}><Skeleton variant="text" width={80} height={18} sx={{ bgcolor: '#27272a' }} /></TableCell>
                                        <TableCell sx={{ borderColor: '#27272a' }}><Skeleton variant="rounded" width={60} height={24} sx={{ bgcolor: '#27272a' }} /></TableCell>
                                    </TableRow>
                                ))
                            ) : filteredProductions.map((prod) => (
                                <DashboardProductionRow
                                    key={prod.id}
                                    production={prod}
                                    isSessionActive={activeProductionId === prod.id}
                                    isBusy={actionLoadingId === prod.id}
                                    onRequestOpenProduction={onRequestOpenProduction}
                                    onRequestDeleteProduction={onRequestDeleteProduction}
                                    onRequestRenameProduction={onRequestRenameProduction}
                                    onRequestArchiveProduction={onRequestArchiveProduction}
                                    onRequestDuplicateProduction={onRequestDuplicateProduction}
                                    onRequestAssemblyMode={onRequestAssemblyMode}
                                />
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </CardContent>
        </Card>
    );
}

export default ProductionsTable;
