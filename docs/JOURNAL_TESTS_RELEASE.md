# 🧪 Journal de tests release — terrain (PC atelier)

> Suivi des erreurs rencontrées en testant les **releases déployées** sur le poste
> de travail (atelier). Sert de canal de retour vers le **PC perso** pour
> l'amélioration continue.
>
> Dernière mise à jour : **2026-06-19** · Tags : #test-terrain #bug

---

## 🎯 But de ce document

Ce poste sert à **tester les releases** de PCB Flow Production Suite en conditions
réelles. Chaque problème rencontré est consigné ici, puis poussé sur GitHub. Sur
le **PC perso**, le développement reprend à partir de ce journal pour corriger et
améliorer en continu.

Une erreur = une entrée. On remplit d'abord la **table de triage** (vue rapide),
puis l'**entrée détaillée** correspondante.

---

## 🔁 Workflow travail ↔ perso

**Sur le PC atelier (ici)**
1. Tester la release, reproduire le problème.
2. Ajouter une ligne dans la *Table de triage* + une *Entrée détaillée* (copier le modèle).
3. Committer + pousser :
   ```powershell
   git add docs/JOURNAL_TESTS_RELEASE.md
   git commit -m "test(terrain): <résumé court de l'erreur>"
   git push
   ```
   (ou double-clic sur `auto_push.bat` à la racine)

**Sur le PC perso (développement)**
1. `git pull` pour récupérer le journal à jour.
2. Traiter les entrées par priorité (P1 → P3).
3. Corriger, puis mettre le **Statut** à `✅ Corrigé` avec la version qui corrige + le hash de commit.
4. Re-déployer ; sur le poste atelier, vérifier et passer le statut à `✔️ Vérifié terrain`.

> 💡 Travailler chacun sur sa machine sans conflit : ne modifier ce fichier que
> sur **un** poste à la fois autour d'un même créneau, et toujours `git pull`
> avant d'éditer.

---

## 🧭 Légendes

**Gravité**

| Code | Sens |
|---|---|
| 🔴 P1 | Bloquant — empêche d'utiliser une étape du workflow / perte de données |
| 🟠 P2 | Majeur — contournable mais gênant, résultat faux ou dégradé |
| 🟡 P3 | Mineur — cosmétique, confort, libellé, détail UI |

**Statut**

| Code | Sens |
|---|---|
| 🆕 Nouveau | Constaté sur le terrain, pas encore traité |
| 🔎 En analyse | Reproduit / en cours de diagnostic |
| 🛠️ En cours | Correction en développement (PC perso) |
| ✅ Corrigé | Corrigé en code, en attente de re-déploiement |
| ✔️ Vérifié terrain | Re-testé OK sur le poste atelier |
| ❌ Rejeté / non reproductible | Pas un bug, ou non reproductible |

**Module** (cf. `STRUCTURE.md`) : `Productions` · `Import BOM` · `Revue BOM` ·
`Commande` · `Machine PnP` · `Bibliothèque` · `Prix carte` · `Paramètres` ·
`Backend/API` · `MAJ auto` · `Installation` · `Autre`

---

## 📋 Table de triage

> Vue d'ensemble. Une ligne par erreur. `ID` = `T-NNN` (incrément simple).
> Renvoie vers l'entrée détaillée plus bas.

