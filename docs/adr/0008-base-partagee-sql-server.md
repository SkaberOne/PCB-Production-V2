# ADR 0008 — Base de données partagée SQL Server central

**Date** : 2026-06-10
**Statut** : ✅ Accepté
**Décideurs** : Eric (SQL Server central confirmé) · Claude (architecture)
**Référence** : `docs/guides/Deploiement_Audit_et_Plan_Action_2026-06.md` (§2, §4 Phase B/E, §6, §9.3)

---

## Contexte

Cible confirmée (Eric, 2026-06-10) : **multi-postes**, chaque poste autonome côté
UI/API (ADR 0006), mais **une seule base de données partagée** afin que les BOM,
composants, productions et configurations machine soient communs à tous les postes.

État actuel à corriger (écarts du plan) :
- D7 (**bloquant**) : `database.py` peut retomber silencieusement en SQLite si
  SQL Server est injoignable ; le mot de passe n'est **pas URL-encodé**
  (`config.py` construit l'URL par f-string).
- D14 (majeur) : Alembic existe mais aucun `upgrade head` au démarrage → schéma
  désynchronisé après une mise à jour applicative.

---

## Décision

### 1. SQL Server central, backend local par poste

Une instance **SQL Server** héberge la base unique `ECB_Production`. Chaque
`ecb-server.exe` s'y connecte en **ODBC Driver 17** (`mssql+pyodbc`). Aucun serveur
applicatif central : seule la **donnée** est centralisée.

### 2. Fail-fast en production (lève D7)

Quand la cible est SQL Server (prod), une connexion KO au démarrage lève une **erreur
explicite et bloque le boot** — **pas de bascule SQLite silencieuse**. SQLite reste
réservé au **dev/test local** uniquement. Le **mot de passe est URL-encodé**
(`urllib.parse.quote_plus`) pour supporter les caractères spéciaux (cause de bugs
de connexion silencieux).

### 3. Migrations jouées au boot, additives et rétro-compatibles (lève D14)

- Le backend joue **`alembic upgrade head` au démarrage** (idempotent) → le schéma
  se met à jour automatiquement après chaque update applicatif (Phase E).
- Sur base **partagée** avec déploiement progressif, **toute migration est additive
  et rétro-compatible** : on **ajoute** (colonnes nullables/avec défaut, tables) ;
  on ne **renomme/supprime jamais en une étape** — les suppressions se font en
  **2 releases** (déprécier puis retirer). Un poste à jour ne doit pas casser la
  base pour un poste resté en arrière (« Tiger » du pré-mortem §8).

### 4. Contrat API rétro-compatible

Postes à jour et postes en retard tapent la même base : les endpoints restent
rétro-compatibles (champs optionnels, pas de suppression brutale). Préfixe
**`/api`** conservé ; option `/api/v1` envisagée si un figeage de contrat devient
nécessaire.

### 5. Feature flags pour livrer du stable en continuant à développer

Les fonctionnalités incomplètes (plan d'implantation feeders, slot-strip, validation
d'ordre de fabrication…) sont livrées **désactivées par défaut**, activables par
**config runtime** (fichier éditable post-install, pas au build). Permet de publier
des versions stables sans exposer du demi-fini, tout en continuant Machine PnP.

### 6. Reprise des données existantes

La base de production actuelle (24 BOM, 380 composants, machine PNP-01, 73 feeders,
3 chariots — cf. CHANGELOG 2026-05-29, sur l'ancien PC) est **importée dans SQL Server**
puis les comptes sont **validés** avant bascule (Phase E).

---

## Conséquences

- ✅ Donnée commune à tous les postes, sans service applicatif central à maintenir.
- ✅ Fin des pertes/divergences de DB locale (cause de l'incident du 2026-05-29).
- ✅ Schéma auto-synchronisé après update (migrations au boot).
- ⚠️ **Prérequis** : instance SQL Server disponible + ODBC Driver 17 sur chaque poste
  (cf. ADR 0006). Sauvegardes SQL Server à organiser côté infra.
- ⚠️ Discipline de migration **non négociable** (additif/rétro-compatible) — coût
  permanent mais structurant.
- ⚠️ Latence réseau vers SQL Server à surveiller selon la topologie atelier.

---

## Alternatives écartées

- **Garder SQLite par poste** : pas de partage de données ; rejeté (contredit la
  cible multi-postes).
- **SQLite partagé sur un lecteur réseau** : verrouillage concurrent fragile,
  corruption probable ; rejeté.
- **Bascule SQLite automatique si SQL Server KO** (comportement actuel) : masque les
  pannes et fait diverger les postes ; remplacé par le fail-fast.
- **PostgreSQL** : valable techniquement, mais SQL Server est la cible déjà retenue
  côté infra ECB et déjà câblée (`config.py`, ODBC 17).

---

## Références
- Plan : `docs/guides/Deploiement_Audit_et_Plan_Action_2026-06.md` (§2, Phase B/E, §6)
- Fichiers : `serveur/src/database.py`, `serveur/src/config.py`,
  `serveur/src/alembic/`, `serveur/.env.example`
- ADR liés : `0002-sqlite-tests-limitations.md`, `0006-packaging-lancement-desktop.md`,
  `0007-systeme-mise-a-jour.md`
