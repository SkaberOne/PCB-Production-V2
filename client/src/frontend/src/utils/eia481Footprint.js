// Mini-table EIA-481 footprint -> (pitch, largeur de bande). Miroir frontend de
// `serveur/src/services/eia481_rules.py`, utilisé comme REPLI quand un composant
// n'a pas de pitch / largeur de bande stockés en base : un 0603 -> 4 mm / 8 mm,
// donc l'épaisseur de bande pré-remplie devient cohérente (8 mm -> 0,7 mm).
//
// ⚠ Garder synchronisé avec `_PACKAGE_GROUPS` / `_PACKAGE_ALIASES` du backend.

const ALIASES = {
    SMT3: 'SOT23', UMT3: 'SOT323', UMT3F: 'SOT323', VMT3: 'SOT563',
    EMT3: 'SOT723', FMT3: 'SOT723',
    SC59: 'SOT23', SC59A: 'SOT323', SC70: 'SOT323', SC75: 'SOT416',
    TO252: 'DPAK', TO263: 'D2PAK', TO236: 'SOT23', TO236AB: 'SOT23',
};

const GROUPS = [
    { pitch: 2, width: 8, packages: ['01005', '0201', '0402', 'SOT723', 'SOT883', 'SOT416', 'SOT1123', 'SOD962', 'SOD963'] },
    { pitch: 4, width: 8, packages: ['0603', '0805', '1206', '1210', '1812', '2010', '2512', 'SOT23', 'SOT25', 'SOT26', 'SOT233', 'SOT235', 'SOT236', 'SOT323', 'SOT343', 'SOT353', 'SOT363', 'SOT523', 'SOT563', 'SOD123', 'SOD323', 'SOD523', 'SOD882', 'SOD123F', 'SOD323F', 'MELF', 'MINIMELF', 'SC70'] },
    { pitch: 8, width: 12, packages: ['SOT223', 'SOT89', 'SO8', 'SO14', 'SOIC8', 'SOIC14', 'MSOP8', 'MSOP10', 'TSSOP8', 'TSSOP14', 'TSSOP16', 'TSSOP20', 'DFN', 'QFN16', 'QFN20', 'VSSOP8'] },
    { pitch: 12, width: 16, packages: ['SO16', 'SO20', 'SOIC16', 'SOIC20', 'SOIC28', 'QFP32', 'QFP44', 'QFN32', 'QFN48', 'LQFP32', 'LQFP44', 'LQFP48', 'TQFP32', 'TQFP44', 'TQFP48', 'DPAK', 'TSSOP24', 'TSSOP28'] },
    { pitch: 16, width: 24, packages: ['SO24', 'SO28', 'QFP64', 'QFP100', 'QFP128', 'QFP144', 'LQFP64', 'LQFP100', 'LQFP128', 'LQFP144', 'TQFP64', 'TQFP100', 'TQFP128', 'BGA', 'D2PAK'] },
];

function normalizePackage(footprint) {
    if (!footprint) {
        return '';
    }
    let cleaned = String(footprint).toUpperCase().replace(/[\s\-_]/g, '');
    const match = cleaned.match(/^[A-Z](\d{3,5})$/);
    if (match) {
        cleaned = match[1];
    }
    return ALIASES[cleaned] || cleaned;
}

// Retourne { pitchMm, tapeWidthMm } depuis le footprint, ou des null si inconnu.
export function lookupFootprint(footprint) {
    const normalized = normalizePackage(footprint);
    for (const group of GROUPS) {
        if (group.packages.includes(normalized)) {
            return { pitchMm: group.pitch, tapeWidthMm: group.width };
        }
    }
    return { pitchMm: null, tapeWidthMm: null };
}
