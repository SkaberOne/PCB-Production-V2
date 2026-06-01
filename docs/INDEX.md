# 🏠 ECB Production Manager — Vault de suivi

> Dernière mise à jour : **2026-05-29** · Version courante : **v1.0.0**

---

## 📌 Documents principaux

| Document | Rôle |
|---|---|
| [[Projet]] | 🎯 Description technique complète (vision, archi, data model, endpoints, glossaire) |
| [[Plan_Deploiement]] | 🔧 Structure projet, environnement dev, workflow session, git |
| [[CHANGELOG]] | 📜 Historique des sessions et commits |
| [[Roadmap]] | 🗺️ Vision stratégique, backlog priorisé, risques |

---

## 📁 Sections du vault

### `audits/` — Audits horodatés
Format : `Audit_YYYY-MM-DD_titre.md`
- [[audits/Audit_2026-05-29_final|29 mai 2026 — Audit final (session 1)]]
- [[audits/Audit_2026-05-14_complet|14 mai 2026 — Audit complet précédent]]
- [[audits/Audit_2026-05-15_design|15 mai 2026 — Audit design UI]]
- [[audits/Audit_2026-03-26_application|26 mars 2026 — Audit application]]
- [[audits/Audit_2026-03-27_database|27 mars 2026 — Audit database]]

### `adr/` — Architecture Decision Records
Format : `NNNN-titre-court.md`
- [[adr/0001-monorepo-structure|0001 — Monorepo serveur + client + docs]]
- [[adr/0002-sqlite-tests-limitations|0002 — Limitations SQLite pour tests d'isolation]]

### `guides/` — Guides utilisateur
- [[guides/GETTING_STARTED|Getting Started]]
- [[guides/DEPLOYMENT|Déploiement]]
- [[guides/TROUBLESHOOTING|Troubleshooting]]

### `specs/` — Specifications techniques
- [[specs/API_MARKETPLACE|API Marketplace]]
- [[specs/ARCHITECTURE_PAGES_UI_EXE|Architecture pages UI EXE]]
- [[specs/BOM_FORMAT_AMPLI|Format BOM AMPLI]]
- [[specs/HARMONY_RULES|Règles HARMONY_RULES]]
- [[specs/CAHIER_DES_CHARGES_PHASE_UI_EXE|Cahier des charges Phase UI EXE]]
- [[specs/PLAN_DEVELOPPEMENT_PHASES_UI_EXE|Plan développement phases UI EXE]]

### `archive/` — Documents historiques
Anciens documents conservés pour référence. Ne plus modifier.

---

## 🚀 Démarrage rapide

```powershell
# 1. Lancer le serveur
.\serveur\DEMARRER_SERVEUR.bat

# 2. Lancer le client
.\client\DEMARRER_CLIENT.bat

# 3. URLs
# API       : http://localhost:8000
# Swagger   : http://localhost:8000/docs
# Frontend  : http://localhost:3000
```

Plus de détails : [[Plan_Deploiement#2 Environnement de développement]].

---

## 🤖 Pour Claude

Process de travail détaillé : voir `CLAUDE.md` à la racine du projet.
Règles structure (loi) : voir `STRUCTURE.md` à la racine.

---

## 🏷️ Tags utiles

- #urgent — éléments P1 critique
- #refactor — dette technique
- #ui-ux — éléments interface
- #data-loss — incident perte données
- #sqlite-bug — limitation isolation tests
