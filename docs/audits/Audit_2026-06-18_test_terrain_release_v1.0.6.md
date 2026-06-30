# Audit — Test terrain release v1.0.6 (parcours complet)

> **Date** : 2026-06-18 · **Version testée** : 1.0.6 (Aide → À propos)
> **Poste** : atelier — host + client sur la même machine · **Mode** : prod **SQL Server**
> (localhost:1433, base `ECB_Production`, ODBC Driver 17 — connexion testée « Connectée »)
> **Méthode** : test piloté de l'app desktop Electron via computer-use, parcours complet
> du workflow avec un BOM réel.
> **BOM test** : `KT220430F_Carrier Board D3000` — 2 faces (`_TOP.txt` 317 lignes /
> `_BOT.txt` 257 lignes), exports Eagle `.txt`.
> Tags : #test-terrain #bug #audit

---

## 1. Résumé exécutif

Le cœur du workflow (création production → import lot → harmonisation → revue →
validation → **Machine PnP / implantation feeders / export PnP**) fonctionne et donne
de bons résultats. **Deux modules sont cependant bloqués en mode SQL Server** par un
même bug de dialecte SQL, et **un problème de workflow** fait que l'import d'une carte
recto/verso ne charge qu'**une seule face** en revue.

| # | Gravité | Module | Problème | Statut |
|---|---|---|---|---|
| T-001 | 🔴 P1 | Commande | Erreur SQL Server `dnp IS NOT 1` → génération liste à commander + export ERP impossibles | 🆕 Reproduit |
| T-002 | 🔴 P1 | Prix carte | « Impossible de calculer le coût — Erreur interne du serveur » (même cause SQL) | 🆕 Reproduit |
| T-003 | 🟠 P2 | Import / Revue | Import lot 2 faces (TOP+BOT) mais une seule face arrive en Revue / reliée à la production | 🆕 Reproduit |
| T-004 | 🟡 P3 | Import | Bouton « Sauver » : pas de toast de confirmation explicite | 🆕 Observé |
| T-005 | 🟡 P3 | Commande | Nom de commande auto incohérent (« Commande prod 3 » au lieu du nom réel) | 🆕 Observé |
| T-006 | 🟡 P3 | Revue BOM | Chips/bandeaux d'avertissement non homogènes entre faces | 🆕 Observé |
| T-007 | 🟡 P3 | Revue BOM | L'estimation bobine saisie est persistée en « stock dispo » (à confirmer) | 🆕 Observé |
| T-008 | 🟡 P3 | Base de données | Règles de type : priorités partagées + règle résiduelle `ESP-MODULE_COPY` | 🆕 Observé |

> ⚠️ Les codes T-0xx ci-dessus peuvent être reportés tels quels dans
> `docs/JOURNAL_TESTS_RELEASE.md` (table de triage) si souhaité.

---

## 2. Anomalies bloquantes (P1)

### T-001 · 🔴 P1 · Commande — erreur SQL Server `dnp IS NOT 1`

**Étapes pour reproduire :**
1. Production avec une BOM validée + stock validé (Revue BOM → Composants et stock → « Valider le stock »).
2. Ouvrir le module **Commande**.

**Résultat attendu :** liste « Composants à commander » remplie, export ERP possible.

**Résultat obtenu :** bandeau rouge, table vide. Message exact :

```
Error syncing production command: (pyodbc.ProgrammingError) ('42000',
"[42000] [Microsoft][ODBC Driver 17 for SQL Server][SQL Server]Syntaxe incorrecte
vers '1'. (102) ...Impossible de préparer les instructions. (8180)")
[SQL: SELECT ... FROM BOM_ITEMS
 WHERE BOM_ITEMS.bom_revision_id IN (?) AND BOM_ITEMS.dnp IS NOT 1]
[parameters: (57,)]
```

**Cause racine :** `BomItem.dnp.isnot(True)` est rendu par SQLAlchemy/pyodbc en
`dnp IS NOT 1`, syntaxe valide en SQLite mais **invalide en T-SQL** (SQL Server
n'accepte `IS [NOT]` qu'avec `NULL`). En SQLite (mode dev mono-poste) le bug est
invisible ; il n'apparaît qu'en SQL Server (prod multi-postes).

**Localisation (repo de ce poste) :** `serveur/src/services/command_service.py:708`.

> Le dev a **déjà corrigé** ce type de souci ailleurs avec le bon motif :
> - `serveur/src/routes/bom_revision_queries.py:144` → `BomItem.dnp == True  # noqa: E712 (SQL Server: IS 1 invalide)`
> - `serveur/src/services/report_service.py:165` → `BomItem.dnp == False  # noqa: E712 (SQL Server: IS 0 invalide)`
>
> Il reste **4 occurrences** non corrigées du motif fautif `dnp.isnot(True)` :
> `command_service.py:708`, `production_service.py:131`, `production_service.py:583`,
> `report_service.py:89`.

