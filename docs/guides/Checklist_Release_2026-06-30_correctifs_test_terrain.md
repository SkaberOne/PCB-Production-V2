# Checklist de release — correctifs test terrain (T-001 → T-008)

> Suivi de la release `dev → main` regroupant les correctifs issus du test terrain
> v1.0.6 (audit du 18/06). PR de release : **#18**. Responsable : Eric.
> Créé le 2026-06-30. Tags : #release #test-terrain

---

## Contenu de la release

| ID | PR | Correctif | Statut code |
|---|---|---|---|
| T-001 / T-002 | #11 | Dialecte SQL Server `dnp IS NOT 1` → forme NULL-safe (débloque Commande + Prix carte) + garde-fou | ✅ mergé `dev` |
| T-003 | #12 | Import lot 2 faces recto/verso → 2 BOM en revue (`buildReviewSelectionFromSettled`) | ✅ mergé `dev` |
| T-004 | #13 | Toast de confirmation après « Sauver » | ✅ mergé `dev` |
| T-005 | #14 | Nom de commande dérivé du nom de la production | ✅ mergé `dev` |
| T-006 | #15 | Bandeau avertissements revue dissocié du chip « à vérifier » | ✅ mergé `dev` |
| T-007 | #16 | Garde-fou estimation bobine (validation explicite) | ✅ mergé `dev` |
| T-008 | #17 | Migration drop `ESP-MODULE_COPY` + bandeau priorités ambiguës | ✅ mergé `dev` |
| Bonus | #10 | Correctif boot Alembic (`%` d'URL) | ✅ mergé `dev` |

Doc associée : `docs/CHANGELOG.md` (Session 5), `docs/Roadmap.md`, `docs/JOURNAL_TESTS_RELEASE.md`.

---

## Avant merge (GitHub)

- [x] Les 8 correctifs mergés dans `dev` (PR #10–#17)
- [x] Merge `dev → main` sans conflit (dry-run merge-tree, EXIT=0)
- [x] Tests locaux verts : backend **381 passed / 1 skipped**, frontend **101 passed / 23 suites**
- [ ] CI verte sur la PR #18
- [ ] Relire le diff de la PR #18 (confirmer qu'il n'y a que l'attendu)
- [ ] Merger la PR #18 dans `main`

## Migration base de données (spécifique)

- [ ] Migration Alembic `b2c4e6f8a0d1` (drop `ESP-MODULE_COPY`) s'exécute au démarrage du backend contre `ECB_Production` (idempotente, sans downgrade)
- [ ] Sauvegarde de `ECB_Production` avant déploiement

## Build & déploiement (PC atelier)

- [ ] Build `.exe` via `client\CONSTRUIRE_CLIENT.bat`
- [ ] Conserver l'`.exe` de la version précédente (rollback)
- [ ] Installer la nouvelle release sur le PC atelier
- [ ] Backend démarre, `/api/health` répond 200, SQL Server « Connectée »

## Re-test terrain (conditions réelles)

- [ ] **T-001** — Commande : liste à commander + export ERP OK (plus d'erreur `dnp IS NOT 1`)
- [ ] **T-002** — Prix carte : calcul du coût OK
- [ ] **T-003** — Import lot 2 faces → 2 BOM en revue / liées à la prod
- [ ] T-004 / T-005 / T-006 / T-007 : vérification rapide
- [ ] T-008 : bandeau « priorités » calmé, `ESP-MODULE_COPY` disparue
- [ ] Passer les statuts à « ✔️ Vérifié terrain » dans `docs/JOURNAL_TESTS_RELEASE.md`

## Déclencheurs de rollback

- Backend ne démarre pas / `/api/health` KO → réinstaller l'`.exe` précédent
- Régression bloquante sur Commande, Prix carte ou Import → rollback `.exe`
- DB : la migration ne supprime qu'un doublon → pas de rollback DB nécessaire

---

## Hygiène post-release (non bloquant)

- [ ] Supprimer le fichier parasite `pytest serveursrctests -v` sur `main`
- [ ] Back-merge `main → dev` pour réaligner les commits UI présents seulement sur `main`
