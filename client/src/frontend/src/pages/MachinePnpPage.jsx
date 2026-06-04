import React from 'react';
import { featureFlags } from '../utils/featureFlags';
import MachinePnpPageLegacy from './MachinePnpPageLegacy';
import MachinePnpWorkspace from '../components/machine/MachinePnpWorkspace';

/**
 * Routeur de la page Machine PnP.
 *
 * - Flag `machinePnpPlan` OFF (défaut) → page historique stable (V1 / legacy) :
 *   onglets Séquence / Feeders / Chariots, comportement inchangé.
 * - Flag ON → orchestrateur V2 réintégré à partir du cluster (plan d'implantation
 *   feeders, CRUD feeders fixes, réordonnancement de séquence, validation d'ordre
 *   de fabrication, détachement production↔machine). En construction incrémentale.
 *
 * Tant que V2 n'est pas validée, V1 reste le défaut : aucune régression exposée.
 */
function MachinePnpPage() {
    return featureFlags.machinePnpPlan ? <MachinePnpWorkspace /> : <MachinePnpPageLegacy />;
}

export default MachinePnpPage;
