# [E01] Propagation du renommage de valeur vers la commande (composant / MPN)

| De | orch |
| Pour | planif |
| Prompt lié | 002 |
| Statut | **RÉPONDU** |
| Créé le | 2026-07-21 |

## Blocage / question

`match_bom_item` essaie `[value_raw, value_harmonized]` (raw d'abord). Après renommage de la valeur
harmonisée, `value_raw` (inchangée) matche encore l'**ancien** composant → la ligne de commande reste
sur l'**ancien MPN** alors que l'agrégation affiche la **nouvelle** valeur. Options A (harmonisé d'abord,
global) / B (commande seule) / C (ne rien changer). Reco orch : B.

---

## Réponse / décision (planif) — validée par Eric

**Option A retenue** : préférer la **valeur harmonisée** dans le matching composant, **globalement**.

**Implémentation** : dans `match_bom_item` (`component_library_service.py:152`), inverser l'ordre des
candidats en **`[value_harmonized, value_raw]`** — en ignorant les valeurs vides et en dédupliquant
(`candidates = [v for v in (value_harmonized, value_raw) if v]`). La brute reste donc en **fallback**.

**Pourquoi A (et pas B) :**
1. **Cohérence** : l'agrégation (`aggregate_key`) et les feeders utilisent **déjà** la valeur harmonisée ;
   `match_bom_item` était l'intrus. A corrige une incohérence **existante**.
2. **Sécurité prod** : B ferait diverger **commande** (nouvelle valeur) et **placement PnP** (ancienne)
   → commander une pièce et en placer une autre. A fait tout suivre la valeur curée.
3. **Régression faible** : `value_raw` reste candidat → **aucun match qui réussit aujourd'hui ne casse** ;
   seule la **précédence** change, et uniquement quand `harmonisé ≠ raw` (curation délibérée = cas voulu).

**Nouvelle valeur sans composant en bibliothèque** → ligne de commande **sans MPN**, marquée
« à enrichir ». **Jamais** de fallback sur l'ancien MPN.

**Tests exigés (blast radius) :** relancer **toute** la suite `pytest` (PnP, costing, stock, commande)
— tout consommateur de `match_bom_item`. Ajouter des tests ciblés :
- renommage d'une valeur → **Commande** reflète le nouveau MPN (ou « sans MPN » si nouvelle valeur inconnue) ;
- renommage d'une valeur → **PnP / placement** reflète aussi la nouvelle valeur (cohérence commande ↔ machine).
Validation staging : renommer une valeur (ex. `10µF`→`10µF/35V` « tous ») → Commande **et** Machine PnP
suivent la nouvelle valeur.

## Suite (émetteur, après application)

<!-- À remplir par l'orchestrateur : implémenter A + tests, vérifier staging, PR de suivi vers dev,
     puis déplacer cet échange dans resolus/. -->
