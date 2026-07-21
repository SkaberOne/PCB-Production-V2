# [E01] Propagation du renommage de valeur vers la commande (composant / MPN)

| De | orch |
| Pour | planif |
| Prompt lié | 002 |
| Statut | OUVERT |
| Créé le | 2026-07-21 |

## Blocage / question

Le prompt 002 (renommage de valeur avec portée) est **livré côté Revue BOM** (dialog de portée, « tous », persistance — PR #79, CI verte, vérifié staging). Reste l'**acceptance #6** : « le changement de valeur se répercute sur la commande — la ligne reflète la nouvelle valeur ET le MPN / fournisseur associé, plus l'ancien MPN ».

Or la commande résout le composant/MPN via `ComponentLibraryService.match_bom_item` (`serveur/src/services/component_library_service.py:152`), qui essaie les valeurs dans l'ordre **`[value_raw, value_harmonized]`** — donc **`value_raw` d'abord**. Après un renommage de la **valeur harmonisée**, `value_raw` (inchangée) matche encore l'**ancien** composant → la ligne de commande peut rester sur l'**ancien MPN**. Le regroupement (`aggregate_key`) utilise pourtant bien la valeur harmonisée (`command_service.py:777-782`) : la ligne s'affiche donc à la **nouvelle** valeur mais avec l'**ancien** MPN → incohérence.

Je ne tranche pas seul car `match_bom_item` est **transverse** : utilisé dans **8+ endroits** — commande (`command_service`), PnP (`assignment_fixed_feeders`, `assignment_planning`, `pnp_export_service`), costing (`costing_service`), stock/prod (`production_service`, `production_stock_service`), mutations revue (`bom_revision_mutations`). Changer sa précédence globalement impacte tout le mapping valeur→composant du produit.

## Options envisagées

- **A) Précédence globale « harmonisé d'abord ».** Inverser `match_candidates` en `[value_harmonized, value_raw]` partout. Cohérent (commande, PnP, costing suivent la valeur curée), mais **fort blast radius** — change le comportement de matching de toute l'app (à re-tester : PnP, costing, stock).
- **B) Précédence « harmonisé d'abord » **commande seule**.** Ne changer que `get_command_summary` (matcher local préférant l'harmonisé), laisser PnP/costing/stock inchangés. **Faible risque**, satisfait #6, mais introduit une **incohérence** commande vs PnP (le placement machine resterait sur l'ancienne valeur).
- **C) Ne rien changer au matcher** : considérer que renommer la valeur harmonisée n'a pas vocation à changer le composant commandé tant que la **bibliothèque composants** n'a pas d'entrée pour la nouvelle valeur — et plutôt guider l'utilisateur à créer/enrichir le composant (MPN) de la nouvelle valeur. #6 alors reformulé.

**Recommandation orch : B** (commande seule, faible risque, répond au besoin métier immédiat « ma commande doit refléter la valeur que j'ai décidée »), avec traitement explicite du cas « nouvelle valeur sans composant en bibliothèque » → ligne sans MPN (à enrichir) plutôt que l'ancien MPN.

## Question annexe (à trancher aussi)

Quand la **nouvelle** valeur n'a **aucun** composant en bibliothèque : la ligne de commande doit-elle rester **sans MPN** (forçant l'enrichissement) ou retomber sur un fallback ? (La reco B implique « sans MPN ».)

## Impact / en pause

Prompt 002 **livré avec réserve** (frontend en prod-candidate via PR #79). Seule l'acceptance #6 (propagation commande) est en attente de cette décision. Dès réponse, j'implémente le backend retenu + tests + vérif staging (renommer une valeur → Commande reflète le nouveau MPN) sur une branche de suivi.
