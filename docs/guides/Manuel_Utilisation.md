# Manuel d'utilisation — PCB Flow Production Suite

Guide pratique pour l'opérateur. L'application accompagne une production de
cartes électroniques, de l'import de la BOM jusqu'à la configuration des
machines Pick & Place.

---

## 1. Démarrer l'application

- Double-cliquez sur le raccourci **PCB Flow Production Suite** (Bureau ou menu
  Démarrer).
- Un court écran « Démarrage… » s'affiche le temps que le moteur interne se lance,
  puis l'écran **Productions** apparaît.

> Si l'écran « Backend indisponible » s'affiche : la base de données n'est pas
> joignable. En multi-postes, vérifiez la connexion au serveur SQL (voir §8).

---

## 2. Comprendre l'écran

- **Barre du haut** : le **workflow en 5 étapes** (Productions → Import BOM →
  Revue BOM → Commande → Machine PnP). Les étapes se cochent en vert au fur et à
  mesure.
- **Menu de gauche** :
  - *Workflow* : les 5 étapes de production.
  - *Bibliothèque* : Prix carte · BOM enregistrées · Base de données.
  - *Système* : Paramètres.
- **Bas de gauche** : la **production active** en cours.

---

## 3. Le workflow de production

### Étape 1 — Productions
Point de départ. Créez une nouvelle production (**+ Nouvelle production**) ou
**chargez-en une existante** depuis la liste pour reprendre le travail. La
production active sert de contexte à toutes les étapes suivantes.

### Étape 2 — Import BOM
Importez le ou les fichiers **BOM** de la carte (formats Eagle, Excel, CSV).
L'application **harmonise** les références et signale :
- les **composants manquants** (à compléter dans le catalogue) ;
- les **empreintes PnP** non renseignées.
Renseignez ce qui manque pour pouvoir continuer.

### Étape 3 — Revue BOM
Passez la BOM **ligne par ligne** : vérifiez les composants, **validez le stock**
(la ligne passe au vert quand le besoin est couvert), marquez les lignes non
montées (DNP). Vous pouvez exporter en CSV.

### Étape 4 — Commande
L'application calcule la **liste des composants à commander** à partir des BOM de
la production (avec prix/disponibilité fournisseurs si configurés). Saisissez les
quantités reçues, puis **générez l'export ERP** (Excel).

### Étape 5 — Machine PnP
Configurez la ligne **Pick & Place** : machines, **feeders** (fixes/variables),
chariots, plan d'implantation. Cette étape prépare le passage en machine.

---

## 4. Bibliothèque

- **Prix carte** : calcule le **coût de revient** d'une carte (matière + main
  d'œuvre + frais), en HT/TTC, et conserve un **historique de prix** par carte.
- **BOM enregistrées** : bibliothèque des BOM déjà importées (arborescence +
  détail des révisions). Bouton **Ouvrir** pour recharger une révision.
- **Base de données** : catalogue des composants, empreintes machine, règles de
  typage et d'harmonisation.

---

## 5. Paramètres

Référentiels et options : catalogue composants, empreintes machine, valeurs par
défaut de l'export ERP, connecteurs fournisseurs (Mouser, DigiKey…).

---

## 6. Mises à jour

L'application se met à jour **toute seule** :
- au démarrage, elle vérifie s'il existe une nouvelle version ;
- à tout moment via **Aide → Rechercher les mises à jour** ;
- quand une mise à jour est prête, elle vous propose de **redémarrer pour
  l'installer**.

---

## 7. Bonnes pratiques

- Travaillez toujours **dans une production active** (chargez-la avant l'import).
- Complétez les **composants/empreintes manquants** signalés à l'import : ils
  bloquent les étapes suivantes.
- **Validez le stock** en Revue BOM avant de générer la commande.
- Les données sont communes à tous les postes en multi-postes : une modification
  est visible par les collègues.

---

## 8. En cas de souci

| Symptôme | Que faire |
|---|---|
| « Backend indisponible » au démarrage | Base injoignable. Multi-postes : vérifier le serveur SQL et le réseau ; pilote **ODBC Driver 17** installé. |
| « Network Error » / données qui ne chargent pas | Fermer puis relancer l'application. |
| Une production semble figée | Recharger la production depuis l'écran Productions. |
| Doute sur la version | Menu **Aide → À propos**. |

> Pour la configuration technique (base SQLite locale ou SQL Server central),
> voir `docs/guides/DEPLOYMENT.md`.
