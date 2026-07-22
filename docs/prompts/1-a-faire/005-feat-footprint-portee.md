# [005] feat(revue-bom): changement de footprint avec choix de portée (+ MPN qui suit)

| Champ | Valeur |
|---|---|
| **ID** | 005 |
| **Type** | feat |
| **Branche cible (PR)** | `dev` |
| **Branche de travail** | `feat/footprint-portee` (créée depuis `dev` à jour) |
| **Priorité** | normale |
| **Créé le** | 2026-07-21 |
| **Dépend de** | 002 (mergé — réutilise son pattern de portée) |
| **Peut tourner en parallèle** | non (touche `BomReviewTab` / `BomViewerPage`, comme 002) |

---

## 1. Objectif (le POURQUOI)

En Revue BOM, on veut pouvoir **changer le footprint** d'un composant et que **la commande/MPN suive** le bon composant en bibliothèque — exactement comme le 002 l'a fait pour la **valeur**. Cas réel : des `4.7k` en `1206` qu'on veut passer en `0603` parce qu'on a ce `4.7k 0603` en stock (référence connue) ; la commande doit alors prendre **le MPN du 4.7k 0603**.

Deux problèmes actuels à corriger :
1. Éditer un footprint applique le changement à **toutes les lignes de même footprint Eagle** (tous les `1206`, tous types confondus) — **trop large**.
2. **Aucun choix de portée** (contrairement à la valeur depuis le 002).

## 2. Spécification (le QUOI)

En éditant le footprint (colonne footprint PnP) d'une ligne et en **validant** : si d'autres lignes partagent la **même (valeur harmonisée + ancien footprint)**, afficher un **dialog de portée** :
- **« Ce composant uniquement »**
- **« Tous les [valeur] en [ancien footprint] »** (afficher le nombre N — ex. « tous les 4.7k en 1206 (6) »)

Puis appliquer le nouveau footprint selon le choix. La résolution composant/MPN suit ensuite **automatiquement** (le matching backend est déjà sur `(valeur, footprint)`).

**Critères d'acceptation :**
- [ ] Éditer un footprint **partagé** → dialog de portée (ce composant / tous [valeur+footprint], avec N).
- [ ] « **Tous** » ne touche que les lignes de **même valeur ET même ancien footprint** (ex. tous les `4.7k 1206` → `0603` ; **pas** les autres `1206`).
- [ ] « Ce composant » → seule la ligne éditée change.
- [ ] Footprint non partagé → pas de dialog, application directe.
- [ ] Après enregistrement + génération de la **commande** : la ligne prend le **MPN du composant (valeur, nouveau footprint)** s'il existe en bibliothèque ; sinon **sans MPN** (à enrichir), **jamais l'ancien MPN** (règle E01).
- [ ] « Annuler » / undo restaure l'ancien footprint.
- [ ] Le comportement actuel trop large (regroupement par `footprint_eagle`) est **retiré**.

**Hors périmètre :** la valeur (déjà livrée en 002) — mais on **réutilise/généralise** son dialog de portée.

## 3. Architecture & décisions

**Backend : aucun changement de logique.** Le matching (`serveur/src/services/component_library_service.py` → `match_candidates`) résout déjà sur `(value, footprint)` : `lookup[(normalize(value), normalize(footprint))]`, avec `footprint_candidates=[footprint_pnp, footprint_eagle]`. La propagation à la commande/MPN est donc **automatique** (comme E01). À **vérifier/tester**, pas réécrire.

**Frontend :**

| Zone | Fichier | Action |
|---|---|---|
| Handler de portée footprint | `client/src/frontend/src/pages/BomViewerPage.jsx` (`handleFootprintChange`, ~l.354) | remplacer le regroupement par `footprint_eagle` par une logique **scopée** (miroir de `handleBulkValueChange`, l.383) : grouper par **(value_harmonized + ancien footprint)** ; gérer l'undo. |
| Cellule footprint + dialog | `client/src/frontend/src/components/bom/BomReviewTab.jsx` (`onFootprintChange`) | déclencher le dialog de portée à la validation si frères de même (valeur+footprint). |
| Dialog de portée | `client/src/frontend/src/components/bom/ValueScopeDialog.jsx` (créé en 002) | **généraliser en `ScopeDialog`** paramétrable (valeur **ou** footprint), ou créer `FootprintScopeDialog` sur le même modèle. |

**Décisions actées (Eric, 2026-07-21) :**
- Portée = **« ce composant » / « tous ceux de même valeur + même ancien footprint »** (pas « tous les footprint X »).
- Le **MPN suit (valeur, footprint)** ; pas de fallback sur l'ancien MPN.
- Objectif : parité footprint ↔ valeur (le 002 a fait la valeur ; ce prompt fait le footprint).

## 4. Plan d'implémentation

1. Généraliser `ValueScopeDialog` → `ScopeDialog` réutilisable (ou dupliquer proprement pour le footprint).
2. `handleFootprintChange` : à la validation avec footprint réellement changé, compter les frères de **même (valeur harmonisée + ancien footprint)** ; si > 0 → ouvrir le dialog ; sinon appliquer direct. **Supprimer** le regroupement par `footprint_eagle`.
3. Appliquer selon le choix + pousser l'undo (comme la valeur).
4. **Vérifier la propagation commande** : match sur (valeur, nouveau footprint) → bon MPN ; cas « (valeur, footprint) absent de la biblio » → sans MPN.
5. Tests + staging + **captures front** (obligatoire, cf ORCHESTRATEUR §5).

> `BomReviewTab.jsx` / `BomViewerPage.jsx` sont déjà volumineux : extraire la logique de portée (hook/dialog partagé) plutôt que gonfler.

## 5. Tests

**Automatiques :**
- `npm test` : dialog de portée footprint ; « tous [valeur+footprint] » ne touche que le bon sous-ensemble ; « ce composant » ; non-partagé = pas de dialog ; undo.
- `pytest` : compléter `test_value_rename_mpn_propagation.py` (ou nouveau) avec un cas **footprint** : changer le footprint → la commande résout le composant `(valeur, nouveau footprint)` et son MPN ; absent → sans MPN.

**Staging (:8001) — avec captures :**
- [ ] BOM avec plusieurs `4.7k 1206` → changer un footprint en `0603` → « tous » → **seuls** les `4.7k 1206` passent en `0603` (les autres `1206` inchangés).
- [ ] Générer la commande → la ligne `4.7k 0603` prend le **MPN du 4.7k 0603** en bibliothèque.
- [ ] Captures dans `docs/prompts/preuves/005/`.

## 6. Définition de « terminé »

- [ ] Critères §2 remplis
- [ ] `pytest` + `npm test` verts
- [ ] Déployé staging, scénarios §5 vérifiés **+ captures** dans `docs/prompts/preuves/005/`
- [ ] CI GitHub verte
- [ ] PR ouverte vers `dev`
- [ ] `RESULTAT.md` rédigé

## 7. Contraintes & rappels (CLAUDE.md)

- Package Python = **`src`** · `utcnow()`.
- Composant React > 300 lignes → découper (extraire hook/dialog partagé).
- Pas de front livré sans **preuve visuelle** (captures staging).
- Branche courte depuis `dev`, Conventional Commits, PR vers `dev`, CI verte, Chrome uniquement.

---

## 8. RÉSULTAT — à remplir par l'orchestrateur

<!-- Produire 005-feat-footprint-portee.RESULTAT.md selon la structure d'ORCHESTRATEUR.md §5. -->
