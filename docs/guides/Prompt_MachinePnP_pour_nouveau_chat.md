# Prompt — Développement de la page Machine Pick & Place (à coller dans un nouveau chat)

> Copie-colle le bloc ci-dessous tel quel dans le nouveau chat. Il est auto-suffisant.

---

Tu travailles sur **ECB / PCB Flow Production Manager** (monorepo : backend FastAPI Python dans `serveur/`, frontend React 18 + MUI v5 + Zustand dans `client/src/frontend/`, shell Electron dans `client/src/desktop/`). Navigateur de test : **Google Chrome uniquement**. Palette design à conserver : **émeraude/zinc** (sombre).

**Avant toute action, lis dans cet ordre :** `CLAUDE.md`, `STRUCTURE.md`, puis ces deux audits récents :
- `docs/audits/Audit_2026-06-04_complet_pre_deploiement.md` (voir §4.5 « Machine PnP »)
- `docs/guides/Deploiement_Audit_et_Plan_Action_2026-06.md` (voir §6 « Anticiper les fonctionnalités futures » → feature flags + discipline migration DB)

## Contexte de la page Machine PnP

La page active **`client/src/frontend/src/pages/MachinePnpPage.jsx` (1 191 lignes)** ne fait aujourd'hui que **lister/afficher**, via 3 onglets :
- **Séquence** : machines PNP-01 / PNP-02, affectation de la production active (sens unique, pas de détachement), visualisation de la séquence des BOM.
- **Feeders** : table « Feeders fixes » en **lecture seule** (aucun CRUD).
- **Chariots** : table « Chariots feeders » avec **CRUD complet** (créer/éditer/supprimer).

## Le code « mort » à analyser (~2 250 lignes, NON importées par la page active)

Une **2e implémentation parallèle, non branchée**, porte toute la couche fonctionnelle « plan d'implantation ». Vérifié : ces fichiers sont importés par **0 fichier actif**.

| Fichier | Lignes | Rôle présumé |
|---|---|---|
| `hooks/useMachineConfig.js` | 742 | Config machine, sync quantités, assignation feeders ⚠️ **bug de boucle infinie connu (~l.262)** |
| `components/machine/MachinePnpTables.jsx` | 493 | Tables (feeders/slots) éditables |
| `components/machine/MachinePnpDialogs.jsx` | 437 | Dialogues (config machine, etc.) |
| `hooks/useFixedFeeders.js` | 366 | Gestion des feeders fixes (CRUD ?) |
| `components/machine/MachinePnpSlotStrip.jsx` | 116 | **Slot-strip visuel** (plan d'implantation feeders) |
| `hooks/useWorkspaceData.js` | 61 | Données workspace (utilisé uniquement par les 2 hooks ci-dessus) |
| `hooks/useBomCategories.js` | 40 | Catégories BOM |

## Fonctionnalités manquantes dans la page active (à développer)

- **Plan d'implantation feeders / slot-strip visuel** (probablement dans `MachinePnpSlotStrip.jsx`).
- **CRUD des feeders fixes** (aujourd'hui lecture seule).
- **Réordonnancement de la séquence BOM** (`sequence_order` figé).
- **Validation / dévalidation d'un ordre de fabrication.**
- **Détachement** d'une production d'une machine (affectation à sens unique aujourd'hui).

## Ta mission

1. **Inspecter** le code mort fichier par fichier : cartographie ce que chaque module fait réellement, ce qui est réutilisable, et ce qui est cassé (en particulier la boucle infinie de `useMachineConfig.js`). Délègue la cartographie à `caveman:cavecrew-investigator` si utile.
2. **Vérifier** côté backend ce qui est déjà supporté : routes dans `serveur/src/routes/marketplace_machines.py` (et voisins), modèles `PNP_MACHINES`, `PNP_FEEDERS`, `PNP_MACHINE_FEEDERS`, `PNP_CARTS`, `PRODUCTION_PLANS`, `PLAN_ASSIGNMENTS`. Note : en base, `PNP_FEEDERS` / `PNP_MACHINE_FEEDERS` / `PRODUCTION_PLANS` / `PLAN_ASSIGNMENTS` sont **vides** → l'API correspondante est peut-être incomplète.
3. **Trancher**, avec moi, entre deux stratégies (présente les deux avec coûts/risques) :
   - **Réintégrer** : rebrancher la couche existante (slot-strip, plan feeders) en corrigeant la boucle de sync.
   - **Supprimer + redévelopper** proprement sur la page active.
   - ⚠️ Ne PAS laisser les deux implémentations coexister.
4. **Planifier** (`TaskCreate`) puis **implémenter** la/les fonctionnalité(s) retenue(s), un fichier à la fois.
5. Respecter la **loi de structure** (`STRUCTURE.md`), découper les composants > 300 lignes, garder la palette émeraude/zinc, et — conformément au plan de déploiement — livrer toute fonctionnalité incomplète **derrière un feature flag désactivable** (config runtime) et toute évolution de schéma via **migration Alembic additive**.
6. **Tester** : `.venv\Scripts\pytest serveur\src\tests\ -v` + `cd client\src\frontend && npm test`, plus une vérification live dans Chrome. Revue de diff avec `caveman:cavecrew-reviewer` ou `engineering:code-review`.

Commence par l'inspection (étape 1) et reviens-moi avec la cartographie du code mort + ta recommandation réintégrer vs redévelopper, **avant** de coder.

---
