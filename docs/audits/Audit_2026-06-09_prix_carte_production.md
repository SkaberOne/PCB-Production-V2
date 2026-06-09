# Audit 2026-06-09 — Onglet « Prix carte à la production »

## Contexte

Objectif : ajouter à ECB Production Manager un onglet de **chiffrage du prix d'une
carte produite** (coût de revient, voire prix de vente). Cet audit cadre la
fonctionnalité avant implémentation. Il croise trois sources :

1. Les **méthodes de l'industrie PCBA** (recherche web, juin 2026).
2. Le **modèle de calcul historique ECB** (fichier Excel `BOM KT220132C Carrier
   Board Ricoh.xlsx`, feuilles `BOM` / `Calcule` / `Cout`).
3. L'**état actuel du code** (modèle de données, services, pages).

Périmètre retenu avec le demandeur : matière (composants BOM) + PCB nu + main
d'œuvre + temps machine + frais fixes (NRE) + marge. Livrable de cadrage :
ce document. **Aucun code n'est encore écrit** — décisions d'archi à valider.

---

## 1. Méthode de l'industrie (référentiel)

Le modèle dominant est le **cost-plus** : somme des coûts réels, puis marge.
Décomposition standard du coût unitaire d'une carte :

| Poste | Part typique | Calcul |
|---|---|---|
| Composants (matière BOM) | 50–70 % | Σ ( qté/carte × prix unitaire au palier de quantité ) |
| PCB nu | 10–20 % | Prix panneau amorti sur le nombre de cartes |
| Assemblage (MO + machine) | 10–25 % | Au placement (~0,0015–0,03 €/point) **ou** taux horaire chargé × temps |
| NRE / frais fixes | 100–300 € / design | Pochoir, programmation PnP/AOI, setup feeders — **amorti sur la série** |
| Marge | 25 % typique faible/moyen volume | `prix = coût / (1 − marge)` |

**Formule de synthèse :**

```
Prix unitaire = [ Σ(composants) + PCB nu + assemblage + (NRE / quantité) + overhead ] / (1 − marge)
```

Le taux horaire « chargé » (*burdened rate*) fusionne main d'œuvre directe et frais
généraux (~40 €/h en référence). Le coût machine/heure se calcule via
`(prix machine + maintenance sur durée de vie) / heures d'exploitation`. Le double
face ≈ deux passages SMT (double setup et temps).

---

## 2. Modèle de calcul ECB historique (reconstitué)

Le fichier Excel contient trois feuilles. Voici le flux complet, formules à l'appui.

### 2.1 Feuille `BOM` — table `liste_bom__11`

| Col | Champ | Rôle |
|---|---|---|
| A | Composant | Référence |
| B | Empreinte | Footprint |
| C | Quantité/carte | Multiplicateur ligne |
| D | Quantité Totale | `= C × Calcule!B1` (nb cartes) |
| E | **Prix** | Prix unitaire composant (€) — **saisi à la main** |
| F–J | Feeders, Plate PnP, Plate Soft, À la main, À commander | Métadonnées PnP/appro |
| K | LIEN | URL Mouser/DigiKey/Samtec |

### 2.2 Feuille `Calcule`

| Cellule | Libellé | Formule | Valeur |
|---|---|---|---|
| B1 | Nb de cartes | (saisi) | **15** |
| B2 | Prix_Unitaire | `=SUMPRODUCT(BOM!E:E, BOM!C:C)` | 70,23 € |
| B3 | Prix_Totale | `=B2*B1` | 1 053,47 € |

`B2` = coût **matière composants pour UNE carte** (somme des prix unitaires
pondérés par la quantité/carte).

### 2.3 Feuille `Cout` — le chiffrage

**Coût matériel (€, par carte sauf mention) :**

| Cellule | Libellé | Formule | Valeur |
|---|---|---|---|
| E5 | Composants / carte | `=Calcule!B2` | 70,23 |
| E6 | Pâte à braser / carte | (constante) | 2,00 |
| E7 | Achat PCB (total série) | (saisi) | 1 645,92 |
| I14 | **NB de carte produite** | (saisi) | **20** |
| E8 | PCB / carte | `=E7/I14` | 82,30 |
| E9 | Stencils | (saisi) | 74,87 |
| E10 | Total matériel / carte | `=E5+E8+E9+E6` | 229,40 |
| E11 | Matériel carte **HT** | `=E10` | 229,40 |
| E12 | Matériel carte **TTC** | `=E11+(E11*0,2)` | 275,28 |

