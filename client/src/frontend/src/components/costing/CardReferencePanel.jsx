import React, { useEffect, useState } from 'react';
import { Alert, Box, Card, CardContent, Grid, MenuItem, TextField, Typography } from '@mui/material';
import apiClient from '../../api/client';
import CardPriceHistory from './CardPriceHistory';
import { colors } from '../../theme';
import { eur, shortDate } from '../../utils/costingFormat';

const CARD_SX = { backgroundColor: colors.surfaceCard, border: `1px solid ${colors.border}` };

function Metric({ label, value, sub, accent }) {
    return (
        <Card sx={{ ...CARD_SX, ...(accent ? { borderColor: colors.green } : {}) }}>
            <CardContent>
                <Typography variant="caption" sx={{ color: colors.textSecondary }}>{label}</Typography>
                <Typography variant="h5" sx={{ mt: 0.5, color: accent ? colors.green : colors.textPrimary }}>
                    {value}
                </Typography>
                {sub && <Typography variant="caption" sx={{ color: colors.textSecondary }}>{sub}</Typography>}
            </CardContent>
        </Card>
    );
}

/**
 * Mode « Carte en général » (prompt 009) : prix unitaire de RÉFÉRENCE d'une carte,
 * indépendant d'une production précise. Basé sur le dernier snapshot `is_reference`
 * (GET /costing/cards + /costing/cards/{id}/history). Aucune production requise.
 */
function CardReferencePanel() {
    const [cards, setCards] = useState([]);
    const [cardId, setCardId] = useState('');
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        apiClient.get('/costing/cards')
            .then((res) => {
                const items = Array.isArray(res.data) ? res.data : [];
                setCards(items);
                if (items.length) setCardId(items[0].bom_reference_id);
            })
            .catch(() => setError('Impossible de charger les cartes.'));
    }, []);

    useEffect(() => {
        if (!cardId) { setData(null); return; }
        apiClient.get(`/costing/cards/${cardId}/history`)
            .then((res) => setData(res.data))
            .catch(() => setData(null));
    }, [cardId]);

    const ref = (data?.reference_price && data.reference_price.is_reference) ? data.reference_price : null;

    return (
        <Box>
            <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 1.5 }}>
                Prix unitaire de référence de la carte, indépendant d'une production précise
                (dernier prix figé comme référence).
            </Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <TextField
                select size="small" label="Carte" value={cardId}
                onChange={(e) => setCardId(e.target.value)} sx={{ minWidth: 260, mb: 2 }}
                disabled={!cards.length}
                data-testid="card-ref-select"
            >
                {cards.map((c) => (
                    <MenuItem key={c.bom_reference_id} value={c.bom_reference_id}>{c.reference}</MenuItem>
                ))}
            </TextField>

            {!cards.length && !error && (
                <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                    Aucune carte disponible.
                </Typography>
            )}

            {cardId ? (
                <>
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        <Grid item xs={12} sm={4}>
                            <Metric
                                label="Prix de référence unitaire HT"
                                value={ref ? eur(ref.unit_cost_ht) : '—'}
                                sub={ref ? `${ref.quantity} cartes · ${shortDate(ref.computed_at)}` : 'aucune référence enregistrée'}
                                accent
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <Metric
                                label="Prix de référence unitaire TTC"
                                value={ref ? eur(ref.unit_cost_ttc) : '—'}
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <Metric label="Snapshots" value={data?.history?.length || 0} sub="historique de prix" />
                        </Grid>
                    </Grid>
                    <CardPriceHistory history={data?.history} />
                </>
            ) : null}
        </Box>
    );
}

export default CardReferencePanel;
