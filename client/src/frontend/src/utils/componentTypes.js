export const componentTypeOptions = [
    'RESISTOR',
    'CAPACITOR',
    'INDUCTOR',
    'DIODE',
    'LED',
    'TRANSISTOR',
    'IC',
    'CONNECTOR',
    'FUSE',
    'RELAY',
    'MODULE',
    'POWER',
    'BUTTON/SWITCH',
    'CRYSTAL',
    'UNDEFINED',
];

export function normalizeComponentTypeValue(value) {
    const normalizedValue = String(value || '').trim().toUpperCase();
    return normalizedValue || '';
}

export function isKnownComponentType(value) {
    return componentTypeOptions.includes(normalizeComponentTypeValue(value));
}
