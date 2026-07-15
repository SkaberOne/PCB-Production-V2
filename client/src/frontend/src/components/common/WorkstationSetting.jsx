import React from 'react';
import { Button, Stack, TextField, Typography } from '@mui/material';
import { getStoredWorkstation, setStoredWorkstation } from '../../api/client';

/**
 * Identité de poste (ADR 0015) : nom mémorisé dans ce navigateur et envoyé en
 * header X-Workstation. Sert à tracer « qui a fait quoi » (journal stock).
 */
function WorkstationSetting() {
    const [name, setName] = React.useState(() => getStoredWorkstation() || '');
    const [saved, setSaved] = React.useState(false);

    const save = () => {
        setStoredWorkstation(name);
        setName(getStoredWorkstation() || '');
        setSaved(true);
    };

    return (
        <Stack spacing={1.5}>
            <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
                Nom de ce poste (ex. <b>poste-atelier-1</b>), mémorisé dans ce navigateur et joint
                aux mouvements de stock (réceptions, corrections) pour la traçabilité.
            </Typography>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                <TextField
                    size="small"
                    label="Nom du poste"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setSaved(false); }}
                    inputProps={{ maxLength: 60 }}
                    sx={{ minWidth: 260 }}
                />
                <Button variant="outlined" onClick={save}>Enregistrer</Button>
                {saved ? (
                    <Typography variant="caption" sx={{ color: '#34d399' }}>
                        {getStoredWorkstation() ? 'Nom de poste enregistré.' : 'Nom de poste effacé.'}
                    </Typography>
                ) : null}
            </Stack>
        </Stack>
    );
}

export default WorkstationSetting;
