import React, { useEffect, useState } from 'react';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Grid,
    MenuItem,
    Snackbar,
    TextField,
    Typography,
} from '@mui/material';
import apiClient from '../api/client';
import PageHeader from '../components/common/PageHeader';
import { SUPPLIER_LABELS } from '../utils/supplierOffers';
import { colors } from '../theme';

const CARD_SX = { backgroundColor: colors.surfaceCard, border: `1px solid ${colors.border}` };

const FIELDS = [
    { key: 'project', label: 'Projet', help: 'Préselectionné sur chaque demande d\'achat' },
    { key: 'unit', label: 'Unité' },
    { key: 'requester', label: 'Demandeur' },
    { key: 'validator', label: 'Validateur' },
    { key: 'delay', label: 'Délai' },
    { key: 'remark', label: 'Remarques' },
];

/**
 * Admin screen to edit the ERP export default values (prefilled on every
 * purchase request). Backed by GET/PUT /marketplace/erp-defaults. See ADR 0004.
 */
function ErpDefaultsPage() {
    const [values, setValues] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        apiClient
            .get('/marketplace/erp-defaults')
            .then((res) => setValues(res.data))
            .catch(() => setError('Impossible de charger les valeurs par défaut.'));
    }, []);

    const handleChange = (key) => (event) => {
        setValues((prev) => ({ ...prev, [key]: event.target.value }));
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const res = await apiClient.put('/marketplace/erp-defaults', values);
            setValues(res.data);
            setSaved(true);
        } catch (e) {
            setError("Échec de l'enregistrement.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box>
            <PageHeader
                title="Valeurs par défaut ERP"
                subtitle="Champs préremplis automatiquement dans l'export de demande d'achat."
            />
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {values && (
                <Card sx={CARD_SX}>
                    <CardContent>
                        <Grid container spacing={2}>
                            {FIELDS.map((field) => (
                                <Grid item xs={12} sm={6} key={field.key}>
                                    <TextField
                                        fullWidth
                                        label={field.label}
                                        value={values[field.key] || ''}
                                        onChange={handleChange(field.key)}
                                        helperText={field.help || ''}
                                        disabled={saving}
                                    />
                                </Grid>
                            ))}
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    select
                                    fullWidth
                                    label="Fournisseur par défaut"
                                    value={values.default_supplier || ''}
                                    onChange={handleChange('default_supplier')}
                                    disabled={saving}
                                    helperText="Utilisé quand aucune offre n'est retenue"
                                >
                                    <MenuItem value="">(aucun)</MenuItem>
                                    {Object.entries(SUPPLIER_LABELS).map(([code, label]) => (
                                        <MenuItem key={code} value={code}>{label}</MenuItem>
                                    ))}
                                </TextField>
                            </Grid>
                        </Grid>
                        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                            <Button
                                variant="contained"
                                startIcon={<SaveRoundedIcon />}
                                onClick={handleSave}
                                disabled={saving}
                            >
                                Enregistrer
                            </Button>
                        </Box>
                    </CardContent>
                </Card>
            )}
            {!values && !error && (
                <Typography variant="body2" sx={{ color: colors.textSecondary }}>Chargement…</Typography>
            )}
            <Snackbar
                open={saved}
                autoHideDuration={3000}
                onClose={() => setSaved(false)}
                message="Valeurs par défaut enregistrées"
            />
        </Box>
    );
}

export default ErpDefaultsPage;
