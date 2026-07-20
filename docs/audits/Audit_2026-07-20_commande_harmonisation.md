# Audit — Page Commande & Harmonisation des valeurs BOM

**Date :** 2026-07-20
**Périmètre :** 3 features demandées (quantité bobine auto, fournisseur par composant, harmonisation RKM des résistances) + pistes d'amélioration + plan de mise en œuvre.
**Statut :** analyse (aucun code modifié). Décisions de conception à valider en fin de document.

---

## 1. Feature A — Sélection auto de la quantité « bobine » (page Commande)

### Besoin
Pour certains composants, la bobine complète (2000 / 3000 / 5000) coûte peu (≈ 20–50 €). Dans ce cas, pouvoir **choisir cette quantité via un menu déroulant**, et idéalement la **présélectionner automatiquement** quand la bobine est bon marché.

### État actuel du code
- La quantité « à commander » = `besoin − stock`, **sans aucun arrondi bobine**. Calculée deux fois :
  - Front (affichage) : `client/src/frontend/src/pages/CommandPage.jsx:541-584`.
  - Back (export ERP) : `serveur/src/services/command_service.py:102-113`.
- **Aucune liste de tailles de bobine** n'est stockée ni codée (pas de 2000/3000/5000 en dur).
- Deux sources de « taille de bobine » existent mais sont **inexploitées dans la commande** :
  - `Component.qty_per_reel` (`serveur/src/models/bom.py:112`) — taille de bobine par composant, mais **non remontée** dans `get_command_summary` (`command_service.py:826-846`).
  - `SupplierOffer.price_breaks` — JSON `[{qty, price}]` (`serveur/src/models/commands.py:126`) : les **paliers de prix** du fournisseur, déjà en mémoire côté table (`ProcurementTable.jsx:257`). Ce sont souvent exactement les seuils de bobine (ex. 2000, 3000, 5000).
- Le recalcul du prix à une quantité donnée existe déjà : `price_at_quantity` (`suppliers/base.py:44-62`), `effectivePrice`/`priceAtQuantity` (`utils/supplierOffers.js:23-41`). Changer la quantité met le prix à jour automatiquement.
- L'override de quantité par ligne est **déjà persistable** : `COMMAND_LINE_DETAILS.quantity_to_order` (`commands.py:176`) via `PUT /commands/{id}/line-details`.

### Conception proposée
1. **Exposer `qty_per_reel`** dans `get_command_summary` (une ligne à ajouter au dict agrégé) et dans le mapping front → prérequis commun.
2. **Menu déroulant « Quantité »** par ligne, dont les options sont construites à partir de :
   - le besoin exact (`à commander`) ;
   - les seuils de `price_breaks` de l'offre retenue ≥ besoin (bobines partielles) ;
   - `qty_per_reel` (bobine complète) si renseigné.
   Chaque option affiche **quantité + prix unitaire + coût total** à cette quantité → Eric voit d'un coup d'œil « bobine de 2000 = 22 € ».
3. **Auto-présélection** : si le **coût total de la bobine complète ≤ seuil configurable** (ex. 40 €) **ou** si le gain sur le prix unitaire est significatif, présélectionner la bobine ; sinon garder le besoin. Seuil dans les réglages (global) et/ou surchargé par composant.
4. **Persistance** : le choix écrit `COMMAND_LINE_DETAILS.quantity_to_order` (mécanisme existant, aucune migration).

### Décisions à valider
- Source des tailles de bobine : `price_breaks` (dynamique par fournisseur) **et/ou** `qty_per_reel` (statique par composant) **et/ou** liste fixe.
- Seuil « bobine bon marché » (€) et sa portée (global vs par composant).
- Auto-présélection réellement appliquée (écrit la quantité) **ou** simple suggestion visuelle à confirmer.

---

## 2. Feature B — Choix manuel du fournisseur par composant (page Commande)

### Besoin
Pouvoir **choisir le fournisseur par composant** (menu déroulant), car l'offre proposée par défaut est parfois une bobine complète au montant excessif.

