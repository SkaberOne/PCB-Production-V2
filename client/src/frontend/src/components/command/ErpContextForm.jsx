import React from 'react';
import {
    Autocomplete,
    Card,
    CardContent,
    Grid,
    TextField,
    Typography,
} from '@mui/material';
import { colors } from '../../theme';

export const ERP_STATUT_OPTIONS = [
    "Demande d'achat",
    'En cours de validation',
    'Validée',
    'En commande',
    'Reçue partiellement',
    'Reçue totalement',
    'Annulée',
];

export const EMPTY_ERP = {
    projet: '',
    statut: '',
    delai: '',
    remarque: '',
    validateur: '',
    fournisseurParDefaut: '',
};

const CARD_SX = {
    backgroundColor: colors.surfaceCard,
    border: `1px solid ${colors.border}`,
};

/**
 * Formulaire de contexte ERP de la commande (Projet, Statut, Délai, etc.).
 *
 * Ces 6 champs alimentent les colonnes de contexte du fichier Excel exporté.
 * Le formulaire est purement contrôlé : l'état appartient au parent.
 *
 * Props:
 *   - exportContext   : objet { projet, statut, delai, remarque, validateur, fournisseurParDefaut }
 *   - onFieldChange   : (fieldName) => (event) => void
 *   - isExporting     : boolean — désactive les champs pendant l'export
 */
function ErpContextForm({ exportContext, onFieldChange, isExporting }) {
    return (
        <Card sx={CARD_SX}>
            <CardContent>
                <Typography variant="h6" sx={{ mb: 1, color: colors.textPrimary, fontWeight: 600 }}>
                    Contexte export ERP
                </Typography>
                <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 3 }}>
                    Renseigne ces champs avant chaque export pour alimenter les colonnes de contexte du fichier Excel généré par le backend.
                </Typography>

                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={4}>
                        <TextField
                            fullWidth
                            label="Projet"
                            value={exportContext.projet}
                            onChange={onFieldChange('projet')}
                            disabled={isExporting}
                        />
                    </Grid>

                    {/* Statut ERP — Autocomplete avec valeurs prédéfinies + freeSolo */}
                    <Grid item xs={12} sm={6} md={4}>
                        <Autocomplete
                            freeSolo
                            options={ERP_STATUT_OPTIONS}
                            value={exportContext.statut}
                            onInputChange={(_event, newValue) => onFieldChange('statut')(newValue)}
                            disabled={isExporting}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Statut ERP"
                                    placeholder="Sélectionner ou saisir..."
                                />
                            )}
                        />
                    </Grid>

                    {/* Délai — DatePicker natif */}
                    <Grid item xs={12} sm={6} md={4}>
                        <TextField
                            fullWidth
                            label="Délai"
                            type="date"
                            value={exportContext.delai}
                            onChange={onFieldChange('delai')}
                            disabled={isExporting}
                            InputLabelProps={{ shrink: true }}
                        />
                    </Grid>

                    <Grid item xs={12} sm={6} md={6}>
                        <TextField
                            fullWidth
                            label="Remarque"
                            value={exportContext.remarque}
                            onChange={onFieldChange('remarque')}
                            disabled={isExporting}
                            multiline
                            minRows={2}
                        />
                    </Grid>

                    <Grid item xs={12} sm={6} md={3}>
                        <TextField
                            fullWidth
                            label="Validateur"
                            value={exportContext.validateur}
                            onChange={onFieldChange('validateur')}
                            disabled={isExporting}
                        />
                    </Grid>

                    <Grid item xs={12} sm={6} md={3}>
                        <TextField
                            fullWidth
                            label="Fournisseur par défaut"
                            value={exportContext.fournisseurParDefaut}
                            onChange={onFieldChange('fournisseurParDefaut')}
                            disabled={isExporting}
                            helperText="Optionnel — s'applique à toute la commande"
                        />
                    </Grid>
                </Grid>
            </CardContent>
        </Card>
    );
}

export default ErpContextForm;