**Correctif recommandé :** remplacer `BomItem.dnp.isnot(True)` par une forme T-SQL valide.
Pour conserver la sémantique d'origine (inclure les lignes `dnp NULL` = « non DNP ») :

```python
from sqlalchemy import or_
... .filter(or_(BomItem.dnp == False, BomItem.dnp.is_(None)))  # noqa: E712
```

Si la colonne `dnp` est bien **NOT NULL default=False** (cf. `test_reports.py:150`),
le simple `BomItem.dnp == False  # noqa: E712` suffit et reste cohérent avec les lignes
déjà corrigées. ⚠️ Lever au passage l'incohérence de documentation : `report_service.py:86`
décrit encore `dnp` comme *nullable*, alors qu'un test la dit *NOT NULL*.

---

### T-002 · 🔴 P1 · Prix carte — « Erreur interne du serveur »

**Étapes pour reproduire :**
1. Production active avec BOM validée.
2. Ouvrir **Prix carte** (onglet « Coût de la production »).

**Résultat obtenu :** bandeau rouge « Impossible de calculer le coût de cette production
— Erreur interne du serveur. » Aucun coût affiché.

**Cause racine :** même bug de dialecte que T-001, dans l'agrégation costing —
`serveur/src/services/production_service.py:583` (et `:131`) `BomItem.dnp.isnot(True)`.

