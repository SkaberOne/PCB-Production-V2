# Roadmap & Axes d'amélioration — PCB Flow Production Suite

> Créé le 2026-05-29. Document stratégique vivant : vision, priorités, backlog.
> À lire avant tout audit/dev pour aligner l'effort. Compléter au fil des sessions.

---

## 1. Principe directeur

L'app remplace une chaîne Excel/scripts par un workflow guidé pour gérer la
production PCB de bout en bout. Sa valeur vient :
- de la **traçabilité** (révisions BOM, historique commandes, configs machine)
- de l'**automatisation** (harmonisation composants, calcul besoins, génération commande)
- de la **fiabilité** (validation stock, contrôle export ERP)

**Règle d'or** : ne pas casser le workflow opérationnel. Toute évolution doit
améliorer le quotidien atelier sans introduire de friction.

---

## 2. État actuel (v1.0)

### Ce qui fonctionne
- ✅ Workflow complet 5 étapes (Productions → Import BOM → Revue → Commande → Machine PnP)
- ✅ 7 pages frontend opérationnelles, UI cohérente après audit 2026-05-29
- ✅ 28 endpoints API REST stables (14/15 répondent 200 en DB vide)
- ✅ Bibliothèque BOM enregistrées reconstruite (tree + détail révisions)
- ✅ Configuration machines PnP (PNP-01, feeders fixes/variables, 3 chariots)
- ✅ Export ERP Excel avec 6 champs contexte (projet/statut/délai/remarque/validateur/fournisseur)
- ✅ Compatible Python 3.14, FastAPI 0.136, SQLAlchemy 2.0, React 18

### Dette technique connue
- 🟡 `MachinePnpPage.jsx` (1179 lignes) — bug boucle infinie `loadMachines/selectedMachine`
- 🟡 67+ patterns SQLAlchemy 1.x (`.query()`) à migrer vers 2.0 (`select() + execute()`)
- 🟡 BomImport.jsx encore à 1224 lignes — handlers résolution à extraire en custom hook
- 🟡 Tests isolation entre fichiers (limitation SQLite — voir [[adr/0002-sqlite-tests]])

---

## 3. Backlog priorisé

### 🔴 P1 — Critique (à traiter prochainement)

