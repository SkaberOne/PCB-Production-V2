import React from 'react';
import { useNavigate } from 'react-router-dom';
import ApiRoundedIcon from '@mui/icons-material/ApiRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import DnsRoundedIcon from '@mui/icons-material/DnsRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Stack,
    Typography,
} from '@mui/material';
import PageHeader from '../components/common/PageHeader';
import DatabaseSettings from '../components/common/DatabaseSettings';
import SupplierApiSettings from '../components/common/SupplierApiSettings';

const cardSx = { backgroundColor: '#18181b', border: '1px solid #1f2937' };

function SettingsSection({ icon: Icon, title, chip, children }) {
    return (
        <Card sx={cardSx}>
            <CardContent>
                <Stack spacing={2}>
                    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Icon sx={{ color: '#34d399' }} />
                        <Typography variant="h6" sx={{ flexGrow: 1 }}>{title}</Typography>
                        {chip ? (
                            <Chip size="small" variant="outlined" label={chip} sx={{ borderColor: '#3f3f46', color: '#a1a1aa' }} />
                        ) : null}
                    </Stack>
                    {children}
                </Stack>
            </CardContent>
        </Card>
    );
}

function SettingsPage() {
    const navigate = useNavigate();

    return (
        <Stack spacing={4}>
            <PageHeader
                eyebrow="Paramètres"
                title="Réglages de l'application"
                description="Intégrations fournisseurs, valeurs ERP par défaut et chemins des flux locaux. La gestion des référentiels (composants, empreintes, règles) se fait désormais dans Bibliothèque › Base de données."
            />

            <SettingsSection icon={DnsRoundedIcon} title="Connexion base de données" chip="Poste">
                <DatabaseSettings />
            </SettingsSection>

            <SettingsSection icon={ApiRoundedIcon} title="Intégrations API fournisseurs">
                <SupplierApiSettings />
            </SettingsSection>

            <SettingsSection icon={TuneRoundedIcon} title="Valeurs ERP par défaut">
                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                    Valeurs appliquées par défaut lors de la préparation des commandes et des exports ERP.
                </Typography>
                <Stack direction="row" justifyContent="flex-start">
                    <Button
                        variant="outlined"
                        endIcon={<ArrowForwardRoundedIcon />}
                        onClick={() => navigate('/parametre-erp')}
                    >
                        Ouvrir les défauts ERP
                    </Button>
                </Stack>
            </SettingsSection>

            <SettingsSection icon={FolderRoundedIcon} title="Chemins import / export">
                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                    Les répertoires utilisés par les flux locaux (import BOM, exports) sont définis côté serveur
                    dans le fichier de configuration <Box component="code" sx={{ color: '#e4e4e7' }}>serveur/.env</Box>.
                </Typography>
            </SettingsSection>

            <SettingsSection icon={StorageRoundedIcon} title="Référentiels et base de données">
                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                    Le catalogue composants, les empreintes machine, les règles de type et l'enrichissement MPN
                    ont été déplacés vers la Bibliothèque pour garder Paramètres dédié aux réglages applicatifs.
                </Typography>
                <Stack direction="row" justifyContent="flex-start">
                    <Button
                        variant="outlined"
                        endIcon={<ArrowForwardRoundedIcon />}
                        onClick={() => navigate('/base-donnees')}
                    >
                        Ouvrir la base de données
                    </Button>
                </Stack>
            </SettingsSection>
        </Stack>
    );
}

export default SettingsPage;
