import React from 'react';
import { Tooltip } from '@mui/material';

// Pastille de statut de cycle de vie (ADR 0014). Rouge = EOL/obsolète,
// orange = NRND/Last Time Buy, vert discret = actif. Rien pour UNKNOWN.
const META = {
    EOL: { color: '#ef4444', label: 'Fin de vie / obsolète' },
    NRND: { color: '#f59e0b', label: 'Non recommandé (NRND / Last Time Buy)' },
    ACTIVE: { color: '#10b981', label: 'Actif' },
};

export default function LifecycleBadge({ status, checkedAt }) {
    const key = String(status || '').toUpperCase();
    const meta = META[key];
    if (!meta) return null; // UNKNOWN / absent : aucune pastille
    let date = null;
    try { date = checkedAt ? new Date(checkedAt).toLocaleDateString('fr-FR') : null; } catch (e) { /* ignore */ }
    const title = date ? `${meta.label} — vérifié le ${date}` : meta.label;
    return (
        <Tooltip title={title}>
            <span
                aria-label={meta.label}
                style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: meta.color,
                    marginLeft: 6,
                    verticalAlign: 'middle',
                }}
            />
        </Tooltip>
    );
}
