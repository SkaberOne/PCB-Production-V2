# Système de prompts — PCB Flow Production Suite

Ce dossier est l'**atelier de production de features**. Il sépare la **planification**
(réflexion, architecture, design — faite dans un chat dédié) de l'**exécution**
(code, tests, déploiement staging — faite par un chat orchestrateur).

## Principe

```
        CHAT DE PLANIFICATION                 CHAT ORCHESTRATEUR (à la demande)
        (on discute, on valide)               (exécute, teste, déploie, compile)
                 │                                          │
                 ▼                                          ▼
   docs/prompts/1-a-faire/  ──────────────►  lit la file, code chaque feature,
        NNN-type-slug.md                     teste (pytest+npm), déploie staging,
                                             log erreurs, corrige, re-teste
                 │                                          │
                 ▼                                          ▼
   docs/prompts/2-en-cours/  (en cours)      docs/prompts/3-termine/
                                             NNN-type-slug.md + NNN-type-slug.RESULTAT.md
                                                            │
                                                            ▼
                                                     JOURNAL.md (mis à jour)
```

## Arborescence

| Dossier / fichier | Rôle |
|---|---|
| `1-a-faire/` | Prompts validés, prêts à être exécutés. **Produits par le chat de planification.** |
| `2-en-cours/` | Prompts en cours d'exécution par l'orchestrateur (évite qu'ils soient repris deux fois). |
| `3-termine/` | Prompts terminés + leur `*.RESULTAT.md` (ce qui a été fait, testé, déployé). |
| `JOURNAL.md` | Index global de toutes les features : statut, résultat, date. |
| `_TEMPLATE.md` | Squelette d'un prompt (structuré façon SPARC). À copier pour chaque nouvelle feature. |
| `ORCHESTRATEUR.md` | Le prompt que le chat d'exécution applique. À lancer à la demande. |

## Cycle de vie d'un prompt

1. **Planification** (chat dédié) : on discute une feature, on valide l'archi et le design
   (prototype HTML si besoin). Le chat dépose un fichier `NNN-type-slug.md` dans `1-a-faire/`,
   basé sur `_TEMPLATE.md`.
2. **Exécution** (à la demande — Option C) : tu ouvres un chat Cowork **« sur mon ordinateur »**
   et tu lui dis d'exécuter `docs/prompts/ORCHESTRATEUR.md`. Il ramasse tout ce qui est
   dans `1-a-faire/`, parallélise les features indépendantes, code, teste, déploie sur staging.
3. **Compilation** : chaque prompt fini part dans `3-termine/` avec son `RESULTAT.md`,
   et le `JOURNAL.md` est mis à jour.

## Convention de nommage

`NNN-type-slug.md` — ex. `001-feat-prix-carte-production.md`, `002-fix-manque-bistable.md`.
`NNN` = numéro séquentiel · `type` = `feat`/`fix`/`refactor`/`test`/`docs`/`chore`
(mêmes préfixes que les commits et branches, cf CLAUDE.md §10).

## Règles

- **Branche d'intégration = `dev`** : chaque feature part d'une branche courte `type/slug` depuis
  `dev`, puis PR vers `dev`. `dev` est **déployée sur l'instance staging (:8001)** pour test.
- **`main` = prod** : n'avance que par PR `dev → main` (CI verte, merge humain). L'orchestrateur
  ne touche **jamais `main` directement** (CLAUDE.md §10).
- L'orchestrateur tourne **sur ton PC** (mode « sur mon ordinateur ») : c'est le seul moyen
  d'atteindre le staging LAN (:8001) et de piloter git/Chrome.
- Un prompt doit être **autonome** : lisible et exécutable sans la conversation de planification.
