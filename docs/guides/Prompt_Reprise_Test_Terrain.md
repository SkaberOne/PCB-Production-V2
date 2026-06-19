# Prompt de reprise — Test terrain end-to-end (à lancer sur le PC perso)

> Créé le 2026-06-18. Le PC atelier n'avait pas le toolchain dev (pas de `.venv`,
> Node/npm absents) ; le test a été reporté sur le PC perso qui a tout d'installé.
> Coller le bloc ci-dessous dans une session Claude/Cowork sur le PC perso.

---

```text
Mission : test fonctionnel end-to-end de PCB Flow Production Suite via l'interface
réelle (Google Chrome uniquement). Reprise d'une session démarrée sur le PC atelier
qui n'avait pas le toolchain dev installé.

Avant d'agir, lis dans l'ordre : CLAUDE.md, STRUCTURE.md, docs/Projet.md,
docs/CHANGELOG.md (dernière entrée), puis le dernier audit
docs/audits/Audit_2026-06-18_test_terrain_release_v1.0.6.md.

Contexte déjà établi :
- Le backend (FastAPI :8000) et le frontend (React :3000) doivent être lancés via
  serveur/DEMARRER_SERVEUR.bat et client/DEMARRER_CLIENT.bat. Vérifie d'abord l'état
  (health /api/health = 200, :3000 accessible) ; lance-les seulement s'ils sont down.
- CHOIX DB IMPORTANT : les 2 bugs P1 de l'audit du jour — T-001 (module Commande,
  erreur SQL Server `dnp IS NOT 1`) et T-002 (Prix carte, "Erreur interne") — ne se
  reproduisent QU'EN SQL Server, jamais en SQLite. Pour re-vérifier T-001/T-002, pointe
  le backend sur un SQL Server (serveur/.env avec SQL_SERVER_*). En SQLite ces bugs
  restent invisibles. Cause racine = 4 occurrences non corrigées de
  `BomItem.dnp.isnot(True)` : command_service.py:708, production_service.py:131 & :583,
  report_service.py:89 (le bon motif `== False  # noqa: E712` est déjà utilisé ailleurs).
- BOM de test : la carte recto/verso KT220430F (exports Eagle .txt _TOP + _BOT, ~317/257
  lignes). Sur le PC atelier ils étaient dans Desktop\Fichier test\BOM Test\. Utilise les
  tiens, ou un BOM 2 faces équivalent.

Objectif = RE-VÉRIFIER les 8 anomalies de l'audit du 18/06/2026 (T-001 à T-008) :
  T-001 P1 Commande (SQL `dnp IS NOT 1`)         T-005 P3 nom de commande auto incohérent
  T-002 P1 Prix carte (même cause SQL)           T-006 P3 chips/bandeaux revue non homogènes
  T-003 P2 import lot 2 faces → 1 seule en revue T-007 P3 estim. bobine persistée en stock
  T-004 P3 bouton "Sauver" sans toast            T-008 P3 règles de type : priorités + ESP-MODULE_COPY

Étapes :
1. Confirmer health 200 + :3000 dans Chrome.
2. Créer une production de test (nom : TEST_RETEST_<date>).
3. Importer le BOM 2 faces (mode Lot TOP+BOT) → vérifier que LES DEUX faces arrivent en
   Revue et sont liées à la production (cœur de T-003).
4. Vérifier l'harmonisation des références + l'assignation des feeders (HARMONY_RULES).
5. Ouvrir Commande (T-001) et Prix carte (T-002) → noter si l'erreur SQL se reproduit.
6. Parcourir dashboard / Machine PnP (valider l'ordre + export PnP) / exports ; relever
   T-004→T-008.
7. Documenter : ce qui marche / casse + captures des erreurs, et consigner les résultats
   (statut Reproduit / Corrigé / Non reproduit) dans docs/JOURNAL_TESTS_RELEASE.md.

Contraintes : Chrome uniquement ; aucune opération Git destructive automatique (les
proposer sous PowerShell) ; crée une TaskList et coche au fur et à mesure ; si un choix
est ambigu (quel BOM, quels paramètres), demande avant.
```
