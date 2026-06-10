# -*- mode: python ; coding: utf-8 -*-
"""Spec PyInstaller du backend ECB Production Manager (cf. ADR 0006).

Build (depuis serveur/, venv activé) :
    pyinstaller ecb-server.spec --noconfirm

Produit  dist/ecb-server/ecb-server.exe  (mode onedir : démarrage rapide +
compatibilité pyodbc / ODBC). Le dossier dist/ecb-server est ensuite embarqué
dans l'app Electron via extraResources (Phase C).

Mode onedir choisi (pas onefile) : évite l'extraction temporaire à chaque
lancement et les soucis connus avec pyodbc.
"""

from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# --- Données embarquées : migrations Alembic (Phase E : upgrade head au boot) ---
datas = [
    ('src/alembic', 'src/alembic'),
    ('src/alembic.ini', 'src'),
]
# Données de packages tiers susceptibles d'embarquer des ressources.
datas += collect_data_files('pdfplumber')
datas += collect_data_files('pdfminer')

# --- Imports résolus dynamiquement (non vus par l'analyse statique) ---
hiddenimports = []
hiddenimports += collect_submodules('uvicorn')        # loops/protocols/lifespan
hiddenimports += collect_submodules('src')            # routes/services/models
hiddenimports += collect_submodules('alembic')        # migrations au boot (D14)
hiddenimports += [
    'pyodbc',
    'sqlalchemy.dialects.mssql',
    'sqlalchemy.dialects.mssql.pyodbc',
    'sqlalchemy.dialects.sqlite',
    'anyio',
    'email.mime.multipart',
]

block_cipher = None

a = Analysis(
    ['server_entry.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'pytest', '_pytest'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ecb-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,          # garde une console : logs visibles si lancé seul / debug
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='ecb-server',
)
