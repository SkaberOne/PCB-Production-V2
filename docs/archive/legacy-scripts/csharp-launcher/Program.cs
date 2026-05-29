using System.Diagnostics;

namespace ECBBackendLauncher;

internal static class Program
{
    private const string CheckFlag = "--check";
    private const string ReloadFlag = "--reload";
    private const string NoReloadFlag = "--no-reload";

    private static Process? _backendProcess;

    private static int Main(string[] args)
    {
        try
        {
            var baseDirectory = AppContext.BaseDirectory;
            var projectRoot = FindProjectRoot(baseDirectory);
            if (projectRoot is null)
            {
                Console.Error.WriteLine("Impossible de retrouver la racine du projet a partir du dossier de l'executable.");
                Console.Error.WriteLine($"Dossier courant du lanceur: {baseDirectory}");
                return 1;
            }

            // .venv peut être dans projectRoot ou dans son parent
            var venvInRoot = Path.Combine(projectRoot, ".venv", "Scripts", "python.exe");
            var venvInParent = projectRoot is not null && Directory.GetParent(projectRoot) is not null
                ? Path.Combine(Directory.GetParent(projectRoot)!.FullName, ".venv", "Scripts", "python.exe")
                : null;
            var pythonPath = File.Exists(venvInRoot) ? venvInRoot : venvInParent ?? venvInRoot;
            var launchScript = Path.Combine(projectRoot, "launch.py");

            if (!File.Exists(pythonPath))
            {
                Console.Error.WriteLine("Python de la virtualenv introuvable.");
                Console.Error.WriteLine($"Chemin attendu: {pythonPath}");
                return 1;
            }

            if (!File.Exists(launchScript))
            {
                Console.Error.WriteLine("Le script launch.py est introuvable.");
                Console.Error.WriteLine($"Chemin attendu: {launchScript}");
                return 1;
            }

            var checkOnly = HasArg(args, CheckFlag);
            var useReload = HasArg(args, ReloadFlag) && !HasArg(args, NoReloadFlag);
            var backendArguments = $"\"{launchScript}\" {(useReload ? ReloadFlag : NoReloadFlag)}";

            Console.WriteLine("ECB Backend Launcher");
            Console.WriteLine($"Projet: {projectRoot}");
            Console.WriteLine($"Python: {pythonPath}");
            Console.WriteLine($"Commande PowerShell equivalente: & \".\\.venv\\Scripts\\python.exe\" \"launch.py\" {(useReload ? ReloadFlag : NoReloadFlag)}");

            if (checkOnly)
            {
                Console.WriteLine("Verification terminee: le backend peut etre lance depuis cet executable.");
                return 0;
            }

            Console.CancelKeyPress += OnCancelKeyPress;
            AppDomain.CurrentDomain.ProcessExit += OnProcessExit;

            var startInfo = new ProcessStartInfo
            {
                FileName = pythonPath,
                Arguments = backendArguments,
                WorkingDirectory = projectRoot,
                UseShellExecute = false,
            };

            _backendProcess = Process.Start(startInfo);
            if (_backendProcess is null)
            {
                Console.Error.WriteLine("Impossible de demarrer le backend.");
                return 1;
            }

            Console.WriteLine("Backend demarre. Ferme cette fenetre ou fais Ctrl+C pour l'arreter.");
            _backendProcess.WaitForExit();
            return _backendProcess.ExitCode;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine("Erreur lors du lancement du backend.");
            Console.Error.WriteLine(exception.ToString());
            return 1;
        }
    }

    private static void OnCancelKeyPress(object? sender, ConsoleCancelEventArgs eventArgs)
    {
        eventArgs.Cancel = true;
        StopBackendProcess();
        Environment.Exit(0);
    }

    private static void OnProcessExit(object? sender, EventArgs eventArgs)
    {
        StopBackendProcess();
    }

    private static void StopBackendProcess()
    {
        if (_backendProcess is null)
        {
            return;
        }

        try
        {
            if (!_backendProcess.HasExited)
            {
                _backendProcess.Kill(entireProcessTree: true);
                _backendProcess.WaitForExit(3000);
            }
        }
        catch
        {
            // Ignore shutdown cleanup errors.
        }
        finally
        {
            _backendProcess.Dispose();
            _backendProcess = null;
        }
    }

    private static bool HasArg(IEnumerable<string> args, string expected)
    {
        return args.Any(arg => string.Equals(arg, expected, StringComparison.OrdinalIgnoreCase));
    }

    private static string? FindProjectRoot(string startDirectory)
    {
        // Nouvelle structure: launch.py est dans serveur/, .venv est dans la racine projet (parent de serveur/)
        // Cherche un dossier contenant launch.py avec .venv soit dans ce dossier soit dans le parent
        DirectoryInfo? current = new DirectoryInfo(startDirectory);

        while (current is not null)
        {
            var launchPath = Path.Combine(current.FullName, "launch.py");

            if (File.Exists(launchPath))
            {
                // .venv dans le même dossier (ancien layout)
                var venvLocal = Path.Combine(current.FullName, ".venv", "Scripts", "python.exe");
                if (File.Exists(venvLocal))
                    return current.FullName;

                // .venv dans le parent (nouveau layout: launch.py dans serveur/, .venv à la racine)
                if (current.Parent is not null)
                {
                    var venvParent = Path.Combine(current.Parent.FullName, ".venv", "Scripts", "python.exe");
                    if (File.Exists(venvParent))
                        return current.FullName;
                }
            }

            current = current.Parent;
        }

        return null;
    }
}