**0. ⭐ PROCHAIN CHANTIER — T-003 : le handoff Import → Revue perd la 2ᵉ face (cartes recto/verso)**
- Re-confirmé en test terrain le **2026-06-19** (cf `docs/JOURNAL_TESTS_RELEASE.md` + `docs/audits/Audit_2026-06-18_test_terrain_release_v1.0.6.md` §3).
- **Symptôme** : import d'un lot 2 faces (BOT + TOP) → le *workspace d'import* garde bien les 2 faces (vérifié : BOT 257 + TOP 317), mais après « Passer à la revue » la session n'expose qu'**une seule face** (BOT) ; la production finit avec **1 BOM liée**. La 2ᵉ face (ses composants) est **silencieusement exclue** de Commande et Machine PnP.
- **Risque** : commande et implantation incomplètes (perte de la moitié des composants d'une carte recto/verso). Gravité audit = P2, mais **impact données élevé**.
- **Piste** : régression dans le handoff *Import → session de Revue* (et/ou persistance de la session qui n'en garde qu'une). Le modèle supporte 2 BOM liées (`prod01`/`prod02` en ont 2). À investiguer côté frontend (`BomImport.jsx` → Revue, `BomSessionContext`/Zustand) et l'API de liaison `productions/{id}/bom-revisions`.
- **Note** : indépendant du correctif P1 SQL `dnp` (branche `fix/dnp-tsql-isnot`, déjà livré).

**1. Récupérer/recréer la DB de production**
- Copier `dev.db` depuis l'ancien PC, OU
- Ré-importer manuellement les BOM depuis les fichiers source

**2. Migrer tests vers SQL Server local**
- Résout définitivement le bug d'isolation SQLite
- Débloquera ~30 tests qui passent en isolation mais échouent en suite
- Le projet supporte déjà SQL Server (cf `serveur/.env.example`)
- Estimation : 1 semaine de travail concentré

**3. Refactor `MachinePnpPage.jsx`**
- Bug boucle infinie connu (`loadMachines` dépend de `selectedMachine` qui est set dans le même effet)
- Découper en sous-composants comme `CommandPage`
- Estimation : 2-3 jours avec tests jest dédiés avant refactor

**4. Investiguer le 500 sur `/api/reports/components/top`**
- Partiellement adressé (Phase 17 : `bom_item_id` → `bom_revision_id`)
- Reste un edge case avec DB vide

### 🟡 P2 — Important

**5. Migration patterns SQLAlchemy 1.x → 2.0**
- 67+ occurrences `.query()` à migrer vers `select() + Session.execute()`
- Cosmétique mais c'est de la dette qui ralentit la lecture
- Estimation : 1 semaine

**6. Refactor handlers résolution dans `BomImport.jsx`**
- ~215 lignes de logique encore monolithique
- Custom hook `useBomImportResolutions()`
- Estimation : 2 jours

**7. Réparer fixtures jest cassées**
- `MachinePnpPage.test.jsx` échoue (waitFor timeout sur "Machine Alpha")
- Lié au bug boucle infinie ci-dessus (point 3)

**8. Migration `min_items` → `min_length`** dans schemas Pydantic v2
- 4 warnings (`schemas/bom.py`, `schemas/marketplace.py`)
- Trivial, 15 minutes

### 🟠 P3 — Souhaitable

**9. `setTimeout` sans cleanup** dans `BomViewerPage.jsx:458`
**10. Race condition compteur `_pendingRequests`** dans `api/client.js`
**11. `build_allowed_origins()`** : vérifier sérialisation CORS_ORIGINS
**12. Activer hot-reload par défaut en dev** (le `.bat` passe `--no-reload`)
**13. ADR pour structure monorepo serveur+client+docs**
**14. ADR pour bug isolation SQLite et solutions** (à créer dans `adr/`)

---

## 4. Vision moyen/long terme

### v1.1 (prochaines features candidates)
- Recherche full-text composants (actuellement par préfixe seulement)
- Filtres avancés bibliothèque BOM (par catégorie, par fournisseur, par stock)
- Export ERP : ajouter champs personnalisés selon ERP destinataire
- Réimport intelligent : détecter quand un BOM est modifié vs nouveau

### v1.2+
- Auto-suggestion d'harmonisation basée sur l'historique
- Intégration directe avec API fournisseurs (Farnell, DigiKey, RS, Mouser — `serveur/.env.example` prévoit déjà)
- Multi-utilisateur avec login / permissions
- Audit log des changements (qui a modifié quelle BOM quand)

### Long terme
- Migration UI vers une version plus moderne (Mantine? shadcn?)
- Multi-langue (actuellement FR uniquement)
- Mode web full (sans Electron) pour accès distant

---

## 5. Stratégie technique

### Tests
- **Court terme** : stabiliser `pytest` à >85% pass en suite globale (actuellement 69%)
- **Moyen terme** : migration tests vers SQL Server pour isolation
- **CI** : mettre en place GitHub Actions avec pytest + jest minimum
- **Couverture** : viser 75%+ sur services métier (assignment, command, harmony)

### Architecture
- **Conservation** : monorepo serveur+client+docs (testé OK)
- **Évolution** : composants frontend en sous-modules quand dépasse 300 lignes
- **Documentation** : ADR systématique pour tout choix architecturalement important

### Performance
- Pas de problème de perf identifié à ce stade
- À surveiller : `BomImport.jsx` (1224 lignes, beaucoup de state) en cas de croissance données

---

## 6. Risques identifiés

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Perte DB lors migration PC | ✅ Réalisé | Critique | Versionner dev.db ou backup auto + doc |
| Refactor MachinePnpPage casse le workflow | Moyenne | Élevé | Tests jest avant + tests UI manuels |
| Migration SQLAlchemy 2.0 introduit régressions silencieuses | Moyenne | Moyen | Migration par module + tests par étape |
| Bug isolation SQLite bloque CI | Élevée | Élevé | Migration SQL Server (P1 #2) |
| Dépendance Eagle pour BOM | Faible court terme | Élevé | Support KiCad/Altium = chantier futur |
