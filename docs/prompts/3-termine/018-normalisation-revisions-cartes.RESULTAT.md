# 018 - RESULTAT

Normalisation d'AFFICHAGE des revisions de cartes (REV_A / A / F / vide -> 'Rev. A' / 'Sans revision').

- Util client/src/frontend/src/utils/revision.js : normalizeRevisionCode + formatRevisionLabel (affichage seul, valeur stockee inchangee -> idempotence import 011 preservee).
- Tests utils/__tests__/revision.test.js (dont cas limites R2/REVA non tronques).
- BoardStockPage.jsx : chips revision (table + dialog) via les helpers.
- npm test : 48 suites / 176 tests verts ; build staging OK.

Note : finalise par le chat planif (l'orchestrateur s'etait arrete apres le build, WIP non commite ; verifie + teste vert + commite).
