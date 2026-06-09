import React from 'react';
import {
    Card,
    CardContent,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import { colors } from '../../theme';
import { eur, shortDate } from '../../utils/costingFormat';

const CARD_SX = { backgroundColor: colors.surfaceCard, border: `1px solid ${colors.border}` };

/**
 * Price history of a card (snapshots in PRODUCTION_COSTING). Latest = reference.
 * Expects the `history` array from GET /costing/cards/{id}/history.
 */
function CardPriceHistory({ history }) {
    return (
        <Card sx={CARD_SX}>
            <CardContent>
                <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <HistoryRoundedIcon fontSize="small" sx={{ color: colors.textSecondary }} />
                    Historique des prix
                </Typography>
                {(!history || history.length === 0) ? (
                    <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                        Aucun chiffrage enregistré pour cette carte. Validez une production pour créer une référence.
                    </Typography>
                ) : (
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Date</TableCell>
                                <TableCell align="right">Quantité</TableCell>
                                <TableCell align="right">Coût unitaire HT</TableCell>
                                <TableCell align="right">Coût unitaire TTC</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {history.map((h) => (
                                <TableRow key={h.id}>
                                    <TableCell>{shortDate(h.computed_at)}</TableCell>
                                    <TableCell align="right">{h.quantity}</TableCell>
                                    <TableCell align="right">{eur(h.unit_cost_ht)}</TableCell>
                                    <TableCell align="right">{eur(h.unit_cost_ttc)}</TableCell>
                                    <TableCell align="right">
                                        {h.is_reference && (
                                            <Chip size="small" color="primary" label="Référence" />
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}

export default CardPriceHistory;
