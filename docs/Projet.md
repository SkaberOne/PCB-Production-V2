# PCB Flow Production Suite — Description Technique

> Mis à jour : 2026-05-29 · Version courante : v1.0.0
> Vision & priorisation détaillées : voir [[Roadmap]].

---

## Vision

Application **Windows desktop** pour la gestion complète du flux de production
de cartes électroniques (PCB) en atelier ECB, depuis l'import des **BOM**
(Bill of Materials) jusqu'à la configuration des machines **Pick & Place** (PnP).

L'app remplace une chaîne Excel + scripts ad-hoc par un workflow guidé :
- Import de BOM (formats Eagle, Excel, CSV) avec révisions et historique
- Harmonisation des références composants entre formats fournisseurs hétérogènes
- Bibliothèque centralisée des composants et BOM enregistrées
- Calcul automatique des besoins composants par production
- Préparation des commandes composants avec export ERP
- Configuration des machines PnP (feeders fixes/variables, chariots)
- Suivi statut des productions

**Objectif concret** : passer d'une production gérée à la main à un système
**tracé, reproductible, et exportable** vers l'ERP atelier.

---

## Positionnement

Outil métier **interne ECB** — pas un produit commercial. Conçu pour le poste
de préparation production : opérateur(s) qui prennent en charge une BOM client,
préparent la commande composants, et configurent la ligne PnP.

Ne remplace pas :
- ERP entreprise (interfaçage par export Excel uniquement)
- Logiciel PnP propriétaire (machine elle-même)
- Outil de CAO PCB (Eagle, Altium, KiCad — input du workflow)

---

## Stack technique

| Couche | Technologie | Version |
|---|---|---|
| Backend API | FastAPI + Uvicorn | Python 3.8+ (testé 3.14.5) |
| ORM / DB | SQLAlchemy 2.0 + Alembic | - |
| Base locale (dev) | SQLite | `serveur/database/dev.db` |
| Base cible (prod) | SQL Server via ODBC Driver 17 | - |
| Frontend | React 18 + MUI v5 | Node 18+ (testé 24.16) |
| State global | Zustand + axios | - |
| Desktop shell | Electron | v34 |
| Build desktop | electron-builder | - |
| Tests backend | pytest + pytest-cov | - |
| Tests frontend | jest + @testing-library/react | - |

---

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │      Client Electron (Windows)      │
                    │  ┌──────────────────────────────┐   │
                    │  │   React 18 SPA (MUI v5)      │   │
                    │  │   Zustand state              │   │
                    │  │   axios → API REST           │   │
                    │  └──────────────┬───────────────┘   │
                    └─────────────────┼───────────────────┘
                                      │ HTTP/JSON
                                      │ (X-API-Key optionnel)
                                      ▼
                    ┌─────────────────────────────────────┐
                    │   FastAPI Backend (port 8000)       │
                    │  ┌────────┐ ┌──────────┐ ┌───────┐  │
                    │  │ routes │→│ services │→│models │  │
                    │  └────────┘ └──────────┘ └───┬───┘  │
                    │                              │      │
                    └──────────────────────────────┼──────┘
                                                   │
                                                   ▼
                              ┌─────────────────────────────┐
                              │  SQLite (dev) / SQL Server  │
                              │  19 tables relationnelles   │
                              └─────────────────────────────┘
