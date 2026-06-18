# 🧪 Journal de tests release — terrain (PC atelier)

> Suivi des erreurs rencontrées en testant les **releases déployées** sur le poste
> de travail (atelier). Sert de canal de retour vers le **PC perso** pour
> l'amélioration continue.
>
> Dernière mise à jour : **2026-06-18** · Tags : #test-terrain #bug

---

## 🎯 But de ce document

Ce poste sert à **tester les releases** de PCB Flow Production Suite en conditions
réelles. Chaque problème rencontré est consigné ici, puis poussé sur GitHub. Sur
le **PC perso**, le développement reprend à partir de ce journal pour corriger et
améliorer en continu.

Une erreur = une entrée. On remplit d'abord la **table de triage** (vue rapide),
puis l'**entrée détaillée** correspondante.

---

## 🔁 Workflow travail ↔ perso

**Sur le PC atelier (ici)**
1. Tester la release, reproduire le problème.
2. Ajouter une ligne dans la *Table de triage* + une *Entrée détaillée* (copier le modèle).
3. Committer + pousser :
   ```powershell
   git add docs/JOURNAL_TESTS_RELEASE.md
   git commit -m "test(terrain): <résumé court de l'erreur>"
   git push
   ```
   (ou double-clic sur `auto_push.bat` à la racine)

**Sur le PC perso (développement)**
1. `git pull` pour récupérer le journal à jour.
2. Traiter les entrées par priorité (P1 → P3).
3. Corriger, puis mettre le **Statut** à `✅ Corrigé` avec la version qui corrige + le hash de commit.
4. Re-déployer ; sur le poste atelier, vérifier et passer le statut à `✔️ Vérifié terrain`.

> 💡 Travailler chacun sur sa machine sans conflit : ne modifier ce fichier que
> sur **un** poste à la fois autour d'un même créneau, et toujours `git pull`
> avant d'éditer.

---

## 🧭 Légendes

**Gravité**

| Code | Sens |
|---|---|
| 🔴 P1 | Bloquant — empêche d'utiliser une étape du workflow / perte de données |
| 🟠 P2 | Majeur — contournable mais gênant, résultat faux ou dégradé |
| 🟡 P3 | Mineur — cosmétique, confort, libellé, détail UI |

**Statut**

| Code | Sens |
|---|---|
| 🆕 Nouveau | Constaté sur le terrain, pas encore traité |
| 🔎 En analyse | Reproduit / en cours de diagnostic |
| 🛠️ En cours | Correction en développement (PC perso) |
| ✅ Corrigé | Corrigé en code, en attente de re-déploiement |
| ✔️ Vérifié terrain | Re-testé OK sur le poste atelier |
| ❌ Rejeté / non reproductible | Pas un bug, ou non reproductible |

**Module** (cf. `STRUCTURE.md`) : `Productions` · `Import BOM` · `Revue BOM` ·
`Commande` · `Machine PnP` · `Bibliothèque` · `Prix carte` · `Paramètres` ·
`Backend/API` · `MAJ auto` · `Installation` · `Autre`

---

## 📋 Table de triage

> Vue d'ensemble. Une ligne par erreur. `ID` = `T-NNN` (incrément simple).
> Renvoie vers l'entrée détaillée plus bas.

| ID | Date | Version | Module | Gravité | Résumé | Statut | Issue GH |
|---|---|---|---|---|---|---|---|
| _(exemple)_ T-000 | 2026-06-18 | 1.0.x | Import BOM | 🟠 P2 | Description courte en une ligne | 🆕 Nouveau | — |

---

## 📝 Entrées détaillées

> Copier le modèle ci-dessous pour chaque nouvelle erreur. Garder l'ordre
> décroissant (la plus récente en haut).

### Modèle à copier

```markdown
### T-NNN — <titre court> · 🔴/🟠/🟡 P? · <Module>

- **Date** : AAAA-MM-JJ
- **Version testée** : x.y.z  (Aide → À propos)
- **Poste / OS** : atelier — Windows 10/11
- **Statut** : 🆕 Nouveau
- **Issue GitHub** : —

**Contexte / mode (mono-poste SQLite ou multi-postes SQL Server) :**
...

**Étapes pour reproduire :**
1. ...
2. ...

**Résultat attendu :**
...

**Résultat obtenu :**
...

**Message d'erreur exact / logs :**
```
(coller ici le texte de l'erreur, ou le contenu de %APPDATA%\PCB Flow Production Suite\server\logs)
```

**Capture / fichier joint :** (chemin ou nom du fichier)

**Notes pour le dev (hypothèse, fréquence, contournement) :**
...

**Résolution :** (rempli côté PC perso — commit, version corrective)
...
```

---

<!-- Ajouter les vraies entrées au-dessus de cette ligne, la plus récente en haut -->

*Aucune erreur consignée pour l'instant — espace prêt.*

---

## 📎 Aide-mémoire

- **Version de l'app** : menu **Aide → À propos**.
- **Logs backend** : `%APPDATA%\PCB Flow Production Suite\server\logs`.
- **Config** : `%APPDATA%\PCB Flow Production Suite\server\.env`.
- **Releases** : https://github.com/SkaberOne/PCB-Production-V2/releases/latest
- **Symptômes courants** : voir `docs/guides/TROUBLESHOOTING.md`.
