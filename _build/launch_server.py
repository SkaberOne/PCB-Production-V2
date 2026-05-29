"""
LANCER_SERVEUR.exe - Lanceur du serveur FastAPI ECB Production Manager
Compile avec : pyinstaller --onefile --console --name LANCER_SERVEUR launch_server.py
"""
import sys
import os
import subprocess


def get_project_root():
    """Retourne la racine du projet (dossier contenant l'exe compilé)."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    # Mode script : remonter d'un niveau depuis _build/
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    project_root = get_project_root()
    python_exe = os.path.join(project_root, ".venv", "Scripts", "python.exe")
    serveur_dir = os.path.join(project_root, "serveur")
    launch_script = os.path.join(serveur_dir, "launch.py")

    print("=" * 52)
    print("   ECB Production Manager  -  SERVEUR API")
    print("=" * 52)
    print("Projet  : {}".format(project_root))
    print("Python  : {}".format(python_exe))
    print()

    # Vérifications
    if not os.path.exists(python_exe):
        print("[ERREUR] .venv Python introuvable : {}".format(python_exe))
        print("Lancez INSTALLER_SERVEUR.bat d'abord.")
        input("\nAppuyez sur Entree pour fermer...")
        sys.exit(1)

    if not os.path.exists(launch_script):
        print("[ERREUR] serveur/launch.py introuvable : {}".format(launch_script))
        input("\nAppuyez sur Entree pour fermer...")
        sys.exit(1)

    # Le launch.py fait lui-même os.chdir(serveur/) — on se place dans serveur/
    os.chdir(serveur_dir)

    print("Demarrage FastAPI sur  http://localhost:8000")
    print("Swagger UI          :  http://localhost:8000/docs")
    print("Ctrl+C pour arreter.")
    print()

    try:
        result = subprocess.run([python_exe, launch_script, "--no-reload"])
        code = result.returncode
    except KeyboardInterrupt:
        code = 0

    print()
    if code != 0:
        print("[Serveur arrete avec code {}]".format(code))
    else:
        print("[Serveur arrete proprement]")

    input("\nAppuyez sur Entree pour fermer...")
    sys.exit(code)


if __name__ == "__main__":
    main()
