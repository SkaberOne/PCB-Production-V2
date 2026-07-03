import React from 'react';
import {
    Button,
    Card,
    CardContent,
    Grid,
    Stack,
    Typography,
} from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import BomStockTable from './BomStockTable';

const INNER_CARD_SX = {
    backgroundColor: '#18181b',
    border: '1px solid #27272a',
};

/**
 * Onglet "Composants et stock" : résumé agrégé + tableau stock.
 */
function BomStockTab({
    aggregatedPreview = [],
    stockValidation = { isValidated: false },
    loadedEntryCount = 0,
    selectedEntries = [],
    canValidateStock = false,
    onValidateStock,
    onOpenCommandPage,
    onOpenStockDialog,
    hideEstimateTable = false,
}) {
    return (
        <Stack spacing={3}>
            <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                    <Card sx={INNER_CARD_SX}>
                        <CardContent>
                            <Typography variant="h6" sx={{ color: '#f4f4f5', fontWeight: 600, mb: 1 }}>
                                Résumé composants
                            </Typography>
                            <Stack spacing={1}>
                                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                                    Lignes agrégées : {aggregatedPreview.length}
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                                    BOM chargées : {loadedEntryCount} / {selectedEntries.length}
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                                    Composants manuels : {aggregatedPreview.filter((l) => l.manualPlacement).length}
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                                    Stock validé : {stockValidation.isValidated ? 'Oui' : 'Non'}
                                </Typography>
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={8}>
                    <Card sx={INNER_CARD_SX}>
                        <CardContent>
                            <Typography variant="h6" sx={{ color: '#f4f4f5', fontWeight: 600, mb: 1 }}>
                                Vérification du stock
                            </Typography>
                            <Stack spacing={1.5}>
                                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                                    La bobine est estimée à partir du diamètre extérieur, du moyeu et du pitch, avec une
                                    marge de sécurité. Le sachet et le tube s'ajoutent au stock disponible et impliquent
                                    une pose manuelle.
                                </Typography>
                                {hideEstimateTable ? (
                                    <Typography variant="body2" sx={{ color: '#d4d4d8' }}>
                                        Le tableau ci-dessous compare le besoin au stock réel (− réservé). La saisie du
                                        stock physique se fait dans la section « Stock ».
                                    </Typography>
                                ) : (
                                    <Typography variant="body2" sx={{ color: '#d4d4d8' }}>
                                        Clique sur une ligne du tableau pour ouvrir la fiche stock détaillée du composant.
                                    </Typography>
                                )}
                                {!canValidateStock && selectedEntries.length ? (
                                    <Typography variant="body2" sx={{ color: '#fbbf24' }}>
                                        Attends le chargement complet des BOM avant validation :
                                        {' '}{loadedEntryCount}/{selectedEntries.length} chargées.
                                    </Typography>
                                ) : null}
                                {/* CTA unique : valide d'abord, puis devient la navigation
                                    vers l'étape 4 une fois le stock validé. */}
                                <Stack direction="row">
                                    {stockValidation.isValidated ? (
                                        <Button
                                            variant="contained"
                                            onClick={onOpenCommandPage}
                                            endIcon={<ArrowForwardRoundedIcon />}
                                        >
                                            Commande Composant
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="contained"
                                            onClick={onValidateStock}
                                            disabled={!canValidateStock}
                                        >
                                            Valider le stock
                                        </Button>
                                    )}
                                </Stack>
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {hideEstimateTable ? null : (
                <BomStockTable lines={aggregatedPreview} onOpenStockDialog={onOpenStockDialog} />
            )}
        </Stack>
    );
}

export default React.memo(BomStockTab);
