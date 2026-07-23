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
 * Rapport de suppression multiple (prompts 020, 023) : nombre supprimé + liste
 * des cartes ignorées car liées, chaque bloqueur **nommé** (nature + identifiant
 * + statut) via ``links`` — repli sur ``reasons`` si absent.
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
                        {skipped.map((s) => {
                            const links = s.links || [];
                            return (
                                <div key={s.id} style={{ marginBottom: 4 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                        {s.reference || `#${s.id}`}
                                    </Typography>
                                    {links.length ? (
                                        links.map((lk, i) => (
                                            <Typography key={i} variant="body2" sx={{ pl: 1.5 }}>
                                                • {lk.label}
                                            </Typography>
                                        ))
                                    ) : (
                                        <Typography variant="body2" sx={{ pl: 1.5 }}>
                                            • {(s.reasons || []).join(', ') || 'introuvable'}
                                        </Typography>
                                    )}
                                </div>
                            );
                        })}
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
