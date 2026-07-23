import React from 'react';
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Typography,
} from '@mui/material';

/**
 * Rapport de suppression multiple (prompt 020) : nombre supprimé + liste des
 * cartes ignorées car liées (avec leurs raisons).
 */
function BulkDeleteReportDialog({ report, onClose }) {
    const deleted = report?.deleted || [];
    const skipped = report?.skipped || [];
    return (
        <Dialog open={Boolean(report)} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Rapport de suppression</DialogTitle>
            <DialogContent>
                <Typography variant="body2" sx={{ mb: 1 }}>
                    {deleted.length} supprimée(s), {skipped.length} ignorée(s).
                </Typography>
                {skipped.length > 0 ? (
                    <Alert severity="warning" variant="outlined">
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Ignorées (liées) :</Typography>
                        {skipped.map((s) => (
                            <Typography key={s.id} variant="body2">
                                {s.reference || `#${s.id}`} — {(s.reasons || []).join(', ') || 'introuvable'}
                            </Typography>
                        ))}
                    </Alert>
                ) : null}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} variant="contained">Fermer</Button>
            </DialogActions>
        </Dialog>
    );
}

export default BulkDeleteReportDialog;