| ID | Date | Version | Module | Gravité | Résumé | Statut | Issue GH |
|---|---|---|---|---|---|---|---|
| _(exemple)_ T-000 | 2026-06-18 | 1.0.x | Import BOM | 🟠 P2 | Description courte en une ligne | 🆕 Nouveau | — |
| T-001 | 2026-06-18 | 1.0.6 | Commande | 🔴 P1 | Erreur SQL Server `dnp IS NOT 1` (liste à commander / export ERP) | ✅ Corrigé (2026-06-19) | — |
| T-002 | 2026-06-18 | 1.0.6 | Prix carte | 🔴 P1 | « Erreur interne du serveur » au calcul du coût (même cause SQL) | ✅ Corrigé (2026-06-19) | — |
| T-003 | 2026-06-18 | 1.0.6 | Import / Revue | 🟠 P2 | Import lot 2 faces → une seule face en Revue / reliée à la prod | 🆕 Nouveau (non re-testé UI 19/06) | — |
| T-004 | 2026-06-18 | 1.0.6 | Import | 🟡 P3 | Bouton « Sauver » sans toast de confirmation | 🆕 Nouveau (non re-testé UI 19/06) | — |
| T-005 | 2026-06-18 | 1.0.6 | Commande | 🟡 P3 | Nom de commande auto incohérent à l'affichage | 🆕 Nouveau (non re-testé UI 19/06) | — |
| T-006 | 2026-06-18 | 1.0.6 | Revue BOM | 🟡 P3 | Chips/bandeaux d'avertissement non homogènes entre faces | 🆕 Nouveau (non re-testé UI 19/06) | — |
| T-007 | 2026-06-18 | 1.0.6 | Revue BOM | 🟡 P3 | Estimation bobine persistée en « stock dispo » | 🆕 Nouveau (non re-testé UI 19/06) | — |
| T-008 | 2026-06-18 | 1.0.6 | Base de données | 🟡 P3 | Règles de type : priorités partagées + `ESP-MODULE_COPY` résiduelle | 🆕 Nouveau (non re-testé UI 19/06) | — |

---

## 📝 Entrées détaillées

> Copier le modèle ci-dessous pour chaque nouvelle erreur. Garder l'ordre
> décroissant (la plus récente en haut).

### Modèle à copier

