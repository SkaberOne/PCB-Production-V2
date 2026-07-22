# Canal d'échange — orchestrateur ↔ planif

Communication **asynchrone** entre le chat de **planification** (Claude atelier) et le chat
**orchestrateur** (exécution). À utiliser quand l'un est **bloqué** ou a besoin d'une **décision**
de l'autre — pour ne **jamais deviner ni échouer en silence**.

Différent de la file des prompts (`1-a-faire/`…) : ici ce sont des **questions / décisions
ponctuelles**, pas des features à coder.

## Arborescence

| Dossier / fichier | Rôle |
|---|---|
| `ouverts/` | Échanges en attente de réponse. |
| `resolus/` | Échanges traités (archive). |
| `_TEMPLATE-echange.md` | Squelette d'un échange. |

## Nommage

`E<NN>-<de>-p<prompt>-<slug>.md` — ex. `E01-orch-p003-empreinte-pnp.md`
(`de` = `orch` ou `planif` · `p<prompt>` = prompt concerné, ou `x` si général)

## Cycle de vie

1. **Émetteur bloqué** → crée un échange dans `ouverts/` (contexte + options + reco), statut **OUVERT**.
   Met le prompt concerné **en pause** (laissé en `2-en-cours/` avec la note « EN ATTENTE échange E<NN> »)
   et continue le reste.
2. **Destinataire** → lit `ouverts/`, écrit sa **réponse/décision** dans le fichier, statut **RÉPONDU**.
3. **Émetteur** (run suivant) → applique la décision, reprend le prompt en pause, déplace l'échange
   dans `resolus/`.

## Qui lit quoi, quand

- **Orchestrateur** : au **début de chaque run**, lit `ouverts/` → applique les échanges **RÉPONDU**
  qui le concernent (puis les archive) et reprend les prompts en pause. Écrit un nouvel échange dès
  qu'il rencontre un blocage « décision » (cf `ORCHESTRATEUR.md` §3.8).
- **Planif (Claude atelier)** : lit `ouverts/` quand Eric le signale, tranche, écrit la réponse.

> Règle d'or : un blocage = un échange, jamais une supposition. Une **erreur technique** (test/CI qui
> casse) reste gérée par la boucle de correction du prompt ; le canal d'échange sert aux **décisions**.
