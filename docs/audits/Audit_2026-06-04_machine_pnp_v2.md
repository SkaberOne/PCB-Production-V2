# Audit — Page Machine PnP V2 (réintégrée)

**Date : 2026-06-04** · Type : audit post-réintégration (code + revue indépendante) · Périmètre : orchestrateur V2 derrière flag `machinePnpPlan`
Branche : `audit-restructure-2026-05` · Commits audités : `b1b4c78` → `23f6309`

---

## 1. Résumé exécutif

La V2 de la page Machine PnP est **fonctionnelle et validée en live** (Chrome) : routage par flag opérationnel, chargement des machines/feeders fixes, dialogue de configuration (plan d'implantation) qui s'ouvre avec toutes ses sections. La réintégration a éliminé la duplication de code (une seule implémentation active) et corrigé la boucle infinie historique.

L'audit ne révèle **aucun bug bloquant**. Les axes d'amélioration se répartissent en quatre familles :

1. **Lacunes fonctionnelles** — plusieurs capacités déjà présentes dans les hooks réintégrés ne sont **pas exposées dans l'UI** : recherche/filtre/tri des feeders fixes, filtrage du plan d'implantation par révision BOM, édition d'une machine. Ce sont les écarts les plus utiles à combler.
2. **Pattern `AbortController` absent** — dette systémique déjà identifiée dans l'audit global (§5.4) ; les chargeurs des hooks ne s'annulent pas au démontage.
3. **Fichiers > 300 lignes** — `useMachineConfig.js` (~727 l.), `useFixedFeeders.js` (337 l.), `MachineConfigDialog.jsx` (~393 l.) dépassent la limite `CLAUDE.md`.
4. **Design system non centralisé** — couleurs hex en dur partout (cohérent avec §5.1 de l'audit global).

**Verdict :** V2 saine et utilisable. Combler les lacunes fonctionnelles (famille 1) la rend complète ; les familles 2-4 sont de la dette à solder progressivement.

---

## 2. Constats fonctionnels — *ce qui manque ou ne correspond pas encore*

| Sév. | Constat | Réf. |
|---|---|---|
| MAJEUR | **Onglet Feeders fixes : recherche/filtre/tri non exposés.** `useFixedFeeders` fournit `fixedFeederSearch`, `fixedFeederCartFilter`, `fixedFeederSizeFilter`, `fixedFeederSortBy/Direction` et `filteredFixedFeederRows` les applique — mais aucun champ de recherche ni sélecteur de filtre n'est rendu. La table affiche donc tout, triée par défaut, **sans moyen de chercher** (régression vs V1 qui avait une recherche). | `MachinePnpWorkspace.jsx` (onglet 1) |
| MAJEUR | **Plan d'implantation : filtrage par révision BOM non exposé.** `useMachineConfig` expose `handleToggleMachineBomRevision`, `handleChangeMachineBomAssignmentFilter`, `selectedMachineBomRevision` — non câblés. Conséquence : la table d'affectation affiche par défaut **uniquement le sous-ensemble « stable entre BOM »**, et l'utilisateur ne peut pas drill-down sur les placements d'une BOM précise. | `MachineConfigDialog.jsx` |
| MAJEUR | **Pas d'édition de machine.** Seulement création + suppression (parité V1). `MachineTable` prévoit `onOpenContextMenu` (clic droit → ouvrir/éditer) mais c'est un **no-op**. | `MachinePnpWorkspace.jsx` (`onOpenContextMenu={() => {}}`) |
| MINEUR | **Synthèse du calcul feeders fixes non affichée.** Après « Calculer », `useFixedFeeders` calcule `fixedFeederChips`/`fixedFeederOverviewChips` (assignés/changés/ignorés) jamais rendus ; seul le message flash apparaît. | `MachinePnpWorkspace.jsx` |
| MINEUR | **Pas de pagination sur la table feeders fixes.** ~74 lignes rendues d'un bloc (V1 paginait par 25). Confort + DOM. | `MachinePnpTables.jsx` `FixedFeederTable` |
| MINEUR | **Détail de slot minimal.** Le clic sur un slot affiche une `Alert` résumée ; l'ancien popup riche (chips quantités/BOM) du cluster n'a pas été repris. À étoffer lors du redesign slot-strip (Phase 3). | `MachineConfigDialog.jsx` |

---

## 3. Constats techniques — correctness & robustesse

| Sév. | Constat | Réf. |
|---|---|---|
| MAJEUR | **`AbortController` absent partout.** `useWorkspaceData.loadWorkspace`, `useFixedFeeders.loadFixedFeederCandidates`/`loadFixedFeederRows`, `useMachineConfig.loadMachineSummary`/`loadMachineProductionPlan` font `setState` après `await` sans annulation → warnings React + races (réponse lente écrase l'état récent) si on ferme un dialogue / change de machine en cours de chargement. Généraliser le pattern `cancelled`/`requestId` déjà utilisé ailleurs dans le projet. | `useWorkspaceData.js:19`, `useFixedFeeders.js:69,50`, `useMachineConfig.js:64,80` |
| MINEUR | **`EditCartDialog` : accès `cart.id` non gardé.** Si `cart` passe à `null` pendant le PUT, `cart.id` est `undefined`. Risque faible (le dialogue est démonté quand `cart` est nul) mais garde triviale à ajouter. | `MachineCrudDialogs.jsx` (`handleSubmit`) |
| MINEUR | **`loadWorkspace` sans granularité d'erreur.** 4 endpoints en parallèle ; si un seul échoue, tout le rafraîchissement échoue avec un message générique, pas de reload partiel. | `useWorkspaceData.js:19-41` |

---

## 4. Dette technique

| Sév. | Constat | Réf. |
|---|---|---|
| MAJEUR | **`useMachineConfig.js` ~727 l. > 300.** À découper : `useMachineProductionPlan` (plan + maps dérivées) + `useMachineConfigDialog` (état dialogue/sélection) + module handlers. | `useMachineConfig.js` |
| MAJEUR | **`MachineConfigDialog.jsx` ~393 l. > 300.** Extraire `ProductionSequencePanel`, `MachineImplantationPanel` (lanes + table), `FeederMountPanel`. | `MachineConfigDialog.jsx` |
| MAJEUR | **`useFixedFeeders.js` 337 l. > 300.** Extraire l'état recherche/filtre/tri + `filteredFixedFeederRows` dans un sous-hook. | `useFixedFeeders.js` |
| MINEUR | **Couleurs hex en dur** (`#059669`, `#047857`, `#18181b`, `#27272a`, `#10b981`, `#38bdf8`, `#34d399`, `#f59e0b`…) dans tous les composants V2, au lieu des tokens `theme.js`/`colors`. Cohérent avec §5.1 de l'audit global ; au minimum centraliser dans des constantes partagées (le pattern `PANEL_SX` est un début). | tous les fichiers `components/machine/*` |
| MINEUR | **Couleur du bouton de confirmation incohérente.** `EditCartDialog` = bleu `#3b82f6`, alors que les autres confirmations = émeraude `#059669`. Uniformiser. | `MachineCrudDialogs.jsx` |

---

## 5. Accessibilité & finition

| Sév. | Constat | Réf. |
|---|---|---|
| MINEUR | **`Alert` d'erreur du dialogue feeder fixe non « dismissible »** : pas de `onClose`, l'utilisateur doit corriger pour la faire disparaître. | `FixedFeederDialog.jsx` |
| MINEUR | **Bannière « Vue V2… construction incrémentale »** : à retirer avant de promouvoir la V2 en défaut (flag on par défaut). | `MachinePnpWorkspace.jsx` |
| MINEUR | **Slot-strip** : lisibilité (libellés masqués > 45 slots, cellules écrasées, 2 couleurs) — traité dans le **redesign Phase 3** prévu séparément. | `MachinePnpSlotStrip.jsx` |

---

## 6. Feuille de route priorisée

**P0 — Compléter la fonctionnalité (rendre la V2 « complète »)**
1. Rebrancher la **recherche + filtres + tri** des feeders fixes (le hook fait déjà tout le travail).
2. Exposer le **filtrage du plan par révision BOM** + filtre commun/implantation dans le dialogue de config.
3. Ajouter l'**édition de machine** (via le menu contextuel prévu ou un bouton).

**P1 — Robustesse & dette structurante**
4. Généraliser `AbortController` sur tous les chargeurs des 3 hooks.
5. Découper `useMachineConfig`, `MachineConfigDialog`, `useFixedFeeders` sous 300 l.

**P2 — Finition**
6. Afficher les chips de synthèse après calcul ; pagination table feeders ; détail de slot enrichi.
7. Centraliser les tokens couleur ; uniformiser les boutons de confirmation ; `Alert` dismissible.
8. Retirer la bannière WIP au moment de promouvoir la V2 en défaut.

**Hors périmètre (planifié)** : redesign du slot-strip / vue machine (Phase 3).

---

## 7. Points positifs à conserver

- Réintégration propre : une seule implémentation active, code mort supprimé, boucle infinie corrigée.
- Flag runtime bien posé (lecture Electron > env > défaut) → publiable sans exposer le demi-fini.
- Dialogue de configuration cohérent : affectation/détachement, séquence réordonnable, validation d'OF, slot-strip + table, montage feeders — toutes les features cibles présentes et câblées au backend.
- Couverture de tests maintenue verte (73/73) à chaque incrément.

---

## 8. Suivi des corrections (2026-06-05)

Traité dans la même session (commits `a2c3f48` → `03f6361`, `npm test` 73/73 + test live Chrome) :

| Constat | État | Commit |
|---|---|---|
| §2 Recherche/filtres/tri feeders fixes non exposés | ✅ Corrigé (`FixedFeederFilters`) | `a2c3f48` |
| §2 Filtrage du plan par révision BOM non exposé | ✅ Corrigé | `2abf60a` |
| §2 Pas d'édition de machine / `onOpenContextMenu` no-op | ✅ Corrigé (menu contextuel + `EditMachineDialog`) | `a2c3f48` |
| §3 `AbortController` absent sur les chargeurs | ✅ Corrigé (garde de montage + « dernière requête gagne ») | `443aa62`, `03f6361` |
| §3 Couleur bouton confirmation incohérente | ✅ Uniformisée (émeraude) | `a2c3f48` |
| §4 `MachineConfigDialog` > 300 l. | ✅ 461 → 85 l. (panneaux extraits) | `221f1d0` |
| §4 `useFixedFeeders` > 300 l. | ✅ 375 → 241 l. | `ee156af` |
| §4 `useMachineConfig` > 300 l. | 🟡 802 → **582 l.** (sélecteurs extraits) — voir reste | `03f6361` |

**Bug trouvé au test live (non listé dans l'audit initial) :** le pattern `mountedRef`
introduit pour l'`AbortController` ne remettait pas la ref à `true` au montage → sous
React 18 StrictMode, le spinner de chargement restait bloqué. Corrigé dans les 3 hooks.

**Reste (P2 / suivi)** : afficher les chips de synthèse après calcul, pagination table
feeders, détail de slot enrichi (Phase 3), centralisation des tokens couleur, `Alert`
dismissible, retrait de la bannière WIP. Et la **découpe finale de `useMachineConfig`**
(<300) qui exige de fractionner le cœur effets/loop-fix — reportée jusqu'à l'ajout d'un
test de rendu V2 servant de filet.
