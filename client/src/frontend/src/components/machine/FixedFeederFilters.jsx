import React from 'react';
import SwapVertRoundedIcon from '@mui/icons-material/SwapVertRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import {
    Box,
    InputAdornment,
    MenuItem,
    TextField,
    Tooltip,
    IconButton,
} from '@mui/material';

const SORT_OPTIONS = [
    { value: 'bom_reference_count', label: 'Nb BOM communs' },
    { value: 'average_board_quantity', label: 'Qté moyenne/carte' },
    { value: 'component_label', label: 'Composant' },
];

/**
 * Barre de recherche / filtres / tri pour l'onglet Feeders fixes.
 * Branche les états déjà calculés par useFixedFeeders (aucune logique propre).
 */
function FixedFeederFilters({ fixedFeeders }) {
    const {
        fixedFeederRows,
        fixedFeederSearch,
        setFixedFeederSearch,
        fixedFeederCartFilter,
        setFixedFeederCartFilter,
        fixedFeederSizeFilter,
        setFixedFeederSizeFilter,
        fixedFeederSortBy,
        setFixedFeederSortBy,
        fixedFeederSortDirection,
        setFixedFeederSortDirection,
        cartOptions,
    } = fixedFeeders;

    const sizeOptions = React.useMemo(() => {
        const sizes = new Set();
        fixedFeederRows.forEach((row) => {
            if (row.feeder_size_mm !== undefined && row.feeder_size_mm !== null) {
                sizes.add(Number(row.feeder_size_mm));
            }
        });
        return Array.from(sizes).sort((a, b) => a - b);
    }, [fixedFeederRows]);

    const toggleDirection = () => setFixedFeederSortDirection(
        fixedFeederSortDirection === 'asc' ? 'desc' : 'asc',
    );

    return (
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
                size="small"
                placeholder="Rechercher (référence, footprint, chariot…)"
                aria-label="Rechercher un feeder fixe"
                value={fixedFeederSearch}
                onChange={(event) => setFixedFeederSearch(event.target.value)}
                sx={{ flex: 1, minWidth: 220 }}
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchRoundedIcon fontSize="small" sx={{ color: '#71717a' }} />
                        </InputAdornment>
                    ),
                }}
            />
            <TextField
                select
                size="small"
                label="Chariot"
                value={fixedFeederCartFilter}
                onChange={(event) => setFixedFeederCartFilter(event.target.value)}
                sx={{ minWidth: 160 }}
            >
                <MenuItem value="all">Tous les chariots</MenuItem>
                {cartOptions.map((option) => (
                    <MenuItem key={option.key} value={option.value}>{option.label}</MenuItem>
                ))}
            </TextField>
            <TextField
                select
                size="small"
                label="Taille"
                value={fixedFeederSizeFilter}
                onChange={(event) => setFixedFeederSizeFilter(event.target.value)}
                sx={{ minWidth: 120 }}
            >
                <MenuItem value="all">Toutes tailles</MenuItem>
                {sizeOptions.map((size) => (
                    <MenuItem key={size} value={`${size}`}>{size} mm</MenuItem>
                ))}
            </TextField>
            <TextField
                select
                size="small"
                label="Trier par"
                value={fixedFeederSortBy}
                onChange={(event) => setFixedFeederSortBy(event.target.value)}
                sx={{ minWidth: 170 }}
            >
                {SORT_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
            </TextField>
            <Tooltip title={fixedFeederSortDirection === 'asc' ? 'Ordre croissant' : 'Ordre décroissant'}>
                <IconButton
                    size="small"
                    aria-label="Inverser l'ordre de tri"
                    onClick={toggleDirection}
                    sx={{ color: '#a1a1aa' }}
                >
                    <SwapVertRoundedIcon fontSize="small" />
                </IconButton>
            </Tooltip>
        </Box>
    );
}

export default FixedFeederFilters;
