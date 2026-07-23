import React from 'react';
import {
    Box, Chip, Collapse, IconButton, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded';
import { normalizeRevisionCode, formatRevisionLabel } from '../../utils/revision';
import ProductionSuiviBar from '../dashboard/ProductionSuiviBar';
import { colors } from '../../theme';

const BELOW_MIN_BG = 'rgba(239, 68, 68, 0.12)';

/**
 * Ligne « stock cartes » groupée par carte (prompt 022) : résumé agrégé
 * (stock total, valeur totale, nb de révisions, barre SUIVI agrégée) + déroulant
 * `Collapse` avec le détail par révision (données actuelles conservées, clic =
 * édition). Réutilise le patron dépliable du 019.
 */
function CardStockRow({ card, open, onToggle, onEditRevision, formatPrice }) {
    const revs = card.revisions || [];
    return (
        <>
            <TableRow
                hover
                onClick={onToggle}
                sx={{ cursor: 'pointer', ...(card.anyBelowMin ? { backgroundColor: BELOW_MIN_BG, '&:hover': { backgroundColor: BELOW_MIN_BG } } : {}) }}
            >
                <TableCell padding="checkbox">
                    <IconButton size="small" aria-label={open ? 'Replier' : 'Déplier'}>
                        {open ? <KeyboardArrowUpRoundedIcon fontSize="small" /> : <KeyboardArrowDownRoundedIcon fontSize="small" />}
                    </IconButton>
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>
                    {card.reference}
                    {card.anyBelowMin ? <Chip size="small" label="sous min." color="error" sx={{ ml: 0.75 }} /> : null}
                </TableCell>
                <TableCell sx={{ color: colors.textSecondary }}>{card.name || '—'}</TableCell>
                <TableCell align="right">
                    <Chip size="small" variant="outlined" label={`${revs.length} rév.`} />
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{card.totalStock}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{formatPrice(card.totalValue)}</TableCell>
                <TableCell align="right">
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <ProductionSuiviBar
                            produced={card.totalStock}
                            tested={card.totalTested}
                            validated={card.totalValidated}
                            toDebug={card.totalToDebug}
                            testId={`suivi-bar-card-${card.bom_reference_id}`}
                        />
                    </Box>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell colSpan={7} sx={{ py: 0, borderBottom: open ? undefined : 'none' }}>
                    <Collapse in={open} timeout="auto">
                        <Box sx={{ my: 1 }}>
                            <Table size="small" aria-label={`Révisions de ${card.reference}`}>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Révision</TableCell>
                                        <TableCell align="right">En stock</TableCell>
                                        <TableCell align="right">Min.</TableCell>
                                        <TableCell align="right">Prix / carte</TableCell>
                                        <TableCell align="right">Valeur stock</TableCell>
                                        <TableCell align="right">Testées</TableCell>
                                        <TableCell align="right">Validées</TableCell>
                                        <TableCell align="right">À débugger</TableCell>
                                        <TableCell align="right">Suivi</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {revs.map((row) => (
                                        <TableRow
                                            key={`${row.bom_reference_id}::${row.revision || ''}`}
                                            hover
                                            onClick={(e) => { e.stopPropagation(); onEditRevision(row); }}
                                            sx={{ cursor: 'pointer', ...(row.below_min ? { backgroundColor: BELOW_MIN_BG } : {}) }}
                                        >
                                            <TableCell>
                                                {normalizeRevisionCode(row.revision)
                                                    ? <Chip size="small" label={formatRevisionLabel(row.revision)} variant="outlined" />
                                                    : <span style={{ color: colors.textSecondary }}>Sans révision</span>}
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 600 }}>{row.qty_in_stock}</TableCell>
                                            <TableCell align="right" sx={{ color: colors.textSecondary }}>{row.min_stock}</TableCell>
                                            <TableCell align="right">
                                                {formatPrice(row.unit_price_effective)}
                                                {row.unit_price_override != null
                                                    ? <Chip size="small" label="manuel" variant="outlined" sx={{ ml: 0.5 }} />
                                                    : (row.reference_unit_cost_ht != null ? <Chip size="small" label="auto" variant="outlined" sx={{ ml: 0.5, color: colors.textSecondary }} /> : null)}
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 600 }}>{formatPrice(row.stock_value)}</TableCell>
                                            <TableCell align="right" sx={{ color: '#3b82f6' }}>{row.cards_tested}</TableCell>
                                            <TableCell align="right" sx={{ color: '#22c55e' }}>{row.cards_validated}</TableCell>
                                            <TableCell align="right" sx={{ color: '#f59e0b' }}>{row.cards_to_debug}</TableCell>
                                            <TableCell align="right">
                                                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                    <ProductionSuiviBar
                                                        produced={row.qty_in_stock}
                                                        tested={row.cards_tested}
                                                        validated={row.cards_validated}
                                                        toDebug={row.cards_to_debug}
                                                        testId={`suivi-bar-${row.bom_reference_id}-${row.revision || 'none'}`}
                                                    />
                                                </Box>
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

export default CardStockRow;