**Temps de production (heures, par carte) :**

| Cellule | Libellé | Formule | Valeur |
|---|---|---|---|
| E16 | Prépa BOM + commande | `=0,1/I14` | 0,005 |
| E17 | Prépa TOP PnP | `=0,1/I14` | 0,005 |
| E18 | Prépa BOT PnP | `=0/I14` | 0 |
| E19 | Assemblage CMS TOP | (saisi) | 3 |
| E20 | Assemblage CMS BOT | (saisi) | 0 |
| E21 | Assemblage traversant | (saisi) | 0 |
| E22 | Test | (saisi) | 1 |
| E23 | Taux de défaillance | `=1/10` | 0,1 |
| E24 | Temps réparation moyen | (saisi, test inclus) | 3 |
| E25 | Temps réparation défaillances | `=E23*E24` | 0,30 |
| E26/E27 | **Temps total / carte** | `=E16+E17+E18+E19+E20+E21+E22+E25` | **4,31** |

**Coût main-d'œuvre et total :**

| Cellule | Libellé | Formule | Valeur |
|---|---|---|---|
| E31 | Salaire horaire | (saisi) | 40 €/h |
| E32 | MO / carte | `=E27*E31` | 172,40 |
| E34 | **Prix total HT** | `=E11+E32` | **401,80** |
| E35 | **Prix total TTC** | `=E12+E32` | **447,68** |

### 2.4 Lecture du modèle

Coût de revient d'une carte ≈ **402 € HT**, dont 57 % matière (229 €) et 43 % MO
(172 €). La part MO élevée est cohérente avec une **petite série** (15–20 cartes,
4,31 h/carte en assemblage majoritairement manuel).

**Points forts à conserver :**

- Modélisation du **taux de défaillance + temps de rework** (E23–E25) — plus fin
  que le baseline industrie.
- **Amortissement des temps de prépa** (NRE) sur la série (E16–E17 `/I14`).
- Séparation claire **matière / main d'œuvre / TVA**.
- Distinction **TOP / BOT** — cohérente avec le modèle de faces de l'app.

---

## 3. Écarts et faiblesses du modèle ECB

| # | Constat | Impact | Sévérité |
|---|---|---|---|
| 1 | **Coût de revient, pas prix de vente** : aucune marge commerciale. | Le « prix » affiché n'est pas vendable tel quel. | 🟠 Majeur |
| 2 | **Pas de coût machine distinct** : amortissement PnP / four / AOI noyé dans le taux MO de 40 €/h (non documenté comme chargé ou non). | Sous- ou sur-évaluation selon volume ; pilotage impossible. | 🟠 Majeur |
| 3 | **Pas d'overhead / frais généraux** séparé (loyer, énergie, encadrement). | Coût complet sous-estimé. | 🟠 Majeur |
| 4 | **Deux compteurs de quantité incohérents** : `Calcule!B1=15` (commandées) vs `Cout!I14=20` (produites). PCB amorti sur 20, matière par carte sur base 15. | Résultat ambigu selon la base. | 🟡 Moyen |
| 5 | **Stencil non amorti** : E9 = 74,87 € ajouté **plein par carte**, alors que le PCB (E8) est amorti `/I14`. | +74 €/carte injustifié si série > 1 ; probable oubli de `/I14`. | 🔴 Critique |
| 6 | **Prix composants incomplets/hétérogènes** : colonne E souvent vide ou stockée en **texte** (`'6.275'`). `SUMPRODUCT` ignore les textes → composants chers comptés à 0 **silencieusement**. | Matière sous-évaluée sans alerte. | 🔴 Critique |
| 7 | **Pas de paliers de quantité** : un seul prix unitaire figé par composant. | Le prix réel dépend du volume commandé. | 🟡 Moyen |
| 8 | **TTC incohérent** : TVA appliquée seulement sur matière (E12), MO ajoutée hors taxe dans E35 (`=E12+E32`). | E35 mélange HT et TTC. | 🟡 Moyen |
| 9 | **Temps d'assemblage forfaitaire** (3 h CMS TOP saisi), non dérivé du nombre de placements/composants. | Pas reproductible d'une carte à l'autre. | 🟡 Moyen |
| 10 | **Aucun lien aux données de l'app** : tout est ressaisi à la main dans Excel. | Pas de traçabilité, double saisie, erreurs. | 🟠 Majeur (raison d'être du projet) |

