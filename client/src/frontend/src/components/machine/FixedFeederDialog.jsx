import React from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { getComponentPrimaryLabel, getComponentSecondaryLabel } from '../../utils/machinePnp';

/**
 * Dialogue de création / édition d'un feeder fixe.
 *
 * Consomme le hook useFixedFeeders (passé via `fixedFeeders`) : sélection d'un
 * composant candidat (recherche serveur), choix du chariot fixe et de la taille
 * de feeder, puis enregistrement. En édition, le composant est figé.
 */
function FixedFeederDialog({ fixedFeeders }) {
    const {
        fixedFeederDialogOpen,
        editingFixedFeeder,
        fixedFeederForm,
        setFixedFeederForm,
        fixedFeederDialogError,
        fixedFeederComponentSearch,
        setFixedFeederComponentSearch,
        fixedFeederCandidatesLoading,
        fixedFeederCandidateOptions,
        selectedFixedFeederCandidate,
        cartOptions,
        feederOptions,
        actionLoading,
        resetFixedFeederDialog,
        handleSaveFixedFeeder,
    } = fixedFeeders;

    const updateForm = (patch) => setFixedFeederForm((current) => ({ ...current, ...patch }));
    const busy = Boolean(actionLoading);
    const editingLabel = editingFixedFeeder
        ? getComponentPrimaryLabel(editingFixedFeeder)
        : getComponentPrimaryLabel(selectedFixedFeederCandidate);
    const editingSecondary = editingFixedFeeder
        ? getComponentSecondaryLabel(editingFixedFeeder)
        : null;

    return (
        <Dialog open={fixedFeederDialogOpen} onClose={resetFixedFeederDialog} maxWidth="sm" fullWidth>
            <DialogTitle>{editingFixedFeeder ? 'Modifier le feeder fixe' : 'Nouveau feeder fixe'}</DialogTitle>
            <DialogContent sx={{ pt: '12px !important' }}>
                <Stack spacing={2}>
                    {fixedFeederDialogError ? <Alert severity="error">{fixedFeederDialogError}</Alert> : null}

                    {editingFixedFeeder ? (
                        <Box>
                            <Typography sx={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Composant
                            </Typography>
                            <Typography sx={{ color: '#f4f4f5', fontWeight: 600 }}>{editingLabel}</Typography>
                            {editingSecondary ? (
                                <Typography sx={{ fontSize: '0.8rem', color: '#a1a1aa' }}>{editingSecondary}</Typography>
                            ) : null}
                        </Box>
                    ) : (
                        <Stack spacing={1}>
                            <TextField
                                size="small"
                                label="Rechercher un composant"
                                placeholder="Référence, MPN, valeur…"
                                value={fixedFeederComponentSearch}
                                onChange={(event) => setFixedFeederComponentSearch(event.target.value)}
                                fullWidth
                            />
                            <TextField
                                select
                                size="small"
                                label="Composant à fixer"
                                value={fixedFeederForm.component_id}
                                onChange={(event) => updateForm({ component_id: event.target.value })}
                                fullWidth
                                disabled={fixedFeederCandidatesLoading}
                                helperText={fixedFeederCandidatesLoading ? 'Chargement des candidats…' : undefined}
                                InputProps={fixedFeederCandidatesLoading ? {
                                    endAdornment: <CircularProgress size={16} sx={{ color: '#71717a', mr: 3 }} />,
                                } : undefined}
                            >
                                <MenuItem value=""><em>Sélectionner un composant</em></MenuItem>
                                {fixedFeederCandidateOptions.map((option) => (
                                    <MenuItem key={option.key} value={option.value}>{option.label}</MenuItem>
                                ))}
                            </TextField>
                        </Stack>
                    )}

                    <TextField
                        select
                        size="small"
                        label="Chariot fixe"
                        value={fixedFeederForm.fixed_cart_id}
                        onChange={(event) => updateForm({ fixed_cart_id: event.target.value })}
                        fullWidth
                    >
                        <MenuItem value=""><em>Sélectionner un chariot</em></MenuItem>
                        {cartOptions.map((option) => (
                            <MenuItem key={option.key} value={option.value}>{option.label}</MenuItem>
                        ))}
                    </TextField>

                    <TextField
                        select
                        size="small"
                        label="Taille de feeder"
                        value={fixedFeederForm.feeder_id}
                        onChange={(event) => updateForm({ feeder_id: event.target.value })}
                        fullWidth
                    >
                        <MenuItem value=""><em>Sélectionner une taille</em></MenuItem>
                        {feederOptions.map((option) => (
                            <MenuItem key={option.key} value={option.value}>{option.label}</MenuItem>
                        ))}
                    </TextField>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={resetFixedFeederDialog}>Annuler</Button>
                <Button
                    variant="contained"
                    onClick={handleSaveFixedFeeder}
                    disabled={busy}
                    sx={{ backgroundColor: '#059669', '&:hover': { backgroundColor: '#047857' } }}
                >
                    Enregistrer
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default FixedFeederDialog;
