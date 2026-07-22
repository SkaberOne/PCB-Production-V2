# JOURNAL — Suivi des features

Index global de toutes les features passées par le système de prompts.
Mis à jour par l'orchestrateur à chaque exécution (le plus récent en haut).

| ID | Feature | Type | Statut | Branche | Résultat | Date |
|----|---------|------|--------|---------|----------|------|
| 004 | Tests E2E Playwright — infra + parcours critiques (smoke/nav, import) | chore/test | ⚠ terminé avec réserve | chore/e2e-playwright | [PR #84](https://github.com/SkaberOne/PCB-Production-V2/pull/84) → dev (3 E2E verts ; gate CI à trancher — échange E03) | 2026-07-22 |
| 003 | Import CAO Eagle — parseur + détection + transform (incrément 1) | feat | ⚠ partiel (incr. 1) | feat/import-cao | [PR #81](https://github.com/SkaberOne/PCB-Production-V2/pull/81) → dev (parseur+fixtures OK, E02 résolu) ; incrément 2 (endpoint + UI) à suivre | 2026-07-21 |
| 002 | Renommage de valeur avec portée + propagation MPN commande | feat | ✅ terminé | feat/renommage-valeur-portee (+ feat/valeur-mpn-propagation) | [PR #79](https://github.com/SkaberOne/PCB-Production-V2/pull/79) front + [PR #80](https://github.com/SkaberOne/PCB-Production-V2/pull/80) back (E01 résolu) → dev | 2026-07-21 |
| 001 | Fusion « BOM enregistrées » + « Cartes » & fiche éditable | feat | ✅ terminé | feat/cartes-unifie-editable | [PR #78](https://github.com/SkaberOne/PCB-Production-V2/pull/78) → dev (mergé) | 2026-07-21 |

---

## Légende des statuts

- **à-faire** — prompt validé dans `1-a-faire/`, pas encore exécuté
- **en-cours** — en cours d'exécution par l'orchestrateur (`2-en-cours/`)
- **✅ terminé** — codé, testé, déployé staging, PR ouverte (`3-termine/`)
- **⚠ terminé avec réserves / partiel** — livré mais un point/incrément reste (voir RESULTAT.md)
- **❌ échec** — bloqué, non déployé (voir RESULTAT.md pour la cause)