---

## 4. Mapping sur les données existantes de l'app

L'app couvre déjà une partie de la chaîne. Correspondances :

| Poste ECB | Source dans l'app | État |
|---|---|---|
| Composants / carte (E5) | `BOM_ITEMS` (qté) × `SUPPLIER_OFFERS.unit_price` / `price_breaks` | ✅ Présent — **supérieur** à l'Excel (paliers de qté, multi-fournisseur, cache) |
| Quantité cartes | `PRODUCTION_BOM_REVISIONS.quantity_to_produce` | ✅ Présent |
| Faces TOP / BOT | `BOM_REVISIONS` (révision/face) | ✅ Présent |
| Lien composant ↔ fournisseur | `Component` ↔ `SupplierOffer` (Mouser/DigiKey) | ✅ Présent (`supplier_offer_service.price_at_quantity()`) |
| Machine / placements | `PNP_MACHINES`, `PLAN_ASSIGNMENTS` (slots) | ⚠️ Partiel — placements connus, **pas de temps/cadence** |
| PCB nu (E7/E8) | — | ❌ Absent |
| Pâte, stencil (E6, E9) | — | ❌ Absent |
| Temps assemblage/test (E19–E22) | — | ❌ Absent |
| Taux défaillance / rework (E23–E25) | — | ❌ Absent |
| Taux horaire, taux machine, overhead, marge, TVA | — | ❌ Absent |
| Résultat de chiffrage (snapshot) | — | ❌ Absent |

**Bonne nouvelle :** la brique la plus lourde (matière, 57 % du coût) est déjà
mieux outillée dans l'app que dans l'Excel. Le travail porte surtout sur les
**paramètres de coût** et les **postes non-matière**.

---

## 5. Proposition d'architecture (à valider)

> Décisions à arbitrer ensemble ; rien n'est figé. Conforme à `STRUCTURE.md`.

### 5.1 Modèle de données

> Aligné sur les décisions de cadrage du §6 : **taux horaire unique chargé**,
> **coût de revient seul** (pas de marge), **prix agrégé TOP+BOT**.

