import React from 'react';
import {
    Checkbox,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
} from '@mui/material';
import { colors } from '../../theme';

/**
 * Table du catalogue Cartes avec colonne de selection multiple (prompt 020).
 * La case a cocher stoppe la propagation pour ne pas ouvrir la fiche.
 */
function CardCatalogTable({
    rows,
    selectedIds,
    onToggleRow,
    onToggleAll,
    allSelected,
    someSelected,
    onRowClick,
    formatPrice,
}) {
    const stop = (e) => e.stopPropagation();
    return (
        <TableContainer sx={{ border: `1px solid ${colors.border}`, borderRadius: 1 }}>
            <Table size="small" stickyHeader>
                <TableHead>
                    <TableRow>
                        <TableCell padding="checkbox">
                            <Checkbox
                                size="small"
                                checked={allSelected}
                                indeterminate={someSelected && !allSelected}
                                onChange={onToggleAll}
                                inputProps={{ 'aria-label': 'Tout sélectionner' }}
                                disabled={!rows || rows.length === 0}
                            />
                        </TableCell>
                        <TableCell>Référence</TableCell>
                        <TableCell>Nom</TableCell>
                        <TableCell>Code KELENN</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Catégorie</TableCell>
                        <TableCell>Révisions</TableCell>
                        <TableCell align="right">Prix / carte</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows === null ? (
                        <TableRow><TableCell colSpan={8} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>Chargement…</TableCell></TableRow>
                    ) : rows.length === 0 ? (
                        <TableRow><TableCell colSpan={8} sx={{ py: 3, textAlign: 'center', color: colors.textSecondary }}>Aucune carte.</TableCell></TableRow>
                    ) : rows.map((row) => {
                        const checked = selectedIds.has(row.bom_reference_id);
                        return (
                            <TableRow key={row.bom_reference_id} hover selected={checked} onClick={() => onRowClick(row)} sx={{ cursor: 'pointer' }}>
                                <TableCell padding="checkbox" onClick={stop}>
                                    <Checkbox
                                        size="small"
                                        checked={checked}
                                        onChange={() => onToggleRow(row.bom_reference_id)}
                                        inputProps={{ 'aria-label': `Sélectionner ${row.reference}` }}
                                    />
                                </TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>{row.reference}</TableCell>
                                <TableCell>{row.name || <span style={{ color: colors.textSecondary }}>—</span>}</TableCell>
                                <TableCell>{row.part_number || <span style={{ color: colors.textSecondary }}>—</span>}</TableCell>
                                <TableCell>
                                    {row.card_type === 'ASSEMBLY'
                                        ? <Chip size="small" label={`Assemblage (${row.assembly_items.length})`} color="secondary" variant="outlined" />
                                        : <Chip size="small" label="Simple" variant="outlined" />}
                                </TableCell>
                                <TableCell>{row.category || <span style={{ color: colors.textSecondary }}>—</span>}</TableCell>
                                <TableCell>
                                    {(row.revisions || []).length
                                        ? row.revisions.map((r) => <Chip key={r} size="small" label={r} variant="outlined" sx={{ mr: 0.5 }} />)
                                        : <span style={{ color: colors.textSecondary }}>—</span>}
                                </TableCell>
                                <TableCell align="right">
                                    {formatPrice(row.unit_price)}
                                    {row.card_type === 'ASSEMBLY' && !row.price_complete
                                        ? <Chip size="small" label="incomplet" color="warning" variant="outlined" sx={{ ml: 0.5 }} />
                                        : null}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

export default CardCatalogTable;
