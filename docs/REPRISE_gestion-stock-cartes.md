# Prompt de reprise — bloc « Gestion de stock » (catalogue Cartes + import PDF)

> Copie-colle ce message au début d'un nouveau chat Cowork (dans le projet
> **PCB Flow Production Suite**). Le nouveau chat chargera automatiquement
> `CLAUDE.md`, `STRUCTURE.md` et cette fiche.

---

## Ce sur quoi on travaille

On développe un bloc **« Gestion de stock »** dans PCB Flow Production Suite,
**entièrement sur la branche `feat/gestion-stock-cartes`** et déployé **uniquement
sur le STAGING (:8001)**. Rien n'est en prod : on valide le design avant de promouvoir.

Fonctionnalités déjà **construites + validées sur staging** (commits sur `feat/gestion-stock-cartes`) :

1. **Stock Cartes + Commandes Client/Machine** (ADR 0017) — stock de cartes finies par
   référence, commandes client ou machine, préparation de « boîte », clients, catalogue
   de machines, historique des livrées.
2. **Révisions (REV A/B/C)** — stock, commandes et machines gérés par
   *(référence, révision)*. Préparer une commande décrémente le bon stock de révision.
3. **Catalogue Cartes** (ADR 0018) — menu Bibliothèque → « Cartes ». Fiche unifiée sur
   `BOM_REFERENCES` : référence, **code KELENN** (`part_number`), **nom**, **type**
   `SIMPLE`/`ASSEMBLY`, révisions, prix. Assemblages multi-niveaux (`ASSEMBLY_ITEMS` :
   sous-cartes + composants), prix = **somme auto des enfants**, garde-fou anti-cycle.
4. **Import commande PDF** — onglet dans « Commande Client/Machine ». Glisser-déposer
   un bon KELENN → parseur `pdfplumber` extrait le client (bloc « Adressé à »), les lignes
   `code → part_number + révision + nom + qté`, filtre les non-cartes. Match par
   `part_number` ; codes inconnus mappés à la main (mémorisés sur la carte). Crée la
   commande client. **Réf du bon** (« CO2601-10180 ») extraite, stockée sur la commande,
   affichée, + **alerte doublon** au réimport (non bloquante).

## Où on en est

- Tout ci-dessus est **codé, testé (531 tests backend verts) et validé dans Chrome sur
  :8001**. Commits sur `feat/gestion-stock-cartes`. **Pas en prod.**
- ADR : `docs/adr/0017-*.md`, `docs/adr/0018-*.md`. Migrations jusqu'à `c5d6e7f8a9b0`.
- **Reste à faire :**
  - (bas prio) Saisie du **nom/type carte au moment de l'import BOM** (aujourd'hui on
    backfill depuis la page Cartes). C'est la seule sous-tâche ouverte.
  - **Promotion prod** de tout le bloc quand Eric valide le design (PR `dev → main`).
  - Idées backlog : entrée stock auto à la clôture de production, historique mouvements
    de cartes, alertes dashboard (sous mini / échéance), bon de préparation PDF, générer
    une production depuis une commande.

## Manière de faire (rappel projet)

- **Lire d'abord** `CLAUDE.md`, `STRUCTURE.md`, dernier audit `docs/audits/`.
- **Git = loi** (`CLAUDE.md` §10) : `main` (stable) + `dev` + branches courtes ; jamais
  de push direct sur `main` ; PR + CI verte avant merge ; commits Conventional Commits.
  Le travail en cours est sur `feat/gestion-stock-cartes`. Utiliser le skill `git-workflow`.
- **Backend** : package `src` (jamais `src.backend`), imports relatifs, Pydantic v2,
  `utcnow()` de `database.py`. Modèles `src/models/`, routes `src/routes/`, services
  `src/services/`, migrations Alembic `src/alembic/versions/`.
- **Migrations** : idempotentes (`checkfirst`/existence-check), chaîne linéaire un seul
  head, appliquées au démarrage. **Ne jamais mettre `index=True` sur une colonne ajoutée
  par migration** (casse le roundtrip SQLite).
- **Frontend** : React (CRA, MUI v5, Zustand, HashRouter). Pages `pages/`, composants
  `components/{domaine}/`. API via `api/client.js`.
- **Tests** : `.\.venv\Scripts\pytest.exe serveur\src\tests\ -q` + `cd client\src\frontend; npm test`.
  Navigateur : **Google Chrome uniquement**. Toujours valider par un test + Chrome avant
  d'enchaîner.

## Outils à disposition (Cowork)

- **Windows-MCP PowerShell** (`mcp__Windows-MCP__PowerShell`) : git, pytest, build npm,
  restart serveurs, `sqlcmd`. PowerShell : pas de `$PID`/`??`, éviter l'interpolation
  exotique.
- **Claude in Chrome** (`mcp__claude-in-chrome__*`) : navigation, screenshots, `file_upload`
  pour tester l'import PDF, `find` pour localiser les éléments. Valider visuellement le staging.
- **File tools** (Read/Write/Edit), **workspace bash** (Linux sandbox, `pdfplumber` dispo,
  utile pour prototyper un parseur avant de coder dans le venv Windows).
- Agents délégables : `caveman:cavecrew-investigator/builder/reviewer`, `Explore`, `Plan`.

## Staging vs Prod (commandes clés)

- **Prod :8000** : `build-web`, `API_KEY=pcbflow-lan-2026`, base `ECB_Production`.
- **Staging :8001** : `build-web-staging`, `API_KEY=pcbflow-staging`, base
  `ECB_Production_STAGING` (copie jetable, isolée de la prod).
- **Rebuild staging** : dans `client/src/frontend`, `Copy-Item ..\..\web.staging.env .env`
  → `npm run build` → `Copy-Item ..\..\client.env .env` (restaure le dev).
- **Restart :8001** : stopper le process du port 8001, puis `Start-Process` de
  `.venv\Scripts\python.exe launch.py --host 0.0.0.0 --port 8001` depuis `serveur\` avec
  les env vars `WEB_STATIC_DIR` (build-web-staging), `API_KEY=pcbflow-staging`,
  `DATABASE_URL` (ECB_Production_STAGING). La migration s'applique au démarrage.
- **Redémarrer :8001 après tout changement backend** (routes/migrations).
- **Cache navigateur** : après un rebuild, aller sur `http://localhost:8001/index.html`
  (pas juste changer le `#/hash`) pour charger le nouveau bundle.
- **API test rapide** : header `X-API-Key: pcbflow-staging` sur `http://localhost:8001/api/...`.
- PDF exemple pour tester l'import : bon SPEOS `CO2601-10180.pdf` (fixture de test dans
  `serveur/src/tests/fixtures/commande_speos.pdf`).

## Première action suggérée dans le nouveau chat

« Reprends le bloc gestion-stock-cartes sur le staging. Fais le point sur l'état de la
branche `feat/gestion-stock-cartes` (git log, tests), puis on décide : soit on finit la
saisie nom/type à l'import BOM, soit on prépare la promotion prod. »
