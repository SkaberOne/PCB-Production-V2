# ADR 0013 — Concurrence multi-postes : temps réel scopé, concurrence optimiste, présence, et staging LAN

**Date** : 2026-07-07
**Statut** : 🟡 Accepté — implémentation par phases (non démarrée)
**Décideurs** : Eric (décisions métier actées) · Claude (architecture)
**Contexte** : le logiciel est **déployé et utilisé en production** sur le LAN (backend unique
`192.168.5.44:8000` servant l'UI web `build-web`, clé partagée `pcbflow-lan-2026`, base SQL Server
`ECB_Production`). Suite de l'audit [`docs/audits/Audit_2026-07-07_multi-postes_multi-productions.md`].

---

## Contexte

Plusieurs postes utilisent l'app simultanément via navigateur. L'audit a montré que l'architecture
est **déjà saine** pour le multi-production : « production active » propre à chaque navigateur
(localStorage), données cloisonnées par `production_id`, stock global **volontaire** déjà réparti
entre productions par réservation ([ADR 0011](0011-cloture-production-reservation-stock.md)).

Restent des angles morts : **vues périmées** (pas de temps réel), **écrasement silencieux** en cas
d'édition simultanée de la même donnée (pas de concurrence), et **aucune conscience** de qui est
présent sur une production. Eric souhaite en plus deux améliorations UX (icône de présence sur la
BOM, bouton de validation rapide du stock en Revue BOM) et, impératif, un moyen de **tester les
nouveautés sans perturber la prod en cours d'utilisation**.

---

## Décisions (actées avec Eric)

### 1. Concurrence **optimiste** (avertir, ne pas bloquer)

Pas de verrou dur : deux postes peuvent travailler sur la même production. Chaque entité éditable
sensible porte un jeton de version (`updated_at`/`version`) **vérifié à l'écriture**. Si la donnée a
changé entre-temps, le backend renvoie **HTTP 409** et l'UI affiche « cette donnée a été modifiée
par un autre poste, recharger ? » au lieu d'écraser. C'est le choix « avertir et laisser choisir ».

### 2. Temps réel **scopé** — deux canaux (SSE)

Le temps réel n'est mis **que là où il rapporte**, via deux sujets d'abonnement :

- **`production:{id}`** — abonnés = les postes qui ont **ouvert cette production**. Diffuse les
  changements de CETTE production (placements, plan, épinglages, Revue BOM de la prod, présence).
  Sert au cas « 2 postes sur la même prod ». Silencieux pour les autres → pas de bruit.
- **`stock`** — canal **global**. Diffuse les changements de stock et de **disponibilité** (la
  seule chose réellement partagée entre productions, car `dispo = solde − réservé_par_les_autres −
  engagé`). Poussé à quiconque regarde l'écran Stock **ou** vérifie la dispo en Revue BOM, quelle
  que soit sa production.

**Conséquence clé** : deux postes sur des productions **différentes** ne se synchronisent PAS sur
leurs données propres (inutile, déjà isolées) — ils ne partagent que le canal `stock`.

**Transport = SSE** (Server-Sent Events) : unidirectionnel serveur→client, trivial à exposer avec
FastAPI (`StreamingResponse`/`EventSourceResponse`), reconnexion native côté navigateur. Le sens
client→serveur (heartbeat de présence, actions) passe par de simples requêtes POST. WebSocket
écarté (bidirectionnel non nécessaire ici).

### 3. Présence par production (sans identité persistée)

Un identifiant de **session éphémère par onglet** (généré côté client, non persisté) permet de
compter les postes présents sur une production. Le backend tient cet état **en mémoire** (map
`production_id → {session_id: last_seen}`), rafraîchi par heartbeat périodique, expiré par **TTL**.

Affichage : petit picto « personnes » + **nombre** dans l'en-tête de la **Revue BOM** (badge « 2 »),
avec au survol la liste courte ; badge discret réutilisable ailleurs. Émis sur le canal
`production:{id}`.

### 4. Pas de traçabilité par opérateur

Aucune colonne `user_id`/`poste` persistée nulle part. L'identifiant de session ne sert qu'à la
présence en mémoire (volatile). Choix explicite d'Eric.

### 5. Bouton « Valider la quantité stock » en Revue BOM (version A)

En Revue BOM (vérification de dispo), chaque ligne affiche déjà la quantité connue par le stock
(le **solde**). Un bouton **« Valider »** par ligne marque la ligne comme **vérifiée** (pastille
verte + horodatage) **sans toucher au solde** — puisque la quantité physique est toujours confirmée
sur le terrain. Un bouton **« Tout valider »** confirme d'un coup les lignes dont le stock est déjà
renseigné. Objectif : **ne pas re-saisir** les quantités déjà bonnes ; on ne tape une valeur que si
elle est fausse.

Le statut « vérifié » est **persisté par (production, composant)** avec horodatage (marqueur léger,
sans identité), pour survivre au rafraîchissement et à un changement de poste. Ce n'est **pas** un
mouvement de stock (version A retenue ; la version B « re-poster une déclaration » est écartée,
trace inutile).

### 6. Stratégie de **staging / rollout** LAN (ne pas perturber la prod)