**a) Table `COST_PARAMETERS`** (paramètres d'atelier, modifiables, versionnés) —
valeurs par défaut configurables, surchargables par production :

- `labor_rate` (€/h, ex. 40 — **taux unique chargé** : inclut personne + machine +
  frais généraux, comme l'Excel), `vat_pct` (0,20),
  `solder_paste_per_board` (€, ex. 2), `defect_rate` (ex. 0,1),
  `repair_time` (h, ex. 3), `test_time` (h, ex. 1),
  `prep_time_bom`, `prep_time_top`, `prep_time_bot` (h, NRE amortis).
- *Non retenus pour l'instant* (réévaluables, le schéma reste extensible) :
  `machine_rate`, `overhead_rate` séparés, `margin_pct`.

**b) Champs sur `Production` (ou table `PRODUCTION_COST_INPUTS`)** spécifiques à un
chiffrage :

- `pcb_total_price` ou `pcb_unit_price`, `stencil_cost`,
  `quantity_produced` (distinct de `quantity_to_produce` → résout l'écart #4),
  `assembly_time_top`, `assembly_time_bot`, `tht_time` (estimés auto, **surchargables
  à la main** — cf. décision §6).

**c) Table `PRODUCTION_COSTING`** (snapshot horodaté du résultat — sert aussi
d'**historique de prix par carte** : chaque production validée y ajoute une ligne,
la plus récente = prix de référence de la carte) :

- `bom_reference_id` (la carte chiffrée), `production_id`, `quantity`,
  `unit_cost_ht`, `unit_cost_ttc`, `total_ht`, `total_ttc`,
  `material_cost`, `labor_cost`, `nre_cost`,
  `computed_at`, `is_reference` (dernière prod.), `params_snapshot` (JSON des taux).
- *Réservés pour extension* : `machine_cost`, `overhead_cost`, `margin_amount`,
  `sell_price` (non calculés tant qu'on reste au taux unique / coût de revient).
- Endpoint dédié : `GET /api/costing/cards/{bom_reference_id}/history` (référence +
  historique), pour alimenter le sélecteur de carte et le sous-onglet unitaire.

### 5.2 Backend

- Service `costing_service.py` (`serveur/src/services/`) : fonction pure
  `compute_costing(production, params) -> CostingResult`, réutilisant
  `supplier_offer_service.price_at_quantity()` pour la matière.
- Routes `/api/costing/*` (`serveur/src/routes/`) :
  `GET /costing/{production_id}` (calcul live), `POST /costing/{production_id}/snapshot`,
  `GET/PUT /costing/parameters`.
- Schémas Pydantic dans `serveur/src/schemas/`.
- Migration Alembic pour les nouvelles tables.

### 5.3 Frontend

- Onglet/page `CostingPage.jsx` (`pages/`) avec **un sélecteur de carte** (carte de
  la production en cours, ou n'importe quelle carte pour consulter son prix) et
  **deux sous-onglets** :
  - **Coût de la production** : coût total du lot (HT/TTC), nb cartes, coût unitaire,
    décomposition matière vs MO (barres de part %).
  - **Coût unitaire / carte** : prix de référence (dernière prod.), estimation en
    cours, écart vs référence, détail matière/MO par carte, et **historique des prix**.
- Composants `components/costing/` (sélecteur, panneaux paramètres/données, cartes
  KPI, décomposition, table historique). Palette émeraude/zinc (refonte en cours).
- Maquette interactive validée avec le demandeur avant implémentation.

### 5.4 Corrections à intégrer dès la conception (vs Excel)

- Amortir le stencil `/quantité` (écart #5).
- Unifier la base de quantité (écart #4) : un compteur clair de cartes produites.
- Tirer les prix composants des `SUPPLIER_OFFERS` typés (Float), pas de texte
  libre → supprime l'écart #6.
- TTC cohérent : TVA sur le total HT, pas seulement la matière (écart #8).

---

## 6. Décisions de cadrage (2026-06-09) — RÉSOLU

Arbitrées avec le demandeur. Servent de base à l'implémentation.

| # | Question | Décision |
|---|---|---|
| 1 | Coût de revient ou prix de vente ? | **Coût de revient seul** — pas de marge commerciale (comme l'Excel). Champ marge réservé pour extension future. |
| 2 | Décomposition du coût horaire ? | **Taux unique chargé** (≈ 40 €/h) incluant personne + machine + frais généraux. Pas de taux machine ni overhead séparés pour l'instant. |
| 3 | Temps d'assemblage ? | **Hybride** : estimation auto (placements × cadence) **surchargable manuellement** par l'opérateur. |
| 4 | Quantité & faces ? | **Prix unique agrégé TOP + BOT** (un seul prix par carte). Quantité : un compteur de cartes produites (résout l'incohérence 15/20). |
| 5 | Conversion de devise (USD→EUR) ? | **Non retenue** pour la v1 — à traiter plus tard si des offres en USD posent problème. |

**Conséquence sur le périmètre :** le chiffrage v1 = `matière (composants + pâte +
PCB amorti + stencil amorti) + main d'œuvre (taux unique × temps, défaut/rework
inclus) + NRE amortis`, en HT et TTC. Marge, coût machine isolé et overhead séparé
sont hors v1 mais le schéma de données les anticipe.

---

## 7. Prochaines étapes proposées

1. Valider le périmètre et les questions §6 (atelier de cadrage).
2. ADR `engineering:architecture` sur le modèle de données costing.
3. Implémenter backend (service + routes + migration) avec tests.
4. Implémenter l'onglet frontend.
5. Rejouer le cas KT220132C dans l'app et **réconcilier avec l'Excel** (les 402 €
   HT doivent être reproductibles, écarts corrigés documentés).

---

## Annexe — Sources industrie

- JLCPCB — PCBA cost breakdown : https://jlcpcb.com/blog/pcba-cost-breakdown
- Calpak USA — PCB Assembly Quote Guide : https://www.calpak-usa.com/Resources/Guides/PCB-Assembly-Quote-Guide
- JHYPCB — SMT PCB assembly cost breakdown : https://www.pcbelec.com/blog/pcba-insights/smt-pcb-assembly-cost-breakdown-what-factors-affect-your-project-pricing.html
- EMSNow — Contract manufacturing price model (cost-plus) : https://www.emsnow.com/contract-manufacturing-price-model-cost-plus/
- VentureOutsource — EMS margins vs OEM pricing : https://ventureoutsource.com/contract-manufacturing/profit-margins-pcb-electronic-assembly-quotes-ems-manufacturing-costs-oem-pricing/
- MIE Solutions — Manufacturing hourly rate calculation : https://mie-solutions.com/how-to-manufacturing-hourly-rate-calculation/