```

---

## Modèle de données (résumé)

19 tables réparties en 4 domaines :

### Domaine BOM
- `BOM_REFERENCES` — référence d'une BOM (ex: AMPLI_GEN6)
- `BOM_REVISIONS` — révision/face d'une référence (REV_A TOP, REV_A BOT)
- `BOM_ITEMS` — lignes individuelles d'une révision
- `BOM_CATEGORIES` — catégorisation libre
- `COMPONENTS` — bibliothèque composants harmonisés
- `COMPONENT_TYPE_RULES` — règles auto-typage (préfixe → type)
- `FOOTPRINT_MAPPING` — mapping Eagle footprint → PnP footprint
- `MACHINE_FOOTPRINT_CATALOG` — catalogue empreintes machine
- `MACHINE_FOOTPRINT_RULES` — règles d'usage

### Domaine Production
- `PRODUCTIONS` — session de production active
- `PRODUCTION_BOM_REVISIONS` — révisions rattachées à une production
- `PRODUCTION_PLANS` — plans d'assignation machine
- `PLAN_ASSIGNMENTS` — assignations slot/composant

### Domaine Commande
- `COMMANDS` — commande composants
- `COMMAND_ITEMS` — lignes commande

### Domaine Machine PnP
- `PNP_MACHINES` — machines (ex: PNP-01 80 positions)
- `PNP_FEEDERS` — types de feeders
- `PNP_CARTS` — chariots logiques
- `PNP_MACHINE_FEEDERS` — feeders fixes assignés

---

## Endpoints API (résumé)

`http://localhost:8000` · Documentation Swagger : `/docs`

### Public
- `GET /api/health` — status + version

### BOM (`/api/bom/*`)
- `GET /files` — bibliothèque BOM enregistrées
- `GET /categories` · `POST /categories` · `PATCH /references/{id}/category`
- `DELETE /files/{rev_id}` — supprimer une révision
- `GET /components?limit=N` — bibliothèque composants
- `GET /component-type-rules` · `POST /component-type-rules/import`
- `GET /machine-footprints` · `POST /machine-footprints/import`
- `GET /mappings/footprints`

### Marketplace (`/api/marketplace/*`)
- `GET /productions` · `POST /productions` · `PATCH /productions/{id}` · `DELETE /productions/{id}`
- `POST /productions/{id}/duplicate`
- `GET /commands` · `POST /commands` (génération)
- `GET /machines` · `POST /machines` · `PUT /machines/{id}`
- `GET /carts` · `POST /carts`
- `GET /feeder-types` · `POST /feeder-types`
- `POST /machines/{m}/feeder-types/{f}` — assignation

### Reports (`/api/reports/*`)
- `GET /overview` — KPI dashboard
- `GET /bom-stats?production_id=N` — stats BOM contextuelles
- `GET /commands/{command_id}` — rapport détaillé commande
- `GET /machines` — utilisation machines
- `GET /components/top?limit=N` — composants les plus utilisés

---

## Pages frontend

| Page | Route | Rôle |
|---|---|---|
| Productions | `/#/dashboard` | Vue d'ensemble, création/sélection production |
| Import BOM | `/#/import-bom` | Upload fichiers BOM, résolution missing components/footprints |
| Revue BOM | `/#/bom` | Revue ligne par ligne, validation stock, export CSV |
| Commande | `/#/commande-composant` | Génération liste commande, export ERP Excel |
| Machine PnP | `/#/machine-pnp` | Configuration machines, feeders, chariots |
| BOM enregistrées | `/#/fichier-bom` | Bibliothèque BOM (tree + détail révisions) |
| Paramètres | `/#/parametre` | Catalogue composants, MachineFootprint, règles |

---

## Glossaire métier

| Terme | Définition |
|---|---|
| **PCB** | Printed Circuit Board — carte électronique |
| **BOM** | Bill of Materials — liste des composants d'une carte |
| **Révision** | Version d'une BOM (REV_A, REV_B) |
| **Face** | TOP / BOT — côté de la carte (composants montés dessus) |
| **PnP** | Pick & Place — machine qui place les composants automatiquement |
| **Feeder** | Chargeur de composants sur PnP (rouleau, tube, plateau) |
| **Chariot** | Regroupement logique de feeders (fixes ou interchangeables) |
| **Footprint** | Empreinte d'un composant (taille, pads) — Eagle vs PnP |
| **Harmonisation** | Normalisation des références entre formats fournisseurs |
| **HARMONY_RULES** | Règles assignation feeders↔composants |
| **Production** | Session de fabrication d'un ensemble de cartes |
| **Empreinte machine** | Référence PnP d'un footprint dans le catalogue machine |
