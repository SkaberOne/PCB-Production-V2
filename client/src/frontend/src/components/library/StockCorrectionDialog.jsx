import React from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
} from '@mui/material';

/**
 * Dialog « Correction d'inventaire & seuils » (motif correction + params).
 * Présentation pure : l'état des champs est porté par le parent.
 */
function StockCorrectionDialog({
    row,
    newTotal,
    onNewTotalChange,
    safetyStock,
    onSafetyStockChange,
    lossOverride,
    onLossOverrideChange,
    onClose,
    onSave,
}) {
    return (
        <Dialog open={Boolean(row)} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>Correction d'inventaire &amp; seuils</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                        {row ? (row.mpn || row.value || 'Composant') : ''}
                    </Typography>
                    <TextField
                        size="small"
                        type="number"
                        label="Solde recompté (correction)"
                        value={newTotal}
                        onChange={onNewTotalChange}
                        helperText="Recomptage physique : ajuste le solde (absorbe le drain SAV)."
                    />
                    <TextField
                        size="small"
                        type="number"
                        label="Seuil bas (safety stock)"
                        value={safetyStock}
                        onChange={onSafetyStockChange}
                    />
                    <TextField
                        size="small"
                        type="number"
                        label="Perte % (surcharge composant)"
                        value={lossOverride}
                        onChange={onLossOverrideChange}
                        helperText="Vide = coefficient global."
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button color="inherit" onClick={onClose}>Annuler</Button>
                <Button variant="contained" onClick={onSave}>Enregistrer</Button>
            </DialogActions>
        </Dialog>
    );
}

export default StockCorrectionDialog;
