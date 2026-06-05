/**
 * Feature flags runtime — ECB Production Manager.
 *
 * Les flags sont lus à l'exécution (jamais bakés dans le bundle) afin d'être
 * modifiables après installation sans rebuild, conformément au plan de
 * déploiement (docs/guides/Deploiement_Audit_et_Plan_Action_2026-06.md §6).
 *
 * Ordre de résolution pour chaque flag :
 *   1. window.__ECB_CONFIG__.featureFlags[name]  (injecté par Electron au runtime)
 *   2. variable d'env REACT_APP_FEATURE_*         (dev / build)
 *   3. valeur par défaut                          (demi-fini ⇒ false)
 */

const RUNTIME_CONFIG = (typeof window !== 'undefined' && window.__ECB_CONFIG__) || {};

function readBooleanEnv(envValue) {
    if (envValue === undefined || envValue === null || envValue === '') {
        return undefined;
    }
    return envValue === 'true' || envValue === '1' || envValue === 'on';
}

function resolveFlag(name, envValue, defaultValue) {
    const runtimeFlags = RUNTIME_CONFIG.featureFlags || {};
    if (Object.prototype.hasOwnProperty.call(runtimeFlags, name)) {
        return Boolean(runtimeFlags[name]);
    }
    const parsedEnv = readBooleanEnv(envValue);
    if (parsedEnv !== undefined) {
        return parsedEnv;
    }
    return defaultValue;
}

export const featureFlags = {
    /**
     * Plan d'implantation Machine PnP : slot-strip visuel, validation/dévalidation
     * d'ordre de fabrication, réordonnancement de séquence, CRUD feeders fixes,
     * détachement production↔machine. Promue en défaut (true) ; mettre à false
     * (env ou config runtime) pour revenir à la page historique (legacy).
     */
    machinePnpPlan: resolveFlag(
        'machinePnpPlan',
        process.env.REACT_APP_FEATURE_MACHINE_PNP_PLAN,
        true,
    ),
};

export function isFeatureEnabled(name) {
    return Boolean(featureFlags[name]);
}

export default featureFlags;
