# Deployment

## Ce qui est supporte aujourd hui

- build frontend web
- build Electron desktop
- generation d un exectuable portable Windows

## Commandes

Frontend:

```powershell
npm --prefix src/frontend run build
```

Desktop portable:

```powershell
npm --prefix src/desktop run build:portable
```

Desktop complet:

```powershell
npm --prefix src/desktop run dist
```

## Limites actuelles

- pas de pipeline CI/CD documente
- pas de signature Windows
- pas de procedure de release formalisee
- pas de deploiement serveur backend industrialise
- les tests automatises valident surtout SQLite local, pas SQL Server cible

## Recommandation

Pour l instant, considerer le packaging desktop comme un build interne de validation, pas comme une chaine de diffusion finalisee.
