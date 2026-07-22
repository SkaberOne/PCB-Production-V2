# [011] feat(catalogue): import en masse du catalogue depuis le partage réseau (Eagle only)

| Champ | Valeur |
|---|---|
| **ID** | 011 · **Type** feat · **Branche cible** `dev` · **Branche** `feat/import-catalogue-masse` |
| **Priorité** | haute · **Dépend de** 003/006 (parseur Eagle + chaîne d'import, mergés) · **Parallèle** : non avec un prompt touchant l'import/catalogue |
| **Créé le** | 2026-07-22 |

## 1. Objectif (le POURQUOI)

Peupler **en masse** la base (catalogue **cartes** + **composants** utilisés) à partir du dépôt de conception réseau, **sans lien avec une production**. But : une grosse passe pour importer toutes les cartes qu'on produit, puis (dans le futur) n'ajouter que les **nouvelles révisions**. **Eagle uniquement** pour ce prompt ; les cartes KiCad sont **détectées et listées « à venir »**, pas importées.

> Eric est conscient qu'une grosse passe manuelle suivra pour renseigner les **MPN** des nouveaux composants.

## 2. Spécification (le QUOI)

**Parcours côté serveur** (PAS un upload navigateur) : le backend (sur le host LAN) lit un **chemin racine que l'utilisateur CONFIGURE dans l'application** (écran Paramètres) — **jamais** un chemin codé en dur. L'appli doit rester **portable** (autre site, autre société, changement de chemin dans le futur) : le dossier des projets est un **réglage**, pas une constante. Exemple de valeur actuelle (à saisir, modifiable à tout moment) : `\\rs\Elec\00 - Conception PCB\Articles sur plan`.

**Structure réelle à exploiter (validée) :**
```
<racine>/
  KT<référence> - <nom carte>/        ← ex. "KT190562 - NanoSH MK2"
    Rev.A/  Rev.B/  Rev.C/ ...         ← une révision par sous-dossier
      Conception/                      ← fichiers CAO ICI (.brd + .sch, ou .kicad_pcb → KiCad)
      Production/
```
- **Référence + nom** = depuis le dossier carte (`KT<ref> - <nom>`), regex ex. `^(KT\d+[A-Z]?)\s*-\s*(.+)$`.
- **Révision** = depuis le sous-dossier `Rev.<X>` (`Rev.A` → `A`).
- **Fichiers CAO** dans `Rev.<X>/Conception/`. **Ne PAS se fier au nom de fichier** (incohérent : `KT190406A.kicad_pcb` vs `NANO-SH MK2 REV.A.brd`).

**Pour chaque (carte, révision) :**
- Si la révision est **déjà en base** → **ignorer** (idempotent : on n'importe que les révisions absentes).
- Si **Eagle** (`.brd` + `.sch` présents) → parser (réutiliser `services/cao/parser_eagle`) → chaîne d'harmonisation existante → créer/enrichir **BomReference** (référence, nom, `part_number`, `card_type`) + **BomRevision** (révision) + **BomItems** + **Components** (MPN vide) — **hors production**.
- Si **KiCad** (`.kicad_pcb`) → **ignorer + lister** dans le rapport (« KiCad à venir »).
- Si aucun fichier CAO exploitable → lister en avertissement.

**Rapport final** (à l'écran + persistable) : nb cartes scannées, révisions **importées**, révisions **déjà en base** (ignorées), **cartes KiCad ignorées** (liste), **nouveaux composants** créés, **erreurs** par carte.

**Critères d'acceptation :**
- [ ] Le **chemin racine des projets est un réglage éditable dans l'app** (Paramètres), **persistant**, modifiable — **aucun chemin en dur** ; l'import utilise ce réglage.
- [ ] Un déclencheur (UI) lance l'import en masse sur le chemin **configuré**, **côté serveur**.
- [ ] Cartes Eagle importées : référence + nom (dossier), révision (`Rev.X`), BOM + composants créés ; **hors production**.
- [ ] **Idempotent** : relancer n'importe que les révisions **absentes** ; les existantes sont ignorées.
- [ ] Cartes **KiCad détectées et listées** (non importées).
- [ ] **Rapport clair** (importées / ignorées / KiCad / composants créés / erreurs).
- [ ] Captures `docs/prompts/preuves/011/`.

**Hors périmètre :** parseur KiCad (prompt ultérieur) ; renseignement des MPN (passe manuelle) ; toute logique de production.

## 3. Architecture & décisions

- **Backend, parcours de dossier serveur** — endpoint ex. `POST /bom/import-catalogue` `{ dry_run? }` qui utilise le **chemin racine du réglage** (Paramètres). Le chemin est un **paramètre applicatif persistant** (nouvelle clé de config dédiée — ex. `StockSettings` ou `ErpDefaults` — ou une table de settings), **éditable dans l'écran Paramètres**, **jamais codé en dur**. Un `root_path` explicite en override reste possible, mais la source normale = le réglage.
- **Frontend Paramètres** : ajouter un champ « Dossier des projets (import catalogue) » éditable + persistant (validation légère du chemin).
- **Réutiliser** : `services/cao/detect` + `parser_eagle` (003) et la **chaîne d'harmonisation/création d'items** branchée par 006 (`bom_revision_imports` / `bom_file_service`). Extraire la logique commune si nécessaire.
- **Détection révision existante** : par (référence/part_number, révision) sur `BomReference` + `BomRevision`.
- **Robustesse** : le parcours doit tolérer dossiers hétérogènes (Archives, `history`, dossiers sans `Rev.X`, `Conception` manquant) sans planter — les signaler dans le rapport.
- **Volume** : ~134 cartes × plusieurs révisions = **grosse opération**. Prévoir un **mode `dry_run`** (aperçu : ce qui serait importé, sans écrire) + un rapport de progression. Si l'UX/volume/temps pose souci (timeout, feedback) → **ouvrir un échange** plutôt que bricoler ; envisager un découpage en incréments (1. parcours+dry-run+rapport ; 2. import réel ; 3. UI).
- Décisions (Eric, 2026-07-22) : **Eagle-only** ; structure `KT<ref> - <nom>/Rev.X/Conception` ; **n'importer que les révisions absentes** ; pour peupler le catalogue (pas une production).

**Frontend :** un écran (dans « Base de données » ou une action dédiée) pour saisir/confirmer le chemin, lancer un **dry-run** puis l'**import**, et afficher le **rapport**.

## 4. Plan d'implémentation

1. **Cartographier** la chaîne d'import de 006 (point d'entrée items → harmonisation → BomReference/Revision/Items/Components).
2. **Walker** serveur : parcourir `<racine>/KT… - …/Rev.X/Conception/` ; extraire (référence, nom, révision) de l'arborescence ; détecter Eagle vs KiCad.
3. **Dry-run** : produire le rapport (importables / déjà en base / KiCad / erreurs) **sans écrire**.
4. **Import réel** : pour chaque (carte, révision Eagle absente) → parser → chaîne d'harmonisation → créer BomReference/Revision/Items/Components (MPN vide).
5. **UI** : chemin + dry-run + import + rapport.
6. Tests (sur un mini-arbre de fixtures reproduisant la structure, incl. une carte Eagle + une « KiCad » + une révision déjà en base) + staging + captures.

## 5. Tests

- `pytest` : walker (extraction ref/nom/révision depuis l'arborescence) ; idempotence (révision déjà en base ignorée) ; Eagle importé, KiCad listé ; robustesse (dossiers biscornus). Fixtures = mini-arbre sous `serveur/src/tests/fixtures/`.
- `npm test` : écran déclencheur + rapport.
- **Staging** : dry-run puis import d'un petit sous-ensemble ; rapport cohérent ; captures `preuves/011/`.

## 6. Définition de « terminé »

- [ ] Critères §2 remplis (KiCad = listé, pas importé)
- [ ] `pytest` + `npm test` verts
- [ ] Déployé staging, dry-run + import vérifiés **+ captures** `preuves/011/`
- [ ] CI verte · PR vers `dev` · `RESULTAT.md`

## 7. Contraintes & rappels

- **Lecture seule** sur le partage réseau (ne JAMAIS écrire dans `\\rs\Elec\...`).
- Package `src` · `utcnow()` · imports relatifs · migration si nouveau champ (checkfirst, pas d'index=True sur colonnes ajoutées).
- Ne pas commiter de gros fixtures inutiles ; mini-arbre de test seulement.
- Composant React < 300 lignes · pas de front sans preuve visuelle.
- Branche courte depuis `dev`, Conventional Commits, PR vers `dev`, CI verte, Chrome uniquement.

## 8. RÉSULTAT — à remplir par l'orchestrateur
