# JOURNAL — Suivi des features

Index global de toutes les features passées par le système de prompts.
Mis à jour par l'orchestrateur à chaque exécution (le plus récent en haut).

| ID | Feature | Type | Statut | Branche | Résultat | Date |
|----|---------|------|--------|---------|----------|------|
| 006 | Import CAO Eagle — endpoint `/import-cao` + UI dossier (incrément 2) | feat | ✅ terminé | feat/import-cao-ui | [PR #82](https://github.com/SkaberOne/PCB-Production-V2/pull/82) → dev (branche le parseur 003 sur la chaîne d'import ; 1 revision par face TOP/BOT ; KiCad « à venir ») | 2026-07-22 |
| 003 | Import CAO Eagle — parseur + détection + transform (incrément 1) | feat | ⚠ partiel (incr. 1) | feat/import-cao | [PR #81](https://github.com/SkaberOne/PCB-Production-V2/pull/81) → dev (parseur+fixtures OK, E02 résolu) ; incrément 2 = 006 (terminé) | 2026-07-21 |
| 002 | Renommage de valeur avec portée + propagation MPN commande | feat | ✅ terminé | feat/renommage-valeur-portee (+ feat/valeur-mpn-propagation) | [PR #79](https://github.com/SkaberOne/PCB-Production-V2/pull/79) front + [PR #80](https://github.com/SkaberOne/PCB-Production-V2/pull/80) back (E01 résolu) → dev | 2026-07-21 |
| 001 | Fusion « BOM enregistrées » + « Cartes » & fiche éditable | feat | ✅ terminé | feat/cartes-unifie-editable | [PR #78](https://github.com/SkaberOne/PCB-Production-V2/pull/78) → dev (mergé) | 2026-07-21 |

---

## Légende des statuts

- **à-faire** — prompt validé dans `1-a-faire/`, pas encore exécuté
- **en-cours** — en cours d'exécution par l'orchestrateur (`2-en-cours/`)
- **✅ terminé** — codé, testé, déployé staging, PR ouverte (`3-termine/`)
- **⚠ terminé avec réserves / partiel** — livré mais un point/incrément reste (voir RESULTAT.md)
- **❌ échec** — bloqué, non déployé (voir RESULTAT.md pour la cause)