- **Prod inchangée** : `:8000`, `build-web`, base `ECB_Production`, clé `pcbflow-lan-2026`. Les
  collègues continuent normalement pendant tout le développement.
- **Instance de test parallèle** (Eric seul) : second backend sur `:8001`, servant un build séparé
  `build-web-staging` construit depuis la branche des nouveautés, clé distincte `pcbflow-staging`,
  base **`ECB_Production_STAGING` = copie de la prod** (restaurée depuis une sauvegarde). Accessible
  uniquement de qui connaît le port + la clé. Les écritures de test **n'impactent jamais** la prod.
- **Promotion** : quand Eric a validé sur `:8001`, on reconstruit le `build-web` de prod (`:8000`).
  Côté **appli desktop**, l'`.exe` n'est reconstruit **qu'à la décision d'Eric** (l'auto-update
  reste piloté par lui) — donc les tests ne dérangent personne.
- Outillage à prévoir : `client/CONSTRUIRE_WEB_STAGING.bat` (sortie `build-web-staging`,
  `web.staging.env`), `serveur/DEMARRER_SERVEUR_WEB_STAGING.bat` (port 8001, `API_KEY=pcbflow-staging`,
  `WEB_STATIC_DIR=build-web-staging`, `DATABASE_URL` → base STAGING). Pare-feu : ouvrir 8001 en
  entrée si test depuis un autre poste (sinon inutile si test en local sur le serveur).

---

## Plan par phases (proposé)

0. **Staging** : base copie `ECB_Production_STAGING` + scripts build/lancement `:8001`. Socle de test.
1. **Bouton « Valider quantité stock »** (version A) + « Tout valider » en Revue BOM. Petit,
   valeur immédiate, testable seul en staging.
2. **Concurrence optimiste** sur les entités éditables sensibles (production, stock) : jeton de
   version + 409 + UI « recharger ? ».
3. **Présence** par production (SSE + heartbeat) + icône compteur sur la Revue BOM.
4. **Temps réel** complet des deux canaux (`production:{id}` et `stock`), branché sur les écrans.

Chaque phase est livrée sur branche courte, testée en staging (`:8001`), puis promue.

---

## Conséquences

- ✅ Deux postes sur la même production travaillent avec des vues à jour ; plus d'écrasement
  silencieux (avertissement 409).
- ✅ Temps réel **léger** : deux sujets seulement, pas de flux global ; les postes sur des prod
  différentes ne reçoivent que le canal `stock`.
- ✅ Saisie de stock allégée en Revue BOM (validation en un clic, « tout valider »).
- ✅ Tests **isolés** de la prod (base copie + port + clé séparés) — zéro risque pour les collègues
  en cours d'utilisation.
- ⚠️ SSE = une connexion persistante par onglet ; dimensionnement OK à l'échelle atelier (peu de
  postes), à surveiller si beaucoup d'onglets.
- ⚠️ Présence **volatile** : un poste fermé brutalement disparaît par TTL (léger décalage).
- ⚠️ Base staging = **copie figée** : elle se désynchronise de la prod au fil du temps (à re-copier
  quand on veut retester sur des données fraîches).
- ⚠️ Concurrence optimiste à déployer **entité par entité** (coût réparti sur la phase 2).
- ⚠️ État de présence en mémoire du process backend : perdu au redémarrage (acceptable, se
  reconstruit aux heartbeats).

---

## Alternatives écartées

- **Temps réel global (tout poussé à tous)** : bruit + coût inutiles ; remplacé par deux canaux scopés.
- **WebSocket** : bidirectionnel non nécessaire ; SSE + POST suffit et est plus simple.
- **Verrou dur « production entière »** : contredit « avertir/laisser choisir » et « 2 postes sur la
  même prod » ; écarté au profit de la concurrence optimiste + présence informative.
- **Identité / traçabilité par opérateur** : non désirée par Eric ; écartée.
- **Staging sur la même base que la prod** : risque d'écriture sur données live ; écarté au profit
  d'une copie séparée.
- **Bouton « valider » qui re-poste une déclaration de stock (version B)** : trace inutile ;
  version A « marquer vérifié » retenue.

---

## Références

- Audit source : `docs/audits/Audit_2026-07-07_multi-postes_multi-productions.md`
- ADR liés : `0008-base-partagee-sql-server.md`, `0009-deploiement-config-postes-client-host.md`,
  `0010-inventaire-stock-composants.md`, `0011-cloture-production-reservation-stock.md`,
  `0012-stock-engage-feeders.md`
- Zones concernées (indicatif) :
  - Backend : `serveur/src/routes/` (nouveau routeur SSE + endpoints présence/vérif), `services/production_stock_service.py`, `models/stock.py` (marqueur « vérifié » par production/composant)
  - Front : `client/src/frontend/src/components/bom/BomReviewTab.jsx` (bouton valider + icône présence), `context/BomSessionContext.jsx`, `api/client.js` (abonnement SSE)
  - Déploiement : `client/CONSTRUIRE_WEB_STAGING.bat`, `serveur/DEMARRER_SERVEUR_WEB_STAGING.bat`, `client/web.staging.env`
