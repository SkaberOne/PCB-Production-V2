# JOURNAL — Suivi des features

Index global de toutes les features passées par le système de prompts.
Mis à jour par l'orchestrateur à chaque exécution (le plus récent en haut).

| ID | Feature | Type | Statut | Branche | Résultat | Date |
|----|---------|------|--------|---------|----------|------|
| 009 | « Prix carte » — deux modes (production run vs carte de référence) | feat | ✅ terminé | feat/prix-carte-modes | [PR #88](https://github.com/SkaberOne/PCB-Production-V2/pull/88) → dev (sélecteur de mode ; réutilise costing production + is_reference) | 2026-07-22 |
| 012 | Import CAO — glisser-déposer dossier carte + extraction arbo (multi-révisions) | feat | ✅ terminé | feat/import-cao-drop-dossier | [PR #85](https://github.com/SkaberOne/PCB-Production-V2/pull/85) → dev (drop + KT<réf>/Rev.X ; réutilise /bom/import-cao du 006) | 2026-07-22 |
| 006 | Import CAO Eagle — endpoint /import-cao + UI dossier (incrément 2) | feat | ✅ terminé | feat/import-cao-ui | [PR #82](https://github.com/SkaberOne/PCB-Production-V2/pull/82) → dev | 2026-07-22 |
| 005 | Changement de footprint avec choix de portée (parité 002, MPN suit) | feat | ✅ terminé | feat/footprint-portee | [PR #83](https://github.com/SkaberOne/PCB-Production-V2/pull/83) → dev | 2026-07-22 |
| 004 | Tests E2E Playwright — infra + parcours critiques (smoke/nav, import) | chore/test | ⚠ terminé avec réserve | chore/e2e-playwright | [PR #84](https://github.com/SkaberOne/PCB-Production-V2/pull/84) → dev (3 E2E verts ; gate CI = échange E03, option a) | 2026-07-22 |
| 003 | Import CAO Eagle — parseur + détection + transform (incrément 1) | feat | ✅ incr.1 mergé (incr.2 = 006) | feat/import-cao | [PR #81](https://github.com/SkaberOne/PCB-Production-V2/pull/81) → dev | 2026-07-21 |
| 002 | Renommage de valeur avec portée + propagation MPN commande | feat | ✅ terminé | feat/renommage-valeur-portee (+ feat/valeur-mpn-propagation) | [PR #79](https://github.com/SkaberOne/PCB-Production-V2/pull/79) + [PR #80](https://github.com/SkaberOne/PCB-Production-V2/pull/80) → dev | 2026-07-21 |
| 001 | Fusion « BOM enregistrées » + « Cartes » & fiche éditable | feat | ✅ terminé | feat/cartes-unifie-editable | [PR #78](https://github.com/SkaberOne/PCB-Production-V2/pull/78) → dev (mergé) | 2026-07-21 |

---

## Légende des statuts

- **à-faire** — prompt validé dans \`1-a-faire/\`, pas encore exécuté
- **en-cours** — en cours d'exécution par l'orchestrateur (\`2-en-cours/\`)
- **✅ terminé** — codé, testé, déployé staging, PR ouverte (\`3-termine/\`)
- **⚠ terminé avec réserves / partiel** — livré mais un point/incrément reste (voir RESULTAT.md)
- **❌ échec** — bloqué, non déployé (voir RESULTAT.md pour la cause)