### État actuel du code
- La sélection fournisseur est aujourd'hui **globale** et **non persistée** : `strategy` (« moins cher » / « prioriser un fournisseur ») + `prioritySupplier`, choisis en haut de table pour **toutes** les lignes (`ProcurementTable.jsx:62-63, 215-231`). Logique : `SupplierOfferService.select_best` (`supplier_offer_service.py:224-262`), miroir front `selectBest` (`supplierOffers.js:37-82`).
- Il existe **déjà** un emplacement de persistance **par ligne** : `COMMAND_LINE_DETAILS.manual_supplier / manual_supplier_part / manual_unit_price / manual_currency / manual_product_url` (`commands.py:181-185`), mais c'est une **saisie libre** (texte + prix tapés à la main), pas un choix parmi les offres API. L'offre manuelle **prime déjà** sur les offres auto : `best = manual || selectBest(...)` (`ProcurementTable.jsx:262`).
- Les offres de chaque composant sont déjà chargées en mémoire (`offersByComponent`, `ProcurementTable.jsx:141-153`) avec `supplier`, `unit_price`, `price_breaks`.

### Conception proposée
Deux options, à trancher :

- **Option 1 — réutiliser `manual_*` (aucune migration).** Le menu déroulant liste les offres du composant ; à la sélection, on remplit les champs `manual_*` avec les données de l'offre choisie (fournisseur, réf, prix, devise, URL). On profite de la persistance et de la priorité déjà en place. **Inconvénient :** le prix devient un instantané figé (ne se met plus à jour au refresh) — ce qui peut aussi être **voulu** (verrouille le prix choisi).
- **Option 2 — nouvelle colonne `selected_supplier` (par ligne).** On stocke juste le **code fournisseur** retenu ; `select_best` / `selectBest` et l'export ERP privilégient l'offre de ce fournisseur pour cette ligne (repli si indisponible). **Prix restent « live »**. Nécessite 1 colonne nullable + migration + logique dans back, front et export.

**Recommandation :** Option 2 (plus « juste » pour « choisir le fournisseur de ce composant », prix frais), en gardant la saisie libre `manual_*` existante pour les cas 100 % custom. Si on veut zéro migration et livrer vite, Option 1 suffit.

### Décisions à valider
- Option 1 (réutiliser manual_\*, prix figé, 0 migration) **ou** Option 2 (colonne `selected_supplier`, prix live, 1 migration).
- Le menu liste-t-il aussi une entrée « quantité = besoin » pour éviter la bobine complète (lien avec Feature A) ?

---

## 3. Feature C — Harmonisation RKM des valeurs à l'import (résistances)

### Besoin
Harmoniser automatiquement les valeurs, surtout des résistances, du format **RKM** (lettre = séparateur décimal) vers un format décimal standard : `49K9 → 49.9K`, `4R7 → 4.7R`, `2M2 → 2.2M`, etc.

