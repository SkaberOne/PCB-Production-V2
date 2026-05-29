# Troubleshooting

## Le backend ne demarre pas

- verifier que `.venv` existe
- verifier que `pip install -r src/backend/requirements.txt` a bien ete lance
- verifier `.env`, surtout `DATABASE_URL`
- tester:

```powershell
.venv\Scripts\python.exe launch.py --reload
```

## Le frontend ne demarre pas

- verifier `src/frontend/node_modules`
- relancer:

```powershell
npm install --prefix src/frontend
npm --prefix src/frontend start
```

## Electron ouvre un ecran vide

- verifier que le frontend repond sur `http://localhost:3000`
- sinon lancer:

```powershell
npm --prefix src/frontend start
npm --prefix src/desktop start
```

- pour un build packagé, verifier que `src/frontend/build` existe

## Le script d arret ne ferme pas tout

Le script d arret coupe les process lies au projet et utilise un fichier d etat quand la stack a ete ouverte via `start-dev-stack.ps1`.

Si besoin:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev\stop-dev-stack.ps1
```

Puis verifier manuellement les fenetres backend/frontend/desktop.

## Les tests frontend affichent des warnings React

Etat actuel connu:

- les tests passent
- certains tests affichent un warning `ReactDOMTestUtils.act`
- c est une dette de test, pas un echec fonctionnel

## Source de verite

Si un document contredit le code:

1. le code gagne
2. le `README.md` gagne sur la doc historique
3. `docs/reports/APPLICATION_AUDIT_2026-03-26.md` donne l etat a jour