**Correctif :** identique à T-001 (corriger les 4 occurrences d'un coup).

---

## 3. Anomalie majeure (P2)

### T-003 · 🟠 P2 · Import lot 2 faces → une seule face en Revue / production

**Contexte :** une carte PCB a des composants **TOP et BOT** ; les deux faces doivent
être préparées ensemble.

**Étapes pour reproduire :**
1. Import BOM → « Choisir fichier(s) » → sélectionner les **2** fichiers
   (`..._BOT.txt` + `..._TOP.txt`) → mode **Lot**.
2. « Importer le lot » → les 2 faces passent à « Importée » (BOT 257, TOP 317 lignes). ✔
3. « Passer à la revue ».

**Résultat attendu :** les 2 faces présentes dans la session de revue, validables, puis
**2 BOM liées** à la production.

**Résultat obtenu :** la Revue n'affiche qu'**« 1 BOM dans la session »** (une seule face).
Ajouter l'autre face depuis la bibliothèque **remplace** la première au lieu de s'ajouter.
Au final la production n'a qu'**« 1 BOM liée »** (vérifié sur le dashboard). La 2ᵉ face
(ses 317 ou 257 composants) est **silencieusement exclue** de Commande et Machine PnP.

**Indices d'incohérence :**
- Le libellé de la Revue dit « Clique sur une ligne pour changer de BOM active. La revue se
  fait une BOM à la fois. » → un fonctionnement **multi-BOM** semble prévu.
- Le modèle de données le supporte : `prod01`/`prod02` affichent bien « 2 BOM liées ».
- Donc la régression est dans le **handoff Import → Revue** (et/ou la persistance de la
  session de revue qui n'en garde qu'une).

**Impact :** risque élevé d'oublier la moitié des composants d'une carte recto/verso
(commande incomplète, implantation incomplète). À traiter en priorité après les P1.

**Note :** contournement constaté peu intuitif — valider une face, revenir à l'import,
ré-ajouter l'autre face depuis la bibliothèque, re-valider. À clarifier/corriger.

---

## 4. Anomalies mineures (P3)

- **T-004 · Import — « Sauver » sans retour visuel.** Le clic sur « Sauver » (ligne de la
  Session BOM) enregistre bien la révision en bibliothèque (vérifié : BOT + TOP apparaissent
  ensuite sous « BOM enregistrées »), mais **aucun toast** de confirmation immédiat n'apparaît
  → l'utilisateur peut croire que rien ne s'est passé.
- **T-005 · Commande — nom auto incohérent.** À l'arrivée sur Commande, « Nom de commande »
  affiche « Commande prod 3 » (compteur générique) alors que la production s'appelle
  « TEST_AUDIT KT220430F 06/2026 ». Il se corrige ensuite en « Commande KT220430F… » après
  chargement. Harmoniser dès l'affichage.
- **T-006 · Revue BOM — chips/bandeaux non homogènes entre faces.** Face BOT : chips
  « 56 à vérifier / 40 harmonisées / 24 type(s) à confirmer » + bandeau « types à confirmer ».
  Face TOP : « 51 à vérifier / 122 harmonisées » (pas de chip « type à confirmer ») + bandeau
  « 3 point(s) restent à vérifier ». Libellés à uniformiser.
- **T-007 · Revue BOM — l'estimation bobine alimente le « stock dispo ».** Dans la fiche stock
  détaillée d'un composant, saisir une « épaisseur d'enroulement » calcule une quantité bobine
  (ex. 30 mm → 2558) qui est ensuite **persistée comme stock disponible** (le 10K est passé de
  « À commander » à « OK stock »). Probablement voulu, mais à confirmer : une valeur de test
  fausse alors le statut de commande. Prévoir un garde-fou / libellé explicite.
- **T-008 · Base de données / Règles de type.** Bandeau « 6 priorité(s) partagée(s) détectée(s) »
  et présence d'une règle résiduelle `ESP-MODULE_COPY` (priorité identique à `ESP-MODULE`).
  Nettoyer le référentiel et/ou départager les priorités.
- **Catalogue composants** : beaucoup de lignes avec `TYPE` vide (« - ») — à enrichir.

---

## 5. Ce qui fonctionne bien (validé en test)

- **Productions** : création + auto-navigation vers Import ; recherche ; menu contextuel
  (Renommer / Dupliquer / Archiver / Supprimer) ; **duplication** OK (toast + copie créée).
- **Import BOM** : import **lot** `.txt` Eagle, auto-détection Référence / Révision (REV_A) /
  Face (TOP/BOT) depuis le nom de fichier, parsing 257 + 317 lignes, sauvegarde bibliothèque.
- **Revue BOM** : tableau riche (valeur brute/revue, FP Eagle→PnP mappés, type auto, DNP,
  notes), harmonisation, filtres ; **fiche stock détaillée** avec calcul bobine dynamique ;
  « Valider les BOM » et « Valider le stock » fonctionnels.
- **Machine PnP** : affectation production → machine, **« Valider l'ordre »** calcule
  l'implantation (rampes avant/arrière, slots, communs, 0 non placé), **« Exporter PnP »**
  génère bien le `.txt` ; onglets **Feeders fixes** (110 auto) et **Chariots** (capacités) OK.
- **BOM enregistrées** : arbre par catégorie, **recatégorisation instantanée**, détail révisions
  (BOT=DRAFT, TOP=ACTIVE).
- **Base de données** : Empreintes (107), Composants (380), Règles de type (33),
  Enrichissement MPN (« Charger (cache) » OK).
- **Paramètres** : connexion SQL Server **« Connectée »**.
- **Dashboard** : KPI (productions, points à vérifier, empreintes PnP) cohérents.

---

## 6. Recommandations priorisées

1. **(P1, rapide)** Corriger les 4 `BomItem.dnp.isnot(True)` (command_service:708,
   production_service:131 & :583, report_service:89) → débloque **Commande** et **Prix carte**
   en SQL Server. Aligner sur le motif déjà utilisé (`== False # noqa: E712` ou forme NULL-safe).
2. **(P1, test)** Ajouter un **test pytest qui s'exécute sur SQL Server** (ou un linter
   interdisant `.isnot(<bool>)` / `.is_(<bool>)`) pour empêcher la régression — le bug est
   invisible avec SQLite seul.
3. **(P2)** Reprendre le **handoff Import → Revue** pour charger **toutes les faces** d'un lot
   et permettre 2 BOM liées (recto/verso) à une production.
4. **(P3)** Toasts de confirmation cohérents (Sauver), nom de commande dès l'affichage,
   uniformisation des chips/bandeaux de revue, garde-fou sur le stock estimé, nettoyage des
   règles de type.

---

## 7. Données de test laissées sur le poste

Productions créées pendant l'audit (à supprimer manuellement si souhaité — non supprimées
ici par prudence) :
- `TEST_AUDIT KT220430F 06/2026` (Active, 1 BOM liée = TOP REV_A)
- `Copie de TEST_AUDIT KT220430F 06/2026` (Brouillon)
- Référence `KT220430F_Carrier Board D3000` reclassée en catégorie **Carrier Board**
  (2 faces : BOT=DRAFT, TOP=ACTIVE).
- Composant `10K` : stock dispo = 2558 (valeur de test issue de l'estimation bobine).
- Machine `PNP-01` : ordre `TEST_AUDIT` validé + export `PNP-01_TEST_AUDIT_KT220430F_06_2026_pnp.txt`
  (dans Téléchargements).

---

*Audit réalisé en test piloté de l'app desktop v1.0.6 sur le poste atelier (SQL Server).*
