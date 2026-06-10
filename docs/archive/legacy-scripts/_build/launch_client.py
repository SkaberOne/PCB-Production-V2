"""
LANCER_CLIENT.exe - Lanceur du client React PCB Flow Production Suite
Compile avec : pyinstaller --onefile --console --name LANCER_CLIENT launch_client.py
"""
import sys
import os
import subprocess
import threading
import time


def get_project_root():
    """Retourne la racine du projet (dossier contenant l'exe compilé)."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    # Mode script : remonter d'un niveau depuis _build/
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def open_chrome(url, delay):
    """Ouvre Chrome sur l'URL donnée après le délai (secondes)."""
    time.sleep(delay)
    try:
        subprocess.Popen(
            'start chrome "{}"'.format(url),
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception as exc:
        print("[INFO] Impossible d'ouvrir Chrome automatiquement : {}".format(exc))


def main():
    project_root = get_project_root()
    frontend_dir = os.path.join(project_root, "client", "src", "frontend")
    node_modules = os.path.join(frontend_dir, "node_modules")

    print("=" * 52)
    print("   PCB Flow Production Suite  -  CLIENT REACT")
    print("=" * 52)
    print("Projet   : {}".format(project_root))
    print("Frontend : {}".format(frontend_dir))
    print()

    # Vérification dossier
    if not os.path.exists(frontend_dir):
        print("[ERREUR] Dossier frontend introuvable : {}".format(frontend_dir))
        input("\nAppuyez sur Entree pour fermer...")
        sys.exit(1)

    # npm install si node_modules absent (1ère exécution)
    if not os.path.exists(node_modules):
        print("[INFO] node_modules absent - installation npm (patientez ~2 min)...")
        npm_result = subprocess.run(
            ["npm.cmd", "install"],
            cwd=frontend_dir,
        )
        if npm_result.returncode != 0:
            print("[ERREUR] npm install a echoue (code {}).".format(npm_result.returncode))
            input("\nAppuyez sur Entree pour fermer...")
            sys.exit(1)
        print("[OK] Dependencies installees.")
        print()

    print("Demarrage React sur  http://localhost:3000")
    print("Chrome ouvrira dans  ~14 secondes...")
    print("Ctrl+C pour arreter.")
    print()

    # Ouvrir Chrome après délai dans un thread daemon
    t = threading.Thread(target=open_chrome, args=("http://localhost:3000", 14), daemon=True)
    t.start()

    # Environnement : on empêche react-scripts d'ouvrir son propre navigateur
    env = os.environ.copy()
    env["BROWSER"] = "none"
    env["HOST"] = "localhost"
    env["DANGEROUSLY_DISABLE_HOST_CHECK"] = "true"

    try:
        result = subprocess.run(
            ["npm.cmd", "start"],
            cwd=frontend_dir,
            env=env,
        )
        code = result.returncode
    except KeyboardInterrupt:
        code = 0

    print()
    if code != 0:
        print("[Client React arrete avec code {}]".format(code))
    else:
        print("[Client React arrete proprement]")

    input("\nAppuyez sur Entree pour fermer...")
    sys.exit(code)


if __name__ == "__main__":
    main()