### État actuel du code
- L'harmonisation est **backend, uniquement à l'import** : `harmonize_bom_items` → `harmonize_value` → `harmonize_resistor_value` / `harmonize_capacitor_value` (`serveur/src/services/harmony_rules.py:113-141`). Point d'entrée import : `bom_service.import_bom` (`bom_service.py:57`).
- La règle résistance actuelle (`harmony_rules.py:30`) **met seulement l'unité en majuscule** (`2.2k → 2.2K`) et suffixe `R` à un nombre nu (`10 → 10R`). Elle **ne décode pas** la notation RKM :
  - `49K9` → **`49K9`** (inchangé, le `9` après `K` n'est pas traité).
  - `4R7` → **`4R7`** (inchangé).
  - Condos : `4n7` est **volontairement conservé** (`4n7`), test explicite `test_harmony_rules.py:152`.
- Le typage à l'harmonisation repose sur le **préfixe de désignateur** (`infer_component_type`, `file_parser.py:31`) : seul le préfixe **exactement `R`** déclenche la règle résistance. `RN*`, `RV*`, `RT*` → passthrough (jamais harmonisés comme résistances).
- **Aucun test** ne couvre la notation RKM (angle mort).

### Conception proposée
- Point d'insertion unique : `harmonize_resistor_value` (`harmony_rules.py:30`) — traverse toutes les résistances à l'import, sans toucher aux routes ni au front.
- Règle RKM résistances : détecter le motif `\d+[RKMrkm]\d+` (lettre encadrée de chiffres) et le convertir en `<entier>.<décimales><UNITÉ>` :
  - `49K9 → 49.9K`, `4R7 → 4.7R`, `2M2 → 2.2M`, `1R0 → 1R` (normaliser `.0`), `0R5 → 0.5R`.
  - Formes déjà décimales (`10K`, `4.7R`, `100R`, `2.2K`) → **inchangées**.
  - Casse : `49k9 → 49.9K` (unité en majuscule).
- **Idempotence obligatoire** : `harmonize_resistor_value("49.9K")` doit renvoyer `49.9K` (des scripts de masse relancent la fonction, cf. `reharmonize_bare_caps.py`, `fix_nc_resistor_harmonization.py`). Ne pas casser le garde-fou NC/DNP (`harmony_rules.py:48`).
- Ajouter une **batterie de tests RKM** (`test_harmony_rules.py`).

### Décisions à valider
- **Condensateurs aussi ?** `4u7 → 4.7uF`, `4n7 → 4.7nF`, `4p7 → 4.7pF`. ⚠ Cela **change** le comportement actuel (`4n7` est conservé aujourd'hui, test à mettre à jour).
- **Préfixes élargis ?** Couvrir `RN`, `RV`, `RT` (réseaux/ajustables) comme résistances, ou rester au strict `R` ?
- **Édition manuelle en revue** : appliquer aussi la normalisation RKM quand Eric édite une valeur à la main (aujourd'hui non re-harmonisée) — via un bouton « Normaliser » ou à l'écriture. Option ?

---

## 4. Pistes d'amélioration supplémentaires (proactif)

**Page Commande**
- **Afficher le coût total par ligne et le total de commande** (panier) selon fournisseur + quantité retenus → rend visible le « montant excessif ». Aujourd'hui la table montre prix unitaire et prix à la quantité, mais pas de total ligne ni de total commande cumulé.
- **Badge « bobine surdimensionnée »** : signaler les lignes où on commande une bobine complète pour un besoin minime (ex. besoin 12, bobine 5000).
- **MOQ / multiples de conditionnement** : les fournisseurs renvoient un `MinimumOrderQuantity` (RS le documente mais ne le mappe pas, `rs.py:30`) — le parser et arrondir la quantité aux multiples.
- **Mémoriser la stratégie / le fournisseur au niveau de la commande** (aujourd'hui état d'UI volatil).

**Import BOM / qualité des données**
- **Passer `validate_harmonized_value` dans le pipeline d'import** (aujourd'hui non appelée) pour marquer « à vérifier » les valeurs non conformes.
- **Contrôle de vraisemblance des quantités BOM** : signaler une quantité par carte improbable (ex. l'anomalie ≈ 82 × 100nF/carte du Carrier détectée le 16/07) — un simple seuil ou un z-score par footprint.
- **Cohérence des unités condensateurs** (`u`/`n`/`p` + `F`) et normalisation systématique.

---

## 5. Plan de mise en œuvre proposé (par lots)

**Lot 1 — rapide, fort impact, faible risque (backend surtout)**
1. Feature C : RKM résistances (additif, périmètre net, testable, backend-only).
2. Exposer `qty_per_reel` dans le résumé de commande (prérequis Feature A).

**Lot 2 — commande, valeur métier directe**
3. Feature A : menu déroulant « quantité » (besoin / paliers price_breaks / bobine) avec coût affiché + auto-présélection au seuil.
4. Feature B : menu déroulant « fournisseur » par ligne (option retenue en §2).

**Lot 3 — confort & qualité (nice-to-have)**
5. RKM condensateurs + re-harmonisation à l'édition manuelle.
6. Total ligne + total commande, badge bobine surdimensionnée, MOQ/multiples.
7. Contrôles qualité BOM (validation + vraisemblance quantités).

Chaque lot suit le workflow projet : branche courte → tests (pytest + npm) → PR `dev` → CI verte → staging :8001 → validation → release `dev→main` → rebuild + :8000.

---

## 6. Récapitulatif des décisions à trancher

| # | Sujet | Choix |
|---|---|---|
| A1 | Source tailles de bobine | price_breaks / qty_per_reel / liste fixe |
| A2 | Seuil « bobine bon marché » (€) + portée | à définir |
| A3 | Auto-présélection appliquée ou suggestion | à définir |
| B1 | Réutiliser `manual_*` (0 migration, prix figé) vs colonne `selected_supplier` (prix live) | à définir |
| C1 | Harmoniser aussi les condensateurs (change `4n7`) | oui / non |
| C2 | Élargir aux préfixes RN/RV/RT | oui / non |
| C3 | Normaliser aussi à l'édition manuelle | oui / non |
