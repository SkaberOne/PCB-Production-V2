# Installeurs tiers embarqués

Déposez ici les binaires Microsoft à embarquer dans l'installeur NSIS (ADR 0009,
Phase 2-3). Ils sont copiés vers `resources/installers/` par electron-builder.

- **`msodbcsql17.msi`** — ODBC Driver 17 for SQL Server (x64). Si absent,
  `build/install_odbc.ps1` le **télécharge** depuis Microsoft au moment de
  l'installation. L'embarquer permet une install **hors-ligne**.
  Source : https://learn.microsoft.com/sql/connect/odbc/download-odbc-driver-for-sql-server

> Ces binaires ne sont **pas** versionnés dans Git (cf. `.gitignore`) : ce sont
> des redistribuables Microsoft, à récupérer au moment du build du Host.
