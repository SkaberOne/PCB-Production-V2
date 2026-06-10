# ADR 0001 — Structure monorepo serveur + client + docs

**Date** : 2026-05-29
**Statut** : ✅ Accepté
**Décideurs** : Eric · Claude (audit)

---

## Contexte

Le projet PCB Flow Production Suite est composé de :
- Un backend Python (FastAPI + SQLAlchemy)
- Un frontend React (SPA MUI v5)
- Un shell desktop Electron
- De la documentation (specs, audits, guides)

Plusieurs options s'offraient pour structurer ce projet sur le système de fichiers :
1. **Monorepo unique** avec sous-dossiers clairement séparés
2. **Multi-repos** : un repo par couche (backend, frontend, electron)
3. **Workspace npm/pnpm** + repo Python séparé

---

## Décision

**Monorepo unique** avec la structure suivante :

```
PCB-Production-V2/
├── serveur/         ← backend Python (FastAPI, SQLAlchemy)
├── client/
│   └── src/
│       ├── frontend/  ← React SPA
│       └── desktop/   ← shell Electron
├── docs/            ← documentation + vault Obsidian indexé
└── (CLAUDE.md, README.md, STRUCTURE.md, .gitignore)
```

Cette structure est figée dans `STRUCTURE.md` comme "loi" du projet.

---

## Conséquences

### Positives
- ✅ **Cohérence atomique** : un commit peut toucher backend + frontend simultanément
- ✅ **Versioning unifié** : tout est dans la même branche git
- ✅ **Refactor cross-stack** : facile de renommer un endpoint et son appelant
- ✅ **Documentation à côté du code** : `docs/` voyage avec le projet
- ✅ **Onboarding simple** : `git clone` suffit pour avoir tout

### Négatives
- ⚠️ **CI plus complexe** : il faut détecter les changements par couche pour éviter de re-builder tout à chaque PR
- ⚠️ **Dépendances mélangées** : `package-lock.json` côté client, `requirements.txt` côté serveur
- ⚠️ **Releases séparées impossibles** : impossible de tagger uniquement le backend

### Mitigations
- CI : utiliser `paths:` dans GitHub Actions pour ne build que ce qui change
- Versionning : un seul tag projet, releases internes pas distinctes backend/frontend (acceptable pour outil interne)

---

## Alternatives considérées

### Multi-repos
**Rejeté** car l'application est mono-utilisateur (ECB interne), pas réutilisable comme librairie indépendante. La complexité du multi-repo (synchronisation versions, releases coordonnées) dépasse le bénéfice.

### Workspace npm
**Rejeté** car le backend Python ne s'intègre pas naturellement dans un workspace npm. On garderait `serveur/` à part, ce qui annulerait l'intérêt du workspace.

---

## Notes de migration

Cette structure a été établie lors du restructuring de la session 1 (29 mai 2026).
Les contraintes :
- Code Python : exclusivement dans `serveur/src/`
- Code React : exclusivement dans `client/src/frontend/src/`
- Code Electron : exclusivement dans `client/src/desktop/src/`
- **Interdit à la racine** : `.bat`, `.vbs`, `.ps1`, `.exe`, code source

Référence : `STRUCTURE.md` à la racine.