```markdown
### T-NNN — <titre court> · 🔴/🟠/🟡 P? · <Module>

- **Date** : AAAA-MM-JJ
- **Version testée** : x.y.z  (Aide → À propos)
- **Poste / OS** : atelier — Windows 10/11
- **Statut** : 🆕 Nouveau
- **Issue GitHub** : —

**Contexte / mode (mono-poste SQLite ou multi-postes SQL Server) :**
...

**Étapes pour reproduire :**
1. ...
2. ...

**Résultat attendu :**
...

**Résultat obtenu :**
...

**Message d'erreur exact / logs :**
```
(coller ici le texte de l'erreur, ou le contenu de %APPDATA%\PCB Flow Production Suite\server\logs)
```

**Capture / fichier joint :** (chemin ou nom du fichier)

**Notes pour le dev (hypothèse, fréquence, contournement) :**
...

**Résolution :** (rempli côté PC perso — commit, version corrective)
...
```

---

<!-- Ajouter les vraies entrées au-dessus de cette ligne, la plus récente en haut -->

### T-002 — Prix carte « Erreur interne du serveur » · 🔴 P1 · Prix carte

- **Date** : 2026-06-18 (corrigé 2026-06-19)
- **Version testée** : 1.0.6
- **Poste / OS** : atelier — Windows (SQL Server) ; corrigé + vérifié sur PC perso (LAPTOP-053, SQLEXPRESS, base `ECB_Production`)
- **Statut** : ✅ Corrigé (en attente de re-déploiement)
- **Issue GitHub** : —

**Contexte / mode :** multi-postes **SQL Server** uniquement (invisible en SQLite).

**Étapes pour reproduire :** ouvrir une production validée → onglet « Coût de la production » (Prix carte).

**Résultat obtenu (avant correctif) :** bandeau rouge « Impossible de calculer le coût — Erreur interne du serveur ». Même cause que T-001 (dialecte SQL).

**Cause racine :** `BomItem.dnp.isnot(True)` rendu en `dnp IS NOT 1`, invalide en T-SQL, dans l'agrégation costing (`production_service.py:131` & `:583`).

**Résolution :** remplacé par `or_(BomItem.dnp == False, BomItem.dnp.is_(None))  # noqa: E712` (forme NULL-safe, garde les lignes legacy `dnp NULL`). Vérifié le 2026-06-19 : `GET /api/costing/productions/{id}` → **HTTP 200** avec coût structuré sur les 4 productions de `ECB_Production` (SQL Server 2025). Commit/branche : voir T-001.

---

### T-001 — Commande erreur SQL Server `dnp IS NOT 1` · 🔴 P1 · Commande

- **Date** : 2026-06-18 (corrigé 2026-06-19)
- **Version testée** : 1.0.6
- **Poste / OS** : atelier — Windows (SQL Server) ; corrigé + vérifié sur PC perso (LAPTOP-053, SQLEXPRESS, base `ECB_Production`)
- **Statut** : ✅ Corrigé (en attente de re-déploiement)
- **Issue GitHub** : —

**Contexte / mode :** multi-postes **SQL Server** uniquement (invisible en SQLite — d'où le report du test sur une base SQL Server).

**Étapes pour reproduire :** production avec BOM + stock validés → ouvrir le module **Commande**.

**Résultat obtenu (avant correctif) :** bandeau rouge, table vide.

**Message d'erreur exact :**
```
(pyodbc.ProgrammingError) ('42000', "[Microsoft][ODBC Driver 17 for SQL Server]
[SQL Server]Syntaxe incorrecte vers '1'. (102)")
[SQL: ... WHERE BOM_ITEMS.dnp IS NOT 1]
```

**Cause racine :** `BomItem.dnp.isnot(True)` → `dnp IS NOT 1`. T-SQL n'accepte `IS [NOT]` qu'avec `NULL`. 4 occurrences fautives : `command_service.py:708`, `production_service.py:131` & `:583`, `report_service.py:89`.

**Résolution (2026-06-19) :**
- Les **4 occurrences** remplacées par `or_(BomItem.dnp == False, BomItem.dnp.is_(None))  # noqa: E712` (imports `or_` ajoutés dans `production_service.py` et `report_service.py`).
- **Garde-fou anti-régression** : `serveur/src/tests/test_sql_dialect_guard.py` échoue si `.isnot(<bool>)`/`.is_(<bool>)` réapparaît (le bug étant invisible en SQLite).
- Preuve déterministe SQL sur `ECB_Production` : ancien `dnp IS NOT 1` → erreur 102 ; nouveau `(dnp=0 OR dnp IS NULL)` → 3280 non-DNP / 1 DNP / 0 NULL.
- Vérification API (backend monté sur SQL Server) : `POST /api/marketplace/productions/{id}/command/sync` → **HTTP 200** sur les 4 productions (avant : 500).
- pytest : **376 passed, 1 skipped** (zéro régression).

**Branche / commit :** `fix/dnp-tsql-isnot` (à créer depuis `dev` — cf. commandes PowerShell proposées). Fichiers : `command_service.py`, `production_service.py`, `report_service.py`, `tests/test_sql_dialect_guard.py`.

---

> **T-003 → T-008** : non re-testés via l'UI le 2026-06-19. Le frontend (:3000) et le
> backend (:8000) tournent bien sur ce poste, mais l'instance Chrome pilotée n'atteint
> pas le loopback local (toute URL `127.0.0.1` renvoie une page d'erreur navigateur,
> alors que les serveurs répondent 200 en direct). Ces anomalies (P2/P3) n'étaient pas
> dans le périmètre du correctif P1 et restent **🆕 Nouveau** telles que décrites dans
> `docs/audits/Audit_2026-06-18_test_terrain_release_v1.0.6.md` (§3-4). À rejouer dès que
> l'UI est accessible (corriger l'accès loopback de Chrome, ou tester via l'app Electron).

---

## 📎 Aide-mémoire

- **Version de l'app** : menu **Aide → À propos**.
- **Logs backend** : `%APPDATA%\PCB Flow Production Suite\server\logs`.
- **Config** : `%APPDATA%\PCB Flow Production Suite\server\.env`.
- **Releases** : https://github.com/SkaberOne/PCB-Production-V2/releases/latest
- **Symptômes courants** : voir `docs/guides/TROUBLESHOOTING.md`.
