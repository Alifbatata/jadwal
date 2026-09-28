# État du projet jadwal

Ce fichier fait autorité sur l'avancement. Il est mis à jour à la fin de chaque étape.

## Étape en cours

- **Étape 0** (dépôt, licences, docs, CI) : terminée le 2026-09-19.
- **Étape 1** (`packages/core` et ses tests) : terminée le 2026-09-20.
- **Étape 2** (base, RLS, données de démo) : terminée le 2026-09-20.
- **Étape 3** (connexion, organisations, rôles, invitations, super-admin, journal) : terminée le
  2026-09-20.
- **Étape 4** (pouvoirs du super-admin, courriel sans AWS, espace des responsables) : terminée le
  2026-09-20.
- **Étape 5** (API publique, pages publiques en 4 langues, flux agenda) : terminée le 2026-09-20.
- **Étape 6** (widget intégrable, flux par cours, référencement) : terminée le 2026-09-21.
- **Étape 7** (heures de prière, couleur d'accent, compteur de vues) : terminée le 2026-09-21.
- **Étape 8** (heures réelles de l'organisation, iqama, prière du vendredi) : terminée le 2026-09-21.
- **Étape 9** (finitions, infrastructure en code, mise en production) : **terminée le
  2026-09-21**. Les phases 1 et 2 : tout est écrit, éprouvé en local, et l'image de production est publiée par
  digest. La question de l'isolation du déploiement est tranchée et consignée dans
  `docs/adr/0034-isolation-du-deploiement.md`. Depuis, trois décisions se sont ajoutées : les
  sauvegardes ne sont plus effaçables depuis le serveur (ADR 0037), la sonde quitte GitHub Actions
  pour devenir une minuterie de jadwal (ADR 0038), et `pnpm test` refuse désormais un test sauté en
  silence. `pnpm lint` refuse aussi le tiret cadratin et une liste de chevilles dans les textes que
  les gens lisent. **La phase 3, le déploiement, est jouée** : jadwal est en ligne depuis le
  2026-09-21, servi par le Caddy de l'hôte, sonde au vert sur les deux piles, et une archive
  chiffrée a été envoyée, relue, puis **déchiffrée et restaurée** avec la clé privée de
  l'exploitant. Il reste à ouvrir le premier compte.
- **Étape 10** (la mise en ligne) : **terminée le 2026-09-21**. Elle a trouvé cinq défauts qu'aucun
  `--check` ne pouvait voir, parce qu'un `--check` saute les tâches `shell` et ne lance aucun
  service. Ils sont corrigés, et chacun porte dans le code la ligne qui dit ce qu'il a coûté :
  `pipefail` sous `dash`, le rechargement de Caddy conditionné à un changement qui n'arrive jamais
  au second passage, `pg_dump` sans mot de passe dans son propre conteneur, la clé privée consommée
  par une commande antérieure avant d'arriver à `age`, et une alerte qui se marquait elle-même en
  échec après avoir abouti.
- **Étape 11** (courriel, fausses alertes, IPv6, premier compte) : **terminée le 2026-09-22**.
  Le fichier d’environnement est lu **tel quel** par les deux conteneurs (`format: raw`), parce que
  ses deux lecteurs ne lisaient pas pareil et tronquaient un secret en silence. La veille ne
  s’inquiète plus d’une tâche avant son premier déclenchement, qu’elle demande à systemd plutôt que
  de le recopier. Les erreurs de rclone ont disparu, et leur cause comptait : elles rendaient son
  code de retour menteur, donc la preuve des verrous de conservation douteuse. Et le premier compte
  super-admin s’ouvre par une commande, non plus par un `update` tapé dans la base.
- **Étape 12** (Caddy à jour, conteneur de démarrage, finitions) : **terminée le 2026-09-22**.
  Le conteneur exposé à Internet ne porte plus les deux mots de passe qui contournent la sécurité par
  ligne : un conteneur de démarrage crée les rôles et passe les migrations, puis s'arrête, et
  l'application ne démarre qu'après sa réussite (ADR 0040). Caddy quitte le paquet de la
  distribution pour celui de l'éditeur, parce que la version distribuée ne connaît pas `log_skip` —
  sans quoi `/healthz`, interrogé 576 fois par jour par la sonde, resterait majoritaire dans un
  journal borné à quatorze jours. Et le dépôt se donne une règle de test qu'il n'avait pas :
  **un script qu'aucun test ne lance n'est pas éprouvé**.
- **Étape 13** (licence MIT, présentation générale, conditions exactes, serveur) : **terminée le
  2026-09-22**, sauf la licence. jadwal ne s'adresse plus à un seul genre d'organisation : le dépôt,
  la documentation et l'application parlent d'organisations, et les heures de prière sont devenues un
  **module optionnel, éteint par défaut** (ADR 0042), tenu dans les deux sens par la base plutôt que
  par l'écran. Les conditions d'utilisation ont été confrontées au code ligne à ligne : là où le
  texte était faux, c'est le code qui a changé — une session ne garde plus ni adresse ni navigateur,
  et trois purges manquaient (ADR 0041).
- **Étape 14** (licence MIT, zéro faute, PDF final) : **terminée le 2026-09-22**. Le point d'arrêt
  de l'étape 13 est levé, et par la racine : l'image de production ne porte plus aucun outil de
  construction. Elle passe de 193 paquets et 237 Mio à 60 paquets et 73 Mio, et plus une seule
  licence à réciprocité. **jadwal est sous licence MIT**, widget compris (ADR 0043), avec un
  fichier des licences tierces engendré à la construction et livré dans l'image.
  Tout ce que des gens lisent passe désormais par LanguageTool, en conteneur et hors réseau, en
  quatre langues : `pnpm orthographe`, et un flux de CI qui le relance quand un texte change
  (**c'était faux pour les huit documents de la racine de `docs/`**, `CONDITIONS.md` compris :
  le motif de fichiers exigeait un sous-dossier ; trouvé et corrigé à l'étape 16). Le
  PDF pour le juriste ne finit plus sur une page presque vide, et sa mise en pages est mesurée
  dans le PDF rendu, pas supposée.
- **Étape 15** (conditions exactes au mot près, relecture de l'arabe) : **terminée le 2026-09-22**.
  Six phrases des conditions d'utilisation affirmaient plus que le code ne tient : chacune est
  corrigée, et chaque phrase de fait du document a désormais sa preuve, fichier et ligne ou requête
  et résultat. La liste des données personnelles passe de six à neuf catégories, refaite table par
  table contre le schéma. Les noms de code de la documentation passent entre accents graves, et le
  dictionnaire du correcteur ne garde que de vrais mots. Les 114 textes arabes publics sont
  relevés pour relecture ; **aucun n'a été modifié**.
- **Étape 16** (conditions en ligne et acceptées, arabe corrigé, parcours complet éprouvé) :
  **terminée le 2026-09-23**. Le service sert ses conditions sur `/conditions`, rendues depuis
  `docs/CONDITIONS.md` par le convertisseur du PDF, et les fait accepter d'un clic à chaque
  personne de l'espace d'une organisation, de nouveau à chaque version ; l'exploitant n'y est pas
  soumis (ADR 0044). Les textes arabes relus par le chef de projet sont corrigés, et relus
  désormais par le correcteur, qui lit aussi les documents de la racine de `docs/`. Tout le
  parcours d'une organisation passe dans un vrai navigateur, contre l'image de production, avec
  axe sur chaque page : `pnpm parcours:test`. Deux failles antérieures trouvées en chemin sont
  fermées : une éditrice pouvait rattacher n'importe quel compte à son organisation (migration
  0053), et le super-admin entré dans une organisation lisait les réglages d'une autre.
- **Étape 17** (dernières retouches avant les tests du chef de projet) : **terminée le
  2026-09-25**. Les conditions disent 182 jours, et une vérification de nuit refuse tout objet
  distant plus vieux que l'âge promis pour son préfixe, même recopié, même quand le stockage refuse
  de lire ses métadonnées. Le parcours complet a son propre flux dans la CI, et le déploiement
  refuse une image dont le commit n'a pas de parcours vert (ADR 0045). Le parcours a trouvé une
  faille antérieure : pour une personne membre de deux organisations, le rôle était lu sans filtre
  d'organisation, et une éditrice de l'une recevait les droits de responsable qu'elle avait dans
  l'autre. La faille est fermée, avec six autres défauts trouvés en chemin. La base tient désormais
  l'échéance, le rôle et les passages de statut d'une invitation (migrations 0056 à 0058), et le
  super-admin entré dans une organisation ne lit plus les autres (0055).
- **Étape 18** (les retours des tests du chef de projet) : **terminée, et déployée le
  27.09.2026**. Une règle réunit les retours : une
  personne qui ne connaît rien au service doit tout comprendre seule, sans aide. Le service parle
  maintenant cinq langues partout, l'anglais britannique en plus, dans l'espace des responsables, le
  super-admin et les courriels comme sur la page publique ; les dates s'écrivent `JJ.MM.AAAA`, comme
  en Suisse ; chaque écran de l'espace dit ce qu'il fait ; les heures de prière se règlent par une
  seule question, pour une localité choisie dans la liste officielle de swisstopo ; la page publique
  a un onglet Prières, et l'abonnement au calendrier propose le bouton de l'appareil ; la base
  sépare enfin l'éditeur du responsable. Les sept lots sont intégrés : 3 293 tests, tous réussis,
  mesurés le 27.09.2026 sur le commit livré.
- **Étape 19** (zéro défaut connu, l'arabe relu, le nom hors de l'historique) : **livrée le
  28.09.2026**. L'historique public est réécrit : aucun commit ne porte plus le nom du chef de
  projet, et le paquet d'images ne garde que des versions construites depuis le nouvel historique.
  Les douze corrections de l'arabe sont faites, et plus aucun défaut relevé à l'étape 18 ne reste :
  la base refuse au journal un auteur qui n'est pas la personne connectée et ne montre plus la liste
  des membres à un éditeur, un cours se supprime par le responsable seul, l'état « archivé » a
  disparu. Chaque question de l'étape 18 est appliquée comme le chef de projet l'a tranchée, et
  l'invitation part dans la langue que choisit qui invite. 3 748 tests, tous réussis, aucun sauté,
  et 22 tests liés au temps, à part ; parcours complet : 381 vérifications, dont 92 pour l'étape 19,
  et axe sans rien de sérieux sur 38 pages. Mesurés par la CI le 28.09.2026 sur le commit livré.

## Fait

Étape 0 :

- Monorepo pnpm (`@jadwal/*`, paquets privés), pnpm épinglé par corepack, chaîne
  d'approvisionnement durcie (`minimumReleaseAge`, `strictDepBuilds`, `trustPolicy`,
  `blockExoticSubdeps`, versions exactes).
- `packages/core` (TypeScript strict, constante de démonstration à supprimer à l'étape 1),
  `packages/db` (README seul), `packages/widget` (custom element Svelte 5, Vite en mode bibliothèque,
  un seul fichier, test, mesure gzip, licence MIT), `apps/web` (SvelteKit, adapter-node, `/` et
  `/healthz` testé).
- ESLint (flat config), Prettier, svelte-check, TypeScript strict + `noUncheckedIndexedAccess`, Vitest.
- CI GitHub Actions (Node 24, corepack, `pnpm install --frozen-lockfile`, lint, check, test, build),
  Dependabot (npm + github-actions, délai de 7 jours).
- Licences (AGPL-3.0-or-later à l'époque, MIT pour le widget), README, CONTRIBUTING (CLA), SECURITY,
  `docs/CADRAGE.md`, ADR 0000 à 0010, `docs/maquettes.md`, `docker-compose.dev.yml` (PostgreSQL 18,
  digest épinglé).

Étape 1 :

- `@jadwal/core` : modèle (`CourseSchedule`, `Recurrence` hebdomadaire à plusieurs jours et une
  semaine sur deux, mensuelle, dates ; `Timing` fixe ou ancré sur une prière ; exceptions annulée
  et déplacée ; pauses de cours ou d'organisation), validation à erreurs typées, arithmétique des
  dates en entiers (Howard Hinnant, aucun objet `Date`), `expandOccurrences`, `nextOccurrences`,
  `findOrphanExceptions`, `todayInZone`.
- `@jadwal/core/ics` : `buildCalendar` avec `ical-generator` et `timezones-ical-library`, sortie
  conforme à la grammaire de la RFC 5545 (propriétés avant les composants, CRLF final, `WKST`
  explicite, pas de `METHOD` sans `ORGANIZER`, UID sans caractère à échapper)
  (RRULE, EXDATE, RECURRENCE-ID, VTIMEZONE, UID stables, DTSTAMP fixé, rafraîchissement d'une heure),
  heures civiles passées sans dépendre du fuseau de la machine.
- Tests : propriétés `fast-check` 1970–2100 contre `Date.UTC`, expansion, ancrage (table de test
  de Bienne autour des changements d'heure), instantanés ICS, contrôle croisé avec `ical.js` sur
  deux ans, suite rejouée sous quatre fuseaux de machine (`pnpm test:tz`), couverture de 90 % en
  lignes et en branches imposée par `pnpm test`.
- Dépôt : CI avec l'action officielle `pnpm/setup` (SHA épinglé, cache du store) à la place de
  corepack ; alertes et mises à jour de sécurité Dependabot activées ; fichier `COPYRIGHT`
  (titulaire : Voltia) ; ADR 0003, 0004 et 0010 complétés, ADR 0011 et 0012.

Étape 2 :

- `@jadwal/db` : schéma Drizzle de onze tables (`organization`, `user`, `membership`, `room`,
  `course`, `course_translation`, `session_exception`, `pause`, `prayer_day`,
  `prayer_settings`, `audit_log`), rythme et horaire en colonnes explicites comme `@jadwal/core`,
  clés primaires en UUID v7 générées par l'application.
- Isolation par la sécurité au niveau des lignes de PostgreSQL, activée **et forcée** sur les onze
  tables, une politique par opération accordée, contexte posé par transaction (`withOrg`). Deux
  rôles applicatifs non privilégiés, créés par les migrations, mots de passe posés depuis
  l'environnement. Une écriture ne peut désigner que des personnes déjà visibles, et attacher une
  personne à une organisation relève du super-admin : sans cela, une organisation fabriquait
  l'adhésion qui lui ouvrait la lecture d'une personne d'une autre organisation.
- Migrations SQL versionnées par Drizzle Kit, plus trois migrations écrites à la main : amorçage
  (rôles, fonctions de contexte), durcissement (`FORCE ROW LEVEL SECURITY`, droits) et retrait des
  écritures d'adhésion au rôle applicatif. Chaque contrainte de vérification est close par
  `is true` : sans cela, une contrainte qui rend NULL accepte la ligne au lieu de la refuser.
- 116 tests du paquet à la fin de cette étape, dont 98 contre un vrai PostgreSQL avec le rôle non
  privilégié : isolation en lecture et en écriture, contexte absent ou illisible, absence de fuite entre transactions, journal
  d'audit en insertion seule, contraintes de vérification une par une, suppression en cascade d'une
  organisation, rôle super-admin, migrations écrites à la main vraiment rejouées, et un test de
  catalogue qui parcourt `pg_class` et `pg_policy` sans nommer les tables.
- Données de démonstration idempotentes (« Association Belvédère », personnes fictives, adresses en
  `example.test`), relues par `expandOccurrences` et `buildCalendar` pour prouver l'aller-retour
  avec le modèle de l'étape 1.
- CI : PostgreSQL en service du workflow, épinglé par le même digest que `docker-compose.dev.yml`.
- ADR 0013 (isolation par RLS), 0014 (UUID v7), 0015 (journal en insertion seule).

Étape 3 :

- **Propriétaire non privilégié** : un rôle qui possède tout, ni superutilisateur ni porteur de
  `BYPASSRLS`, donc soumis aux politiques comme les autres. Ses écritures d'entretien exigent un
  drapeau posé pour la durée d'une transaction. Un test de catalogue échoue si un objet appartient à
  un autre rôle, si ce rôle porte un attribut privilégié — directement ou par appartenance — ou si
  une table perd ses politiques d'entretien. Un script fait basculer une base existante (ADR 0019).
- **Connexion par lien magique**, sans aucun mot de passe : quinze minutes, un seul usage, jeton
  stocké haché. Better Auth pour les sessions, les liens et la limitation de débit ; les
  organisations, les adhésions, les rôles et les invitations restent à nous, dans notre schéma et
  sous notre isolation (ADR 0016).
- **Invitation sans fuite d'information** : le chemin ne consulte jamais les comptes, la réponse et
  le temps de réponse sont les mêmes pour une adresse connue et une adresse inconnue, et c'est la
  personne invitée qui crée son adhésion en acceptant. La base exige une invitation acceptée pour
  rejoindre une organisation (ADR 0017).
- **Accès de support du super-admin** : une organisation à la fois, motif écrit obligatoire,
  vingt-quatre heures au plus, révocable, en lecture seule, et tracé dans le journal de
  l'organisation visée, que ses responsables lisent (ADR 0018).
- **Rétention du journal d'audit à vingt-quatre mois**, portée par une politique de suppression et
  non par le code de la procédure, avec un horodatage que l'application ne peut pas écrire
  (ADR 0020).
- **Le dernier responsable d'une organisation** ne peut être ni retiré ni rétrogradé, par un
  déclencheur qui tient quel que soit le code appelant, y compris à travers la suppression d'un
  compte.
- **En-têtes de sécurité** sur toutes les réponses, politique de sécurité du contenu avec nonce, et
  `frame-ancestors` calculé par route pour les pages publiques à venir.
- **Interface minimale** en français, pensée pour le téléphone : demande de lien, choix de
  l'organisation, membres et invitations, page super-admin. Toutes les écritures passent par des
  form actions et fonctionnent sans JavaScript.
- 795 tests dans le dépôt, dont 28 dans l'application, qui lancent un vrai serveur contre un vrai
  PostgreSQL et suivent le cycle complet d'une connexion.
- `docs/SECURITE.md` : le modèle de menace en une page.
- **Deux revues adversariales** ont suivi le travail : l'une sur l'honnêteté des tests, l'autre sur
  les évasions. Huit écarts réels entre ce que les décisions annonçaient et ce que la base
  permettait ; ils sont corrigés par les migrations `0029` à `0032`, chacun rejoué. Le seul non
  corrigé est dit dans l'ADR 0017 : la personne invitée lit la ligne entière de l'organisation qui
  l'invite, parce qu'une politique porte sur des lignes et non sur des colonnes. Le rapport de
  l'étape en donne le détail.

Étape 4 :

- **Le super-admin a tous les droits, en permanence** (ADR 0025, qui **remplace** l'ADR 0018). La
  fenêtre d'accès de support est retirée : table, fonction, politiques, écran et tests. Il lit et
  écrit dans toutes les organisations, bornées par le seul contexte de celle où il est entré, qu'une
  bannière lui rappelle.
- **Ses écritures sont signées** dans le journal de l'organisation, comme celles d'un responsable ;
  **ses consultations n'y laissent rien**. Elles vont dans `admin_access_log`, un registre interne en
  insertion seule, hors de portée du rôle applicatif — aucun droit, aucune politique, aucune clé
  étrangère qui le rendrait atteignable par une jointure.
- **Passkey obligatoire pour ces pouvoirs** (`@better-auth/passkey`) : un lien magique seul ne les
  donne jamais, la session qui les porte est plafonnée à douze heures sans renouvellement, la
  limitation de débit y est plus stricte, et une passkey nouvelle exige une session déjà prouvée —
  sauf la première. Secours manuel côté base, jamais par courriel.
- **Courriel par SMTP** (`nodemailer`, MIT-0), AWS SES retiré du dépôt (ADR 0024). Réessai sur une
  panne passagère, jamais sur un refus définitif, traces sans le lien. Lien de connexion de secours
  produit par le super-admin quand le courriel ne part plus.
- **Espace des responsables** (ADR 0021) : À venir sur sept jours avec annulation, déplacement et
  rétablissement ; cours, création, modification et pauses ; partage avec QR code ; réglages. Tous
  les aperçus viennent de `@jadwal/core`, l'écran d'accueil tient en cinq requêtes, tout fonctionne
  sans JavaScript sauf l'enregistrement d'une passkey.
- **Purges** : comptes sans adhésion à douze mois, invitations résolues à quatre-vingt-dix jours,
  procédures du propriétaire comme celle du journal.
- **Un bug de connexion trouvé en mesurant** : Better Auth se sert de `verification` comme table de
  verrous avec une clé primaire en SHA-256, que la colonne `uuid` refusait. Tout compte créé à la
  main — dont celui du super-admin — recevait un code 500 à sa première connexion. Corrigé, et le
  test échoue de nouveau si on remet le type d'avant.
- 876 tests dans le dépôt, dont 96 dans l'application qui lancent un vrai serveur.
- `docs/CONDITIONS.md` : ce que les organisations savent de l'accès de l'exploitant.

Étape 5 :

- **Un cinquième rôle de base, `jadwal_public`, en lecture seule** (ADR 0026). Il ne pose aucun
  contexte d'organisation et ne voit que les organisations **actives** et les cours **publiés** :
  « un brouillon est invisible » est une propriété de la base, pas une clause d'un `select`. Aucun
  droit sur les comptes, les adhésions, les invitations, les journaux ni les sessions. Sa seule
  écriture est le compteur de limitation de débit.
- **API publique** sous `/api/v1/`, décrite champ par champ dans `docs/API.md` : réglages
  d'affichage, programme sur une plage bornée, cours groupés par rythme, flux agenda, état.
  `ETag` et `304`, l'empreinte étant calculée sur les horodatages **et les comptes de lignes** —
  sans les comptes, une suppression laisserait le cache intact.
- **Pages publiques** en quatre langues (ADR 0027), la langue dans le chemin, liens croisés
  `hreflang`, contenu replié sur la langue source sans mention d'échec. Trois vues, une page par
  cours, une page d'abonnement au calendrier.
- **Aucun JavaScript** sur ces pages, et aucune ressource d'un autre domaine — police comprise :
  **10,0 Kio** pour une première visite de la vue Semaine, contre 50 visés.
- **Le cadre est ouvert pour `/m/**` et pour ces routes seules**, ce qui permet à une organisation
  d'intégrer sa page sans configuration de notre part. La page n'a ni cookie, ni session, ni action :
  il n'y a rien à détourner.
- **`docs/maquettes/`** : une description écran par écran, écrite **avant** le code. C'est la
  référence qui manquait à l'étape 4.
- **Rétention du registre interne à 24 mois**, portée par une politique, avec sa procédure du
  propriétaire.
- **Un durcissement de l'étape 3 défait sans le vouloir à l'étape 4, remis** : la boucle d'entretien
  avait rendu au propriétaire la lecture du journal d'audit, que la migration 0029 lui avait retirée.
  Le garde de la boucle est corrigé, et un test le tient.
- 929 tests dans le dépôt, dont 121 dans l'application qui lancent un vrai serveur.
- `docs/API.md` : le contrat public.

Étape 6 :

- **L'ADR 0005 est révisé : le widget ne redessine plus les trois vues, il pose un cadre qui affiche
  la page publique** et lui donne la hauteur de son contenu. Trois raisons, dans l'ordre : le
  **confinement** — injecter notre HTML dans la page d'une organisation le ferait tourner dans son
  origine, et une faute d'échappement chez nous deviendrait une injection chez elle ; une seule
  implémentation, donc aucune divergence possible avec `/m/<slug>` ; et le poids du fichier chargé
  sur le site de chaque organisation.
- **Le widget est écrit en TypeScript pur**, sans dépendance à l'exécution : **1,71 Kio gzip**
  mesurés à l'étape 6, contre 12,48 Kio pour le composant Svelte 5 **vide** de l'étape 0 (2 141
  octets à l'étape 18, après plusieurs ajouts ; l'anglais n'en ajoute que 61). Svelte n'apportait plus que son moteur, puisqu'il n'y a
  plus rien à rendre. `CLAUDE.md` et `docs/CADRAGE.md` sont corrigés.
- **Un seul script sur une page publique, et seulement dans un cadre.** `?embed=1` charge
  `/widget/embed.js` (1 856 octets, 1 009 en gzip). Il fait deux choses : annoncer la hauteur — mesurée
  sur la boîte de bordure de `<html>`, jamais `scrollHeight`, qui ne redescend jamais dans un cadre —
  et naviguer par **remplacement**, parce qu'une navigation ordinaire dans un cadre ajoute une entrée
  à l'historique du site de l'organisation, mesuré sur Chrome 153. La page **non** intégrée n'a toujours
  aucun script, et le test de l'étape 5 est resté tel quel.
- **Côté parent, trois vérifications et rien d'autre** : la fenêtre émettrice est celle du cadre,
  l'origine est exactement la sienne par égalité stricte, et la forme du message est la bonne. La
  hauteur est bornée, et ignorée en deçà de deux pixels. 25 tests l'éprouvaient à l'étape 6, dont
  neuf refus ; le widget en a 31 depuis l'étape 18.
- **Deux adresses pour le fichier** : `/widget/jadwal-widget.js`, mouvante, sans empreinte publiée ;
  et `/widget/<empreinte>/jadwal-widget.js`, immuable, avec son `integrity` et le `crossorigin` sans
  lequel l'empreinte bloquerait le script au lieu de le protéger. L'écran Partager affiche les deux,
  plus le cadre posé à la main pour un site qui refuse les scripts extérieurs.
- **Une page d'essai d'intégration**, `/widget/test`, qui imite le site d'une organisation et charge le
  widget dans six configurations — dont deux côte à côte, l'arabe en RTL, et des attributs absurdes.
- **Un flux agenda par cours** (ADR 0028), à son propre lien, construit par le **même**
  `buildCalendar` que celui de l'organisation. Le bouton de la page d'un cours pointe dessus en
  `webcal:` comme en `https:`, et la page d'abonnement explique les deux.
- **Un défaut de l'étape 5 trouvé en écrivant ce flux** : `buildAgenda` ne passait jamais les heures
  de prière au cœur, donc **aucun cours ancré ne figurait dans aucun flux agenda**, alors que
  `docs/API.md` promet le contraire. Corrigé, et un test échoue de nouveau si on le défait.
- **Référencement** (ADR 0029) : `robots.txt` qui autorise `/m/` et refuse le reste, un index de
  plans de site et un plan par organisation avec ses versions linguistiques, une adresse canonique
  par page — l'adresse **courte** pour la langue par défaut, parce que c'est elle qui est sur les
  affiches —, et `X-Robots-Tag: noindex` sur tout ce qui n'est pas une page.
- **Plage de dates** : 92 jours par défaut, jusqu'à 366 par le paramètre `maxDays`, refus au-delà
  avec un message qui dit la borne. Un paramètre plutôt qu'un relèvement de la borne, parce que
  `docs/API.md` est un contrat versionné et qu'un `400` sur une requête qui réussissait hier
  demanderait un `/api/v2/`.
- **Verrou de conservation** (ADR 0030) : une table `retention_hold`, posable par le seul
  propriétaire, qui suspend la purge du journal d'audit et du registre interne d'une organisation.
  Clé étrangère en `restrict` : une organisation sous verrou ne peut pas non plus être supprimée.
  Un script de relevé dit ce que chaque verrou retient.
- **Filtre par public sur un flux agenda : non**, et la question est fermée (ADR 0028).
- 978 tests dans le dépôt, dont 78 dans l'application qui lancent un vrai serveur, et 25 sur le
  widget lui-même.
- `docs/INTEGRATION.md` : la marche à suivre, écrite pour une personne responsable.
- Chaîne complète verte en CI : exécution `35543389374`, commit `9663f3d`.

Étape 7 :

- **Les heures de prière existent enfin** (ADR 0004 complété). Deux sources, une priorité écrite
  dans une clause `where` et non dans la discipline du code appelant : **un jour importé l'emporte
  toujours sur le calcul**. Toutes les heures servies viennent de `prayer_day`, lue par le
  `prayerTimes(date)` que le cœur attendait déjà.
- **Calcul avec `adhan` 4.4.6** (MIT, zéro dépendance, provenance SLSA), confiné à
  `packages/core/src/prayer/` par une règle ESLint. Vérifié contre **les jeux de référence
  d'`adhan` elle-même**, copiés depuis son dépôt au tag `v4.4.6` : Doha et Londres, à la minute.
- **Position saisie à la main**, en degrés décimaux : **aucun géocodage**, qui serait un service
  extérieur interrogé avec l'adresse d'une organisation. Méthode, école pour l'Asr, règle des
  latitudes hautes et ajustement par prière, avec un **aperçu à sept jours calculé sur les valeurs
  en cours de saisie**, avant enregistrement.
- **Le défaut de la règle des latitudes hautes est `middleofthenight`, et il est justifié par un
  calcul** : à 47,14° N, sur trois cent soixante-cinq jours, les trois règles donnent le même
  résultat — aucune ne mord. Le choix est donc de commodité, il appartient à l'organisation, et
  l'écran recommande `seventhofthenight` au-delà de 48°.
- **Import CSV avec aperçu obligatoire** : nombre de jours, première et dernière date, jours
  manquants, lignes refusées avec numéro et raison. **Rien n'est écrit avant confirmation**, et
  l'aperçu ne range rien côté serveur — la forme normalisée repart au navigateur et est entièrement
  revérifiée au retour. Ordre des prières et dérive d'un jour à l'autre sont **signalés, jamais
  refusés** ; le changement d'heure, qui décale les cinq prières le même jour, est reconnu et ne
  déclenche rien, alors qu'un saut d'une heure sur une seule prière est signalé.
- **Le format de calendrier de prière le plus répandu n'est pas inventé** : le lecteur accepte le
  format documenté (`docs/CALENDRIER-PRIERES.md`, avec un fichier d'exemple) et les tolérances
  qu'un tableur impose — marque d'ordre des octets, `;` ou tabulation, guillemets, UTF-16,
  Windows-1252, cinq écritures de l'heure, quatre des dates, et une colonne de lever du soleil
  reconnue pour être ignorée.
- **Fenêtre glissante de 401 jours**, remplie à chaque changement de réglage et par une tâche
  quotidienne idempotente (`prayer-fill`, ordonnancée à l'étape 8). Elle n'écrit que ce qui change :
  sans cela, une tâche de nuit ferait retélécharger son calendrier à tout le monde, chaque nuit.
- **La couleur d'accent est enfin affichée** (ADR 0031), ce qui était un manquement ouvert depuis
  l'étape 5. Elle ne sert que de **fond**, et le texte posé dessus est calculé noir ou blanc. Aucune
  couleur n'est refusée ni modifiée, parce qu'aucune n'en a besoin : pour les **16 777 216** couleurs
  sRGB, un test les parcourt une par une et vérifie que le meilleur des deux contrastes vaut au
  moins 4,58:1 — au-dessus des 4,5:1 du niveau AA.
- **Compteur de vues sans aucune donnée personnelle** (ADR 0032) : une organisation, un jour, un
  type, un nombre, dans une table qui n'a **aucune autre colonne** — pas même un `created_at`, qui
  dirait l'heure à laquelle une personne a lu la page. Un test envoie des requêtes dont chaque
  en-tête porte un marqueur, puis balaye **toutes les colonnes de toutes les tables** à leur
  recherche.
- **Un défaut de vie privée de l'étape 5, trouvé en écrivant `docs/CONDITIONS.md`** : la table du
  limiteur de débit portait des adresses électroniques **et des adresses IP en clair**, jamais
  effacées, alors que l'ADR 0009 affirmait le contraire. Les clés sont désormais condensées
  (HMAC-SHA256 salé par le secret de session), le limiteur intégré de Better Auth passe par notre
  implémentation, une politique borne la rétention à un jour, et une migration a effacé l'existant.
- **Une migration qui n'effaçait rien, trouvée en relisant la base après l'avoir appliquée** : le
  `DELETE` de nettoyage était muet, faute de politique de suppression qui le couvre — le « 0 ligne »
  sans explication contre lequel l'ADR 0019 met en garde. Elle passe maintenant par une politique
  temporaire et **vérifie** dans la même transaction que la table est vide.
- **Les versions publiées du widget ne disparaissent plus** (ADR 0005 précisé) : chaque construction
  archive son fichier, le serveur sert tout l'historique, et un test lit le dossier sur le disque
  pour exiger que chaque version réponde encore. `/widget/test` n'existe plus que si
  `JADWAL_WIDGET_TEST_ORG` est posé.
- 1 106 tests dans le dépôt, dont 215 de la base et 100 de l'application contre un vrai PostgreSQL ;
  ces cent-là lancent deux vrais serveurs construits, et leur parlent par HTTP.
- `docs/CALENDRIER-PRIERES.md`, ADR 0031 et 0032 ; ADR 0004, 0005 et 0009 complétés ;
  `docs/CONDITIONS.md` et `docs/INTEGRATION.md` mis à jour.
- Chaîne complète verte en CI : exécution `35548578163`, commit `3b0e976`.

Étape 8 :

- **Les heures réelles de l'organisation passent avant tout** (ADR 0004 complété). Une troisième source,
  la **saisie à la main**, s'ajoute à l'import et au calcul, et gagne sur les deux. Elle prend la
  forme d'une **période** : un nom, une date de début, une date de fin facultative — vide vaut
  « jusqu'à nouvel ordre » — et, pour chaque prière, l'heure affichée et l'heure d'iqama. C'est ce
  qu'une organisation imprime sur son panneau, et rien d'autre.
- **Deux périodes ne peuvent pas se chevaucher**, et ce n'est pas l'écran qui le vérifie : une
  contrainte d'exclusion de PostgreSQL sur `daterange(from_date, coalesce(to_date, 'infinity'))`,
  donc vraie quel que soit le chemin d'écriture. `btree_gist` est une extension _trusted_ : le
  propriétaire non privilégié peut la créer, ce qui a été mesuré avant d'écrire la migration.
- **La priorité est résolue à la lecture, en une seule requête**, et non matérialisée. La raison
  tient en une phrase : si une période écrasait les jours importés, supprimer la période ferait
  disparaître l'import pour toujours. Un test le vérifie dans tous les ordres, y compris un mois
  saisi au milieu d'une plage importée au milieu d'une fenêtre calculée.
- **L'iqama, séparée de l'heure du soleil.** Par prière, une heure fixe **ou** un décalage en
  minutes — jamais les deux, une contrainte l'interdit —, et les deux formes coexistent dans une même
  organisation. **Un cours ancré suit l'iqama quand elle existe**, l'heure du soleil sinon : c'est le
  moment où les gens sont dans la salle.
- **Une iqama fixe ne bouge pas au changement d'heure**, et le test le dit en toutes lettres pour que
  personne ne le « corrige » plus tard : le panneau d'une organisation ne change pas de lui-même.
- **La prière du vendredi existe** (ADR 0033), par le **même moteur que les cours** : un type sur
  l'objet existant plutôt qu'un second modèle. Récurrence, exceptions, pauses, traductions, flux
  agenda, cache et isolation fonctionnent sans une ligne réécrite ; un second modèle aurait dupliqué
  sept mécanismes pour une différence qui tient en trois colonnes.
- **Une, deux ou trois sessions**, chacune avec son rang, son heure fixe et ses **langues de sermon**
  — le mot change parce que la chose change. Un bloc en haut de la page publique, avant les vues ;
  leur place dans la vue Semaine ; leur groupe en tête de la vue Tous les cours ; leur écran distinct
  côté responsables. Maquettes écrites **avant** le code.
- **La Jumu'a remplace le Dhuhr, y compris pour ce qui en dépend** : le vendredi, l'iqama du Dhuhr
  devient l'heure de la **dernière** session, donc un cours « 30 min après Dhuhr » suit la Jumu'a au
  lieu de s'annoncer pendant la prière. L'heure du soleil, elle, n'est pas touchée : c'est un fait,
  et le fausser serait mentir.
- **Le rôle public n'a plus aucun droit sur le compteur de vues** (ADR 0032 révisé). L'incrément
  passe par une fonction `SECURITY DEFINER` du propriétaire ; un `select` du rôle public échoue
  désormais sur un droit absent, comme sur le journal d'audit. C'était la dernière question ouverte
  de l'étape 7, et elle est fermée.
- **Modèle CSV téléchargeable**, prérempli des soixante prochains jours avec les réglages en cours.
  Un test le relit avec **notre propre lecteur** et exige zéro ligne refusée et zéro avertissement :
  un modèle que notre importateur refuserait serait pire que pas de modèle.
- 1 158 tests dans le dépôt, dont 236 de la base et 118 de l'application contre un vrai PostgreSQL.
- ADR 0033 ; ADR 0004 et 0032 complétés ; `docs/CALENDRIER-PRIERES.md` réécrit pour une personne
  responsable ; `docs/maquettes/public-vendredi.md` et `responsables-vendredi.md` ; `docs/API.md`,
  `docs/INTEGRATION.md` et `docs/CADRAGE.md` mis à jour.
- Chaîne complète verte en CI : exécution `35553015049`, commit `97536a1`.

Étape 9 (phases 1 et 2 ; la phase 3, le déploiement, reste à jouer) :

- **L'adresse réelle du visiteur, corrigée.** `clientAddress()` lisait la **première** valeur de
  `X-Forwarded-For` depuis l'étape 5 : derrière un mandataire, n'importe qui pouvait choisir son seau
  de limitation de débit en l'écrivant lui-même. L'application délègue désormais à
  `event.getClientAddress()` d'adapter-node (`ADDRESS_HEADER` + `XFF_DEPTH=1`, donc la **dernière**
  valeur), et Better Auth reçoit ses mandataires de confiance par `JADWAL_TRUSTED_PROXIES`.
  `apps/web/tests/adresse.test.ts` joue le rôle du mandataire et prouve qu'une adresse inventée
  n'atteint jamais le seau.
- **Dupliquer une période pour l'année suivante** : mêmes mois et mêmes jours, un an plus tard —
  les heures de prière suivent le soleil, pas le calendrier hégirien. Deux périodes voisines restent
  jointives, 29 février compris : la date de fin est reportée par son lendemain, de sorte qu'une
  année bissextile ne laisse aucun jour à découvert et qu'une année commune ne crée aucun
  chevauchement. La période reste marquée « dates à vérifier » jusqu'à ce qu'un responsable
  l'enregistre une fois. L'écran des périodes ne montre plus que les cinq iqamas, les heures du
  soleil derrière un dépliant, et une nouvelle période part des valeurs de la précédente.
- **Un service de Voltia** : la mention est au pied des pages publiques dans les quatre langues, du
  widget, et des deux courriels, avec `Reply-To: contact@voltia.ch` — la boîte d'envoi n'est pas lue.
- **`Dockerfile`** : deux étages, images de base épinglées par digest, `pnpm deploy --prod`,
  `USER node`, système de fichiers en lecture seule. Vérifié par exécution réelle : `/healthz`,
  page publique, flux ICS et API rendent 200.
- **`infra/`** : Ansible (inventaire, playbook additif et réversible, cinq rôles, playbook de
  retrait, coffre `ansible-vault`), Compose de production, bloc de site Caddy, cinq minuteries
  systemd, sept scripts de tâches, et la mesure de charge.
- **Les huit tâches périodiques enfin programmées** : prières, six purges, sauvegarde, test de
  restauration, veille horaire. Un échec prévient par courriel avec le journal de l'unité ; une tâche
  qui cesse de se lancer est repérée par la veille au double de sa période.
- **Sauvegardes** : vidange chiffrée par `age` sur le tube, envoyée par `rclone`, relue depuis la
  destination. La clé privée n'est pas sur le serveur. Les deux modes de restauration ont été joués
  pour de vrai. **Depuis l'étape 9, le serveur n'efface plus rien à distance** : trois préfixes
  (`quotidien/`, `hebdo/`, `mensuel/`), trois verrous de conservation (7, 28, 180 jours) et un cycle
  de vie posés chez le stockage, hors d'atteinte de qui prendrait le serveur (ADR 0037). La rétention
  7/4/6, devenue 7/4/5 le 2026-09-23 pour tenir la promesse des sauvegardes (182 jours depuis
  l'étape 17), ne vaut plus que pour le disque local.
- **Supervision** : chaque tâche périodique bat vers un service de supervision extérieur, et c'est
  lui qui alerte quand un battement n'arrive pas. La sonde `/healthz` a quitté GitHub Actions, dont
  les machines n'ont pas d'IPv6 sortant : elle est devenue une minuterie de jadwal comme les autres,
  `jadwal-sonde@4` et `jadwal-sonde@6`, toutes les cinq minutes, par le nom public. Ce qu'elle ne
  voit pas est écrit dans l'ADR 0038 : elle tourne sur le serveur qu'elle interroge, donc un blocage
  qui ne toucherait que les visiteurs lui échappe. C'est le **silence** des battements qui couvre
  l'autre moitié.
- **Charge** : 20 organisations × 40 cours, saturation vers 50 req/s, zéro erreur de 1 à 100 clients
  simultanés ; 76 Mio au repos, 388 Mio sous charge.
- **Un défaut trouvé par l'exécution, invisible à la relecture** : les scripts de `packages/db`
  importaient `../src/env.ts`, et Node refuse de retirer les types sous `node_modules`. Migrations,
  rôles, prières et purges échouaient tous dans l'image de production. Ils importent désormais
  `@jadwal/db`.
- **Un contrôle de secrets qui refuse le commit.** `.githooks/pre-commit` passe ce qui est indexé à
  gitleaks avant chaque commit, et refuse quand il trouve. Il échoue fermé : sans l'outil, pas de
  commit, parce qu'un contrôle qui s'efface quand il manque ne contrôle rien. `pnpm hooks`
  l'installe — version épinglée **et** empreinte de l'archive vérifiée. Un crochet local se
  contourne d'un `--no-verify`, donc la CI le refait sur tout l'historique, et la tâche qui publie
  l'image attend ce contrôle autant que les tests. `pnpm secrets:test` le met à l'épreuve en tentant
  de commiter une fausse clé privée, et nettoie derrière lui.
- **L'attestation de provenance est coupée** (`provenance: false`, `sbom: false`). BuildKit y
  recopiait le payload complet de l'événement `push`, message de commit compris, dans un registre
  public. Le déploiement se fait par digest et s'est toujours fait ainsi : rien de ce qui comptait
  n'est perdu. Addendum à l'ADR 0010.
- **Rien de propre à une machine n'est livré** : `infra/ansible/inventory.ini` est remplacé par son
  modèle, et le coffre `ansible-vault` n'est ni dans le dépôt, ni destiné à y entrer.
- 1 163 tests dans le dépôt. ADR 0034 (`docs/adr/0034-isolation-du-deploiement.md` : isolation du
  déploiement), 0035, 0036 ; `docs/EXPLOITATION.md` ; `docs/CONDITIONS.md` complété (hébergeur,
  pays réel, sous-traitants, `contact@voltia.ch`).
- **Le journal d'accès ne porte plus ni adresse entière ni jeton** (ADR 0039). Le bloc de site
  tronque l'adresse du visiteur en /24 et /48 partout où elle paraît, retire le jeton de connexion
  de l'adresse demandée comme de l'en-tête `Referer`, et une tâche de nuit borne la rétention à
  quatorze jours, fichier courant compris. `pnpm caddy:test` rejoue ce bloc dans un conteneur avec
  une requête porteuse de quatre secrets et relit la ligne écrite.

Étape 12 :

- **Le conteneur de l'application ne porte plus les deux mots de passe privilégiés** (ADR 0040) :
  ni celui du superutilisateur de PostgreSQL, ni celui du propriétaire du schéma. Un service Compose
  `init`, de la même image, les reçoit, crée les rôles, passe les migrations et **s'arrête** ;
  `depends_on: { init: { condition: service_completed_successfully } }` fait que l'application ne
  démarre pas avant. C'est une propriété du fichier Compose, donc elle tient aussi quand quelqu'un
  tape `docker compose up` à la main. Les trois tâches qui écrivaient sous le propriétaire —
  prières, purges, et la lecture des verrous par la veille — passent par ce même service.
- **`/healthz` n'est plus journalisé** (ADR 0039 complété). La sonde de l'ADR 0038 interroge cette
  adresse toutes les cinq minutes sur les deux piles : 576 lignes par jour, majoritaires sur
  quatorze jours dans un journal qu'on lit justement pour le reste. `log_skip` demande Caddy 2.8.0
  ou plus — le rôle Ansible relève la version et **refuse de poser le bloc** en deçà, parce qu'une
  version plus ancienne ne saute pas la directive inconnue : elle refuse le Caddyfile entier, donc
  tous les sites de la machine.
- **Une commande d'exploitant retire toutes les passkeys d'un compte**
  (`packages/db/scripts/reset-passkeys.mjs`). Elle fait deux choses, et la seconde compte autant que
  la première : elle efface les passkeys, **et** elle remet à zéro la marque qui porte les pouvoirs
  sur les sessions ouvertes. Les pouvoirs ne viennent pas de la table des passkeys mais de
  `session.passkey_verified_at` : sans ce second geste, une session les garderait douze heures après
  la remise à zéro.
- **Un contrôle de la veille se taisait quand il ne pouvait pas contrôler.** Le relevé des verrous de
  conservation se terminait par `|| true` : une commande en échec rendait une sortie vide, la sortie
  vide voulait dire « rien à signaler », et la veille affirmait pour toujours qu'aucun verrou ne
  traîne sans jamais avoir regardé. Trouvé en écrivant le test qui lance le script entier.
- 1 230 tests dans le dépôt, plus trois commandes d'épreuve en conteneur (`pnpm env:test`,
  `pnpm veille:test`, `pnpm caddy:test`). ADR 0040 ; `docs/SECURITE.md`, `docs/EXPLOITATION.md` et
  `infra/compose/.env.example` mis à jour.

Étape 16 :

- **Les conditions sont en ligne et acceptées** (ADR 0044). `/conditions` rend `docs/CONDITIONS.md`,
  lu à la construction et mis en mots par le même module que le PDF du juriste
  (`apps/web/src/lib/conditions/rendu.js`) : ce qu'il lit est, au caractère près, ce que les
  organisations acceptent. À l'entrée dans l'espace d'une organisation, chaque personne, éditeurs
  compris, accepte d'un clic la version en cours ; la base garde qui, quelle version et quand, pose
  le moment elle-même, et efface l'acceptation avec l'adhésion. Une nouvelle date du texte
  redemande l'accord de chacun. Le super-admin n'y passe jamais.
- **L'arabe relu par le chef de projet est corrigé**, les treize points un par un, chacun avec un
  test montré en échec : jours d'une lettre, accord du nom compté par `Intl.PluralRules('ar')`,
  rangs du mois, « و » collé et répété, chiffres latins partout. Le correcteur lit désormais le
  widget, `affichage.ts` et `agenda.ts`, chaque chaîne dans sa langue, et **les huit documents de la
  racine de `docs/`, qu'il n'avait jamais lus**.
- **Le parcours complet passe dans un vrai navigateur** : `pnpm parcours:test`, 116 vérifications
  contre l'image de production, de la passkey du super-admin au cours ancré sur une prière, en
  passant par l'acceptation, le widget sur une autre origine et le flux agenda, avec axe sur
  27 pages : rien de sérieux ni de critique. `playwright-core` et `axe-core` en dépendances de
  développement.
- **Trouvé et corrigé en chemin**, chaque fois test d'abord : une éditrice pouvait rattacher
  n'importe quel compte à son organisation puis lire son courriel (migration 0053) ; le super-admin
  entré dans une organisation lisait les réglages d'une autre ; une invitation expirée retenait un
  compte au-delà des douze mois promis (migration 0054) ; les sauvegardes locales gardaient une
  donnée effacée 184 jours et le journal technique une ligne seize jours, au-delà des 181 et
  quatorze jours promis ; un décalage négatif s'écrivait « -15 min après » ; `<html lang>` disait
  `fr` sur une page arabe ; un test tombait un mercredi sur deux.
- **Une commande d'exploitant supprime une organisation**, aperçu d'abord
  (`packages/db/scripts/delete-organization.mjs`) : les conditions le promettaient, rien ne le
  faisait.
- **Le PDF du juriste** : liste des données personnelles suivie de 1 à 10, plus aucune ligne seule
  (le contrôle lisait les pages à l'envers), point 10 sur l'acceptation. Version du 23 septembre 2026.
- 1 417 tests dans le dépôt, tous réussis, aucun sauté. ADR 0044 ; addendum à l'ADR 0013 ; ADR
  0035, 0037 et 0039 révisées.

Étape 17 :

- **182 jours au plus**, partout : conditions, page de garde du PDF, documentation, commande de
  suppression. Le stockage peut mettre un jour à effacer une sauvegarde échue, et le texte en tient
  compte. Le texte change, donc sa date aussi : version du 25 septembre 2026, que chacun accepte de
  nouveau. **La tâche de nuit le vérifie** (`infra/sauvegarde/ages.mjs`) : tout objet distant plus
  vieux que 9 jours sous `quotidien/`, 30 sous `hebdo/` ou 182 sous `mensuel/` fait échouer la
  tâche, et l'alerte part. L'âge se compte depuis le dépôt, ou depuis l'heure écrite dans le nom
  quand le dépôt a plus d'une heure de retard sur elle : une archive recopiée ne repart pas de
  zéro. La liste doit montrer ce que la nuit vient d'envoyer, et elle ne lit aucune date objet par
  objet, parce que rclone met l'heure présente quand cette lecture échoue. `pnpm sauvegarde:test`
  joue le script entier avec rclone 1.60.1 et 1.75.1, neuf passages chacun, dont quatre contre un
  faux stockage S3.
- **Le parcours complet entre dans la CI**, dans son propre flux (`parcours.yml`), **et garde le
  déploiement** (ADR 0045) : le playbook lit la révision de l'image dans le registre et demande à
  GitHub une exécution verte de ce flux pour ce commit, avant toute connexion au serveur. Une
  dérogation doit nommer son image. Ni une sélection de tâches ni une variable posée à la main
  n'écrit une image que la garde n'a pas passée : `pnpm garde:test`, 52 cas.
- **Les questions de l'étape 16 sont réglées** : les liens qui ouvrent un nouvel onglet l'annoncent
  aux lecteurs d'écran, dans les quatre langues ; « Changer d'organisation » est dans la navigation
  de toute personne membre de plusieurs organisations, ou qu'une invitation attend ; le flux agenda
  dit « Après Maghrib » au décalage nul, comme la page ; HSTS à deux ans dans l'application ;
  compression zstd et gzip dans le bloc de site ; le 404 de `/m/…` parle la langue demandée, sans
  script ; la lecture des
  organisations du super-admin est bornée au contexte quand il en a un (migration 0055) ; le
  `TRUNCATE` du propriétaire est écrit comme limite (ADR 0019). « على iPhone و iPad » reste tel quel,
  et le DMARC reste sans adresse `rua`, par décision. La preuve d'acceptation attend l'avis du
  juriste.
- **Les invitations, tenues par la base** : quatorze jours au plus, comptés à l'horloge, par la
  migration 0056 ; une invitation échue ne s'accepte plus, même par un appel direct, par la 0057 ;
  l'adhésion porte le rôle de l'invitation, une invitation ne sert qu'une fois, et ses passages de
  statut sont fixés, super-admin compris, par la 0058.
- **Trouvé par le parcours et les relectures adverses, et corrigé**, chaque fois test d'abord : le
  rôle lu sans filtre d'organisation (une éditrice traitée en responsable) ; le nom d'une
  organisation qui invite prêté à celle de la session ; les membres et les invitations d'une autre
  organisation dans l'écran Membres, et l'annulation d'une invitation d'une autre organisation ; le
  super-admin membre d'une seule organisation qui ne pouvait pas en visiter une autre ; une
  réinvitation qui ne créait rien quand l'ancienne invitation avait échu ; une invitation annulée ou
  consommée qui resservait ; « à Maghrib » dans la liste des cours.
- **Le PDF du juriste**, version du 25 septembre 2026, avec 182 jours au point 5.
- 1 581 tests dans le dépôt, tous réussis, aucun sauté. Parcours complet : 139 vérifications, axe
  sur 29 pages, rien de sérieux. ADR 0045 ; addenda aux ADR 0017, 0019 et 0025 ; ADR 0035, 0037 et
  0044 révisées.

Étape 18 (livrée dans la nuit du 26 au 27.09.2026, en sept lots) :

Les retours des tests du chef de projet, lettre par lettre. Une règle les réunit : une personne qui
ne connaît rien au service doit tout comprendre seule, sans aide.

- **Les dates (A3).** `JJ.MM.AAAA` partout où une personne lit une date, dans les cinq langues :
  écrans, courriels, messages prêts à coller, page publique. Deux fonctions seulement les écrivent,
  `numericDate` et `longDate` (`apps/web/src/lib/i18n.ts`), et le nom du jour peut précéder la
  date : « samedi 26.09.2026 ». Aucune date `2026-09-26` ne reste dans le texte d'un écran. L'API et
  les flux gardent `AAAA-MM-JJ`, qui est un format d'échange.
- **À venir (A1, A2).** Les options d'une séance étaient toutes ouvertes au chargement, et le bouton
  d'annulation actif sans rien ouvrir. Elles sont maintenant dans un repli fermé, propre à chaque
  carte, avec ou sans JavaScript, et le bouton d'annulation n'existe que derrière lui. Une séance se
  déplace à n'importe quelle date à partir d'aujourd'hui, plus tôt ou plus tard que prévu, et non
  plus aux six jours qui suivent. Sont refusés avec une phrase, sans rien écrire : une date passée ;
  une date ou une heure illisible, qui faisait une erreur 500 ; un déplacement qui ne change rien ;
  une carte restée ouverte (touche Retour, autre onglet, autre personne) sur une séance annulée ou
  déplacée depuis ; une carte dont l'heure a changé depuis l'ouverture de la page. Deux
  déplacements envoyés au même instant n'en écrivent qu'un. Un déplacement le même jour se dit
  comme un changement d'heure : `nouvelle heure` sur la carte, « commence à 20:30 au lieu de
  19:00 » dans le message, `(nouvelle heure)` dans le programme de la semaine, `Déplacé à 20:30`
  puis `Initialement à 19:00` sur la page publique, page d'un cours comprise. L'écran
  `Prière du vendredi` suit la même règle : une page restée ouverte y défaisait un changement fait
  ailleurs. L'ADR 0021, révisé, dit la règle des dates : toute date à partir d'aujourd'hui, plus tôt
  ou plus tard que la date prévue.
- **La clarté (B1).** Chaque écran de l'espace et du super-admin dit ce qu'il fait ; chaque champ a
  un libellé clair, une aide et un exemple ; chaque geste dit ce qu'il a fait ; chaque erreur dit
  quoi faire. « Module », « IANA », « widget », « iframe » et « identifiant d'URL » ont quitté les
  écrans. La navigation porte le titre des écrans : `Prière du vendredi`, `Heures de prière`. Chaque
  écran a maintenant sa description dans `docs/maquettes/`, écrite d'après le code.
- **Le super-admin (B2).** L'adresse de la page publique est proposée à partir du nom, et montrée en
  entier, dans la liste comme à la création ; le fuseau se choisit dans une liste de noms canoniques,
  sans alias, et une phrase dit quoi choisir pour une ville absente ; une adresse déjà prise est
  dite à l'écran, au lieu d'une erreur 500 ; les plans et les états s'écrivent en mots, avec deux
  boutons distincts ; le lien de secours dit ce qu'il fait ; la date d'une passkey est le jour en
  Suisse, et chaque nouvelle passkey porte le nom de son système et son jour, « Windows,
  26.09.2026 », au lieu de « Cet appareil ».
- **Les rôles (H1, B3).** La base elle-même refuse à un éditeur ce que l'écran réserve au
  responsable : lire et écrire les invitations, changer un rôle, retirer un membre, modifier les
  réglages, les salles et les heures de prière. Une fonction à droits du définisseur le dit,
  `jadwal.is_org_admin()` (migration 0059, ADR 0046). Le rôle applicatif ne modifie plus le plan,
  l'état ni l'identifiant d'URL d'une organisation. L'écran Membres dit, sous le choix du rôle, ce
  que chaque rôle permet ; un test lie ce texte aux politiques de la base. Il ne promet plus à
  l'éditeur de supprimer un cours, qu'aucun écran ne propose, et il dit ce que chaque geste a fait.
  Une responsable qui se donne le rôle d'éditeur arrive sur `À venir`, avec un encadré qui le lui
  dit. Le fuseau de l'écran Réglages est la même liste que celle du super-admin.
- **Le formulaire d'un cours (B4).** Un résumé de ce qui sera publié, une ligne par information,
  description comprise ; ce qui manque est marqué et dit, et ce que le serveur refuserait est marqué
  « à corriger ». Il est juste sans JavaScript, et suit la saisie avec. Sont refusés, au lieu de
  disparaître en silence : un cours sans langue d'enseignement, des dates précises hors de la
  période, une description sans titre dans sa langue. Après un refus, avec JavaScript, la page
  revient sur l'onglet de la langue en cause. Chaque champ porte la langue et le sens de son texte,
  toutes les langues se voient sans JavaScript, le rythme mensuel demande le jour puis son rang dans
  le mois, et l'italien dit « la domenica ».
- **Les heures de prière (C1, C2).** L'écran pose une question, « D'où viennent vos heures de
  prière ? », avec trois réponses ; chacune montre ses champs, l'aperçu des sept prochains jours,
  puis « Enregistrer ». Une période se prévisualise avant d'être enregistrée. La « source que vous
  déclarez » a disparu. La localité se choisit par son nom ou son NPA, canton compris pour deux noms
  pareils, dans le répertoire officiel des localités de swisstopo, embarqué dans le serveur : 4 073
  localités, version du 01.09.2026, licence vérifiée avant de l'embarquer, positions converties de
  la projection suisse par les formules de swisstopo, et aucun service extérieur. La source est
  citée dans le fichier, dans l'image et à l'écran (ADR 0043, addendum). `Zuerich` trouve Zürich ;
  l'écran arabe dit de taper le nom en lettres latines. Hors de Suisse, une dernière case de la
  liste, « Hors de Suisse », fait passer d'une localité enregistrée à une position tapée, avec ou
  sans JavaScript, et les replis restent ouverts pendant la frappe.
- **Un cours avant une prière (C3).** « Avant une prière », de 1 à 120 minutes ; « après », de 0
  à 240. La base garde le décalage négatif qu'elle connaissait, sans migration (ADR 0004,
  addendum).
- **L'onglet Prières (C4).** Sur la page publique, quand le module est allumé : les heures du jour
  et des sept prochains jours, adhan et iqama, puis les sessions du vendredi avec la langue de leur
  sermon. Chaque jour daté dit ce qui a lieu ce jour-là : une session annulée y est barrée, comme
  dans la vue Semaine. Il apparaît dans le widget sans que le fichier du widget change (ADR 0042,
  addendum).
- **Les langues (D1, D2, D4).** L'anglais britannique est la cinquième langue du public, du widget
  et du flux agenda, et le widget a publié une nouvelle version pour lui. L'espace des responsables
  et le super-admin parlent les cinq langues, un dictionnaire par écran, l'arabe de droite à gauche,
  en chiffres latins (ADR 0007, addendum). Au premier passage, l'écran prend la langue du
  navigateur, sinon le français. La langue se choisit en haut de chaque écran, sans JavaScript, et
  reste attachée au compte (migration 0060). Un choix fait avant la connexion part avec le lien de
  connexion, même demandé des jours plus tard, et devient la langue du compte, même quand le lien
  s'ouvre dans un autre navigateur (ADR 0047). Les messages prêts à coller s'écrivent dans chaque
  langue que l'organisation publie ; une session du vendredi qui porte le nom proposé par le service
  se lit partout dans la langue du lecteur, et s'écrit dans la langue par défaut de l'organisation.
  Les conditions restent en français ; dans les autres langues, une phrase le dit. La base limite
  les langues d'une organisation aux cinq (migration 0062), et l'écran des réglages propose enfin
  l'anglais.
- **Les courriels (D3).** Le lien de connexion et l'invitation parlent les cinq langues, dans la
  langue de l'écran où le geste est fait. **Point d'arrêt** : une invitation part dans la langue de
  la personne qui invite, que l'adresse ait un compte ou non. Trois raisons (ADR 0017, addendum) :
  l'envoi n'est pas découplé de la réponse ; lire la langue du compte destinataire, c'est chercher
  un compte par son adresse, ce que l'ADR 0017 interdit ; le rôle applicatif ne voit pas le compte
  d'une personne qui n'est pas membre. La question est posée plus bas.
- **Le correcteur (D5).** `pnpm orthographe` relit l'anglais britannique, chaque dictionnaire de
  l'espace et chaque courriel dans sa langue, l'arabe pour l'orthographe et la ponctuation
  seulement. Les textes arabes, allemands et italiens écrits à cette étape attendent la relecture
  d'un locuteur (plus bas).
- **L'agenda selon l'appareil (E1, E2, E3).** La page d'abonnement et la page d'un cours proposent
  d'abord ce que l'appareil sait ouvrir : `webcal:` sur iPhone, iPad et Mac, Google Agenda sur
  Android, le choix complet ailleurs, avec toujours un lien vers le choix complet. Le serveur lit
  `Sec-CH-UA-Platform`, sinon `User-Agent`, et la réponse porte `Vary` sur ces en-têtes ; la page
  reste sans script (ADR 0048). Sur Android, la page dit ce que fait le bouton, puis, si Google
  Agenda ne propose rien, le passage par un ordinateur, avec les libellés de Google ; pour un seul
  cours, un lien `Page du cours`, juste sous son nom, donne l'adresse de ce cours. Les délais de
  Google (jusqu'à 24 heures) et d'Outlook (plus de 24 heures) sont dits dans les cinq langues. Les
  étapes d'un essai sur un vrai téléphone Android sont écrites pour le matériel de test ; l'essai
  reste à faire.
- **Les conditions (F1 à F3).** Voltia seul, comme exploitant et comme titulaire du droit d'auteur :
  le nom de la personne a quitté les fichiers du dépôt ; l'historique de git le garde. Une onzième
  question pour le juriste : « Voltia » seul suffit-il ? Nouvelle version, du 26.09.2026, que
  chacun accepte de nouveau, sa date écrite comme partout ; le PDF du juriste la suit.
- **L'acceptation (H2).** `Choisir une autre organisation` s'affiche aussi pour une personne d'une
  seule organisation qu'une invitation attend encore.
- **Le bloc de site (H3, H4).** Le navigateur reçoit la page et le widget en `gzip`, que le bloc
  préfère désormais à `zstd`, et aucune réponse de l'application relayée par Caddy ne porte plus
  `Via`. Les réponses 502 et 504 que Caddy écrit lui-même gardent `Server: Caddy` et n'ont pas de
  HSTS : c'est écrit dans le bloc et dans `docs/EXPLOITATION.md`. `pnpm caddy:test` le vérifie,
  74 vérifications, en Caddy 2.11.4 comme en 2.8.0.
- **Le parcours dans la CI (H5).** `queue: max` reste sur le flux `parcours` : chaque commit garde
  son verdict.
- **Le parcours automatique.** Chaque retour a au moins une vérification : 269 vérifications, dont
  150 pour les retours, et axe sur 37 pages, sans rien de sérieux, sur le commit livré. Rejoué
  contre l'image de l'étape 17, il fait tomber 87 des 88 vérifications de retours qui peuvent y
  jouer ; les 62 autres visent des gestes que l'ancienne image n'offre pas.
  Ce qui ne tourne que dans un navigateur y est éprouvé : la liste des localités pendant la frappe,
  la seconde passkey, les passages sans JavaScript. La garde du déploiement exige de toute façon un
  parcours vert pour le commit déployé (ADR 0045).
- **Le serveur (G).** Les retours sur la machine de l'exploitant se jouent sur elle, et ne sont pas
  décrits dans ce dépôt.
- **Trouvé en chemin et corrigé**, chaque fois test d'abord : supprimer une salle qu'un cours occupe
  rendait une erreur 500 (la clé composite vidait aussi l'organisation du cours) ; la base ne vide
  plus que la salle (migration 0061), et l'écran demande d'abord confirmation. Le retour du choix
  de la langue pouvait quitter le service par un segment en point (`/.//ailleurs`). Un
  `GET /langue` rendait une erreur en anglais, en texte brut. Un jour impossible tapé dans
  l'adresse de la vue Mois était recopié dans la page. La vue Tous les cours comptait une séance
  déplacée à son ancienne date. La liste des langues d'une page publique s'annonçait « Langues » aux
  lecteurs d'écran, en français, dans toutes les langues. Un test du vendredi tombait tous les
  samedis. Le contrôle du catalogue ignorait les clés qui vident une colonne obligatoire par
  `SET DEFAULT`. Une session du vendredi supprimée entre-temps, et un identifiant d'organisation mal
  formé envoyé au choix de l'organisation, donnaient une erreur 500 : ils reçoivent une phrase.
- **La licence.** MIT pour tout le dépôt, sauf la liste des localités, qui reste sous les
  conditions de swisstopo et se cite « Source : Office fédéral de topographie swisstopo ». Le
  `package.json` d'`apps/web` et l'étiquette de l'image disent `MIT AND LicenseRef-swisstopo-OGD`,
  et l'épreuve de l'image le vérifie.
- 3 293 tests dans le dépôt, mesurés le 27.09.2026 sur le commit livré, tous réussis, aucun sauté :
  676 dans `core`, 442 dans la base, 82 pour les sauvegardes, 2 062 dans l'application, 31 pour le
  widget (2 141 octets en gzip).
- ADR 0046 (rôles dans la base), 0047 (langue de l'espace), 0048 (agenda selon l'appareil) ;
  addenda aux ADR 0004, 0007, 0013, 0017, 0025, 0027, 0042 et 0043 ; ADR 0005, 0021 et 0044
  révisés. Descriptions écran par écran de l'espace et du super-admin dans `docs/maquettes/` ;
  `docs/CADRAGE.md`, `docs/SECURITE.md`, `docs/INTEGRATION.md`, `docs/CALENDRIER-PRIERES.md`,
  `docs/API.md`, `docs/EXPLOITATION.md` et le `README` mis à jour.

Étape 19 (zéro défaut connu, l'arabe relu, le nom hors de l'historique) :

- **L'historique public est réécrit.** Un nom de personne restait dans les commits publiés avant
  l'étape 18 ; il est retiré de tout l'historique, fichiers et messages, avec son empreinte et le nom
  d'une ville, par `git filter-repo`, puis poussé en force sur `main`. Chaque commit réécrit ne
  diffère de l'ancien que par les lignes visées, vérifié paire par paire, et le dernier état n'a pas
  changé. Le garde-fou cherche désormais ces termes dans tout l'historique, sans exception. Le
  paquet d'images ne garde que des versions construites depuis le nouvel historique.
- **L'arabe relu par le chef de projet** : onze formulations corrigées, chacune tenue par un test
  montré en échec d'abord ; l'exemple de nom du super-admin est neutre dans les cinq langues
  (« Association Horizon », « جمعية الأفق »), comme tous les exemples hors du module de prière.
- **La base** : le journal refuse une entrée dont l'auteur n'est pas la personne connectée,
  super-admin compris (migrations 0063 et 0071) ; un éditeur ne lit plus ni la liste des membres ni
  le journal, même par un appel direct (0064, 0070) ; la suppression d'un cours est réservée au
  responsable (0065), et le type d'une ligne ne change plus, pour qu'un cours ne se supprime pas
  déguisé en session du vendredi (0069) ; chacun peut quitter une organisation, sauf le dernier
  responsable (0066) ; l'état « archivé » et `prayer_settings.source` disparaissent (0067, 0068).
  Un défaut ancien est réparé : la mise à jour de données de la migration 0050 n'avait pu rien
  faire sur une base déjà peuplée, faute du drapeau d'entretien (0072). Tests d'attaque sur base
  jetable pour chacune.
- **À venir et le vendredi** : un brouillon ne sort plus dans le programme de la semaine, et sa
  carte le dit ; une date exceptionnelle a « Rétablir », qui envoie le changement qu'il montrait ;
  le refus d'une carte périmée nomme la séance ; le second responsable qui annule la même séance
  reçoit le message à coller ; la prière du vendredi a ses propres mots dans les messages ; la
  langue du sermon se choisit parmi les huit langues d'enseignement ; un jour passé, une session
  inconnue, une date sans séance et un identifiant illisible reçoivent chacun une phrase, jamais
  une erreur 500.
- **Les cours** : « Supprimer ce cours », derrière une confirmation, pour le responsable seul ; la
  langue de saisie cochée d'office ; « facultatif » en discret ; le premier jour pris à la première
  date ; les dates hors période marquées dans la liste ; le message « nouveau cours » prêt à coller
  après la publication ; une séance annulée barrée sur la page publique d'un cours ; sans
  JavaScript, le formulaire ne bloque plus un cours placé par rapport à une prière.
- **Les prières et le super-admin** : les titres de l'aperçu dans l'ordre ; « Hors de Suisse »
  coché tout seul ; une phrase pour une période passée ; le suffixe d'une copie gardé ; sans
  JavaScript, l'adresse proposée se montre et se confirme avant la création, une adresse sans
  lettre est refusée, et un nom sans lettres latines demande de la taper.
- **Membres et invitations** : l'invitation part dans la langue que choisit qui invite, sans
  aucune recherche de compte (ADR 0017) ; retirer un membre et changer un rôle demandent une
  confirmation ; « Quitter l'organisation » dans « Vos organisations » ; une salle inconnue « n'existe
  plus » ; l'adresse d'arrivée d'un lien de connexion ne porte plus `?language=`.
- **La page publique et l'agenda** : l'élision française devant un nom qui commence par une
  voyelle ; l'italien sans article devant un jour ; « Outlook (travail ou école) » ; sur Android,
  « ouvrez cette page sur un ordinateur », avec son adresse ; la phrase des 24 heures de Google
  remplacée par celle de la dernière minute (celle d'Outlook reste, Microsoft donnant ce délai) ;
  « Annulée » pour la prière du vendredi ; `og:locale` avec le pays ; une langue non publiée
  redirige, et le 404 parle la langue de l'organisation ; le widget accepte `view="prieres"`.
- **Les outils** : l'épreuve du PDF lit le nom de l'exploitant partout ; le générateur des
  localités refuse une date impossible ; l'image ne porte plus aucune carte de sources ni la liste
  des localités deux fois ; les tests liés au temps tournent à part (`pnpm test:temps`), leurs
  marges tirées d'une mesure ; une horloge figée pour les tests qui lisent le jour
  (`scripts/horloge-figee.mjs`) ; le bloc de site sans ses deux `header_up`, Caddy 2.10.0 au
  minimum ; plus de CLA : les contributions arrivent sous la licence MIT.
- **Le parcours automatique** : chaque correction de l'étape 19 qui se voit à l'écran a sa
  vérification, rangée sous un identifiant de l'étape (55 identifiants, 92 vérifications). Rejoué
  contre l'image de l'étape 18, il fait tomber les 83 qui peuvent y jouer, sans une seule verte ;
  10 gestes y sont impossibles, parce que leur écran n'existe pas encore. Il compte lui-même les
  vérifications jamais jouées, contre un catalogue de 241 libellés ; chaque vérification à
  plusieurs conditions nomme celle qui tombe ; et l'horloge du serveur part de l'instant du
  passage, dont toutes les dates attendues sont tirées (D9).
- 3 748 tests dans le dépôt, mesurés par la CI le 28.09.2026 sur le commit livré, tous réussis,
  aucun sauté : 678 dans `core`, 474 dans la base, 82 pour les sauvegardes, 2 482 dans
  l'application, 32 pour le widget (2 145 octets en gzip) ; et 22 tests liés au temps, à part
  (`pnpm test:temps`). Parcours complet : 381 vérifications, dont 152 pour les retours de
  l'étape 18 et 92 pour les corrections de l'étape 19, axe sans rien de sérieux sur 38 pages.
- Migrations 0063 à 0072 ; addenda aux ADR 0001, 0004, 0005, 0013, 0015, 0017, 0019, 0021, 0025,
  0026, 0027, 0028, 0033, 0042, 0043, 0046, 0047 et 0048 ; `docs/CADRAGE.md`, `docs/SECURITE.md`,
  `docs/INTEGRATION.md`, `docs/CALENDRIER-PRIERES.md`, `docs/API.md`, `docs/EXPLOITATION.md`, le
  `README`, `CONTRIBUTING.md` et les descriptions des écrans touchés dans `docs/maquettes/` mis à
  jour.

**Un script ou une commande qu'aucun test ne _lance_ n'est pas éprouvé.** C'est la règle du dépôt
depuis l'étape 12, et elle répond à la question laissée ouverte à l'étape 11.

Chaque script et chaque commande a au moins un test qui **le lance comme en production** : en
sous-processus, avec ses vrais arguments, et l'on vérifie son **effet** — en base, sur le disque, sur
la sortie — jamais seulement son code de retour. Appeler une fonction exportée depuis un test ne
compte pas.

Elle vient d'un fait : à l'étape 11, `super-admin.mjs` passait sept tests et **ne s'exécutait pas**.
Sept tests qui appelaient la fonction, aucun qui lançait le fichier ; la garde `isMainModule`
rendait faux, le script se contentait d'être importé, et il sortait en 0. Le même motif s'est répété
à l'étape 12 : c'est le test qui lance `jadwal-veille.sh` en entier qui a montré qu'un de ses
contrôles se taisait quand il échouait.

Pour ce qui ne tourne que sur un serveur — `systemctl`, `docker`, `curl` —, le script est lancé dans
un conteneur avec des **doublures** pour ces commandes-là et de vrais fichiers pour le reste. Ce
n'est pas la production, mais c'est le script, vraiment exécuté, du début à la fin.

**Les scripts bash ne reçoivent pas de campagne de tests**, et c'est une décision, pas un oubli.
Écrire un cadre de tests pour du shell coûterait plus qu'il ne rendrait sur neuf scripts dont
l'essentiel du travail est fait par les programmes qu'ils appellent. La règle est autre : **chaque
script modifié est éprouvé dans un conteneur**, avec sa vraie entrée et sa vraie sortie, et la
sortie est copiée dans le rapport de l'étape. Ce qui mérite d'être éprouvé pour de bon sort du
shell — la règle de rétention et celle des destinations vivent dans `@jadwal/sauvegarde`, avec leurs
tests.

## Feuille de route

| Étape | Contenu                                                             | État     |
| ----- | ------------------------------------------------------------------- | -------- |
| 0     | Dépôt, licences, docs, CI                                           | terminée |
| 1     | `core` et ses tests                                                 | terminée |
| 2     | Base, RLS, données de démo                                          | terminée |
| 3     | Connexion, organisations, rôles, invitations, super-admin, journal  | terminée |
| 4     | Espace des responsables, fidèle à la maquette                       | terminée |
| 5     | API publique, page publique en 4 langues, flux ICS                  | terminée |
| 6     | Widget, flux agenda par cours, référencement                        | terminée |
| 7     | Heures de prière, couleur d'accent, compteur de vues                | terminée |
| 8     | Heures réelles de l'organisation, iqama, prière du vendredi         | terminée |
| 9     | Finitions, infrastructure en code, mise en production               | terminée |
| 10    | Mise en ligne : déploiement réel, sauvegarde et déchiffrement       | terminée |
| 11    | Courriel, fausses alertes, IPv6, premier compte super-admin         | terminée |
| 12    | Caddy à jour, conteneur de démarrage, finitions                     | terminée |
| 13    | Organisations de tout genre, conditions exactes, serveur            | terminée |
| 14    | Licence MIT, correcteur en quatre langues, PDF pour le juriste      | terminée |
| 15    | Conditions exactes au mot près, relevé de l'arabe                   | terminée |
| 16    | Conditions en ligne et acceptées, arabe corrigé, parcours complet   | terminée |
| 17    | 182 jours vérifiés, garde du déploiement, invitations tenues        | terminée |
| 18    | Retours des tests : cinq langues, écrans clairs, rôles dans la base | terminée |
| 19    | Zéro défaut connu, arabe relu, historique réécrit                   | livrée   |

Plus tard : pré-traduction automatique validée par le responsable, image « story » du programme,
passkeys, paiement.

## Risques ouverts

- Les alias de fuseau IANA sont refusés à la saisie depuis l'étape 2 : 26 noms européens, dont
  `Europe/Amsterdam`, `Europe/Oslo` et `Europe/Stockholm`, redirigent vers le fuseau d'un autre
  pays. Tranché à l'étape 18 : la console du super-admin et l'écran Réglages proposent la même
  liste de noms canoniques, et une phrase dit quoi choisir pour une ville absente. Reste une
  organisation dont le fuseau, enregistré avant la liste, est un alias : Réglages le garde tant
  qu'elle n'en choisit pas un autre, et le dit. Son flux agenda s'écrit au fuseau canonique vers
  lequel l'alias pointe (`Europe/Brussels` pour `Europe/Amsterdam`), aux mêmes heures ; avant la fin
  de l'étape 18, il répondait par une erreur.
- L'écriture ne peut plus désigner une personne invisible, mais la lecture reste ouverte à toute
  personne rattachée à l'organisation courante : c'est le flux d'invitation de l'étape 3 qui devra
  décider ce qu'un responsable voit d'un compte existant ailleurs, l'unicité de l'adresse étant
  globale.

- Modifier le rythme d'un cours (jours, intervalle, ordinal, dates) réécrit ses occurrences passées :
  l'historique affiché change et les exceptions qui ne tombent plus sur une séance deviennent
  orphelines (`findOrphanExceptions`). Parade en V1 : clore le cours (`endsOn`) puis en créer un
  nouveau ; l'interface de l'étape 4 devra proposer ce chemin et signaler les exceptions orphelines.
- Un flux ICS abonné n'est relu par les applications d'agenda que quelques fois par jour : les
  changements de dernière minute passent par le message WhatsApp généré (étape 4), pas par le flux.
- Les données de fuseau du flux ICS viennent de `timezones-ical-library` (tzdata 2026c dans la
  2.3.2) : suivre ses publications par Dependabot ; sans effet pour l'Europe.
- Vérifier que le bloc « Embed Code » du site Odoo de la première organisation exécute un script
  externe. La documentation d'Odoo montre un exemple d'iframe et son code source conserve les
  `<script>` du bloc ; rien n'est établi pour Odoo 19, ni pour les droits du bénévole qui éditera la
  page, ni pour une éventuelle politique de sécurité du site. Les deux modes de pose sont livrés pour
  que la réponse, quelle qu'elle soit, ne bloque rien. À trancher sur le vrai site, avant l'étape 8.
- Le mode intégré n'a pas encore été vu sur un vrai iPhone ni dans Firefox. Deux points à y
  vérifier : la parade `width:1px;min-width:100%` contre l'ancien aplatissement de cadre de WebKit,
  et l'impression d'une page hôte, que Firefox tronque historiquement à la première page.
- Aucun `sandbox` n'est posé sur le cadre. Il protégerait le site de l'organisation contre notre
  propre page — scénario étroit — au prix de casser les liens `webcal:` de la page d'abonnement. À
  reprendre à l'étape 8, avec un essai sur vrai appareil.
- La tâche quotidienne de remplissage des heures calculées est écrite et éprouvée, mais **rien ne
  l'ordonnance** : sur une instance en production, la fenêtre glissante avancerait uniquement quand
  un responsable enregistre ses réglages. À poser à l'étape 9, avec la purge du compteur de vues et
  celle du limiteur de débit.
- Le vendredi, l'iqama du Dhuhr est celle de la **dernière** session de Jumu'a. C'est un choix, pas
  une évidence : une organisation pourrait vouloir qu'un cours suive la première. À revoir si un
  responsable le demande ; d'ici là, un cours à heure fixe le vendredi contourne la question.
- Une période d'horaires ne connaît pas les mois lunaires : « Ramadan » se saisit en dates civiles,
  et se corrige l'année suivante. Un calendrier hégirien serait une dépendance de plus et une source
  de désaccord — les dates varient d'une fédération à l'autre.
- Le compteur de vues est un **minorant** : les pages publiques portent `max-age=120` et une journée
  de `stale-while-revalidate`, donc un cache partagé peut servir la même réponse à un nombre
  illimité de personnes sans que le serveur l'apprenne. Les écrans le disent ; il n'y a pas de
  parade qui ne coûte pas la vie privée ou le cache.
- La liste de robots du compteur est tenue à la main : mesurée contre `crawler-user-agents`, elle
  reconnaît 73,6 % de ses instances. Question fermée à l'étape 8 : les manqués gonflent les chiffres
  sans les fausser gravement, et une dépendance de mille cinq cents expressions régulières coûterait
  plus qu'elle ne rapporterait.
- Le propriétaire des tables garde le droit `TRUNCATE`, qui n'examine aucune politique : sans son
  drapeau d'entretien, il peut vider une table, journal d'audit et acceptations compris. C'est
  écrit comme limite dans l'ADR 0019 depuis l'étape 17 : le propriétaire est de confiance par
  construction. Retirer ce droit ne suffirait pas, puisqu'il peut se le rendre : la seule correction
  séparerait l'entretien de la propriété.
- Le moment d'une acceptation des conditions est le début de la transaction qui l'écrit, comme
  l'horodatage du journal d'audit (ADR 0020, ADR 0044). Une transaction de l'application dure le
  temps d'une requête ; un rôle applicatif compromis pourrait avancer ce moment en la gardant
  ouverte.
- Un site verrouillé par `Cross-Origin-Embedder-Policy` chargerait sans doute le script du widget,
  mais refuserait son cadre, puisque `/m/**` n'envoie pas cet en-tête. Déduit de la norme, non
  éprouvé ; écrit dans `docs/INTEGRATION.md`.
- La vérification de nuit juge chaque objet à quelques minutes de son âge promis : l'archive de la
  nuit N est jugée la nuit N + 9 sous `quotidien/`, alors que le cycle de vie l'efface à 8 jours,
  plus le jour que le stockage peut mettre à le faire. Si le stockage dépasse ce jour, la tâche
  échoue et l'alerte part : la marche à suivre est « Une sauvegarde distante est trop vieille »
  (`docs/EXPLOITATION.md`). Les premières archives jugées à cette limite sont celles des premières
  nuits de la vérification, neuf jours après le déploiement de l'étape 17.
- Le DMARC de `voltia.ch` n'a pas d'adresse `rua`, par décision (étape 17) : personne ne reçoit
  les rapports agrégés, et l'alignement tient par SPF.
- L'hébergement cible est au choix de qui déploie : jadwal n'exige pas une machine à lui, son
  isolation ne repose pas dessus (ADR 0034).
- Outillage récent : Vite 8 (Rolldown), Vitest 5, ESLint 10, pnpm 12. TypeScript 7 (compilateur
  natif) n'est pas encore accepté par `svelte-check` ni `typescript-eslint` ; le dépôt reste en
  TypeScript 6 jusqu'à ce que la chaîne le supporte.
- Sous Windows, `corepack enable` exige une console administrateur quand Node est installé dans
  `Program Files` ; `corepack pnpm ...` fonctionne sans. Corepack n'est plus distribué avec Node à
  partir de la v25 : la CI n'en dépend plus ; en local, il faudra alors installer pnpm autrement.
- Dependabot ne suit pas `.node-version` : à chaque étape, vérifier les publications de sécurité de
  Node 24 (https://nodejs.org/dist/index.json, champ `security`) et relever l'épingle si besoin.
- `pnpm audit` signale une vulnérabilité de gravité faible dans `cookie@0.6.0`, dépendance transitive
  de `@sveltejs/kit` 2.70.3 (GHSA-pxg6-pf52-xh8x) : rien à corriger de notre côté, à suivre à la
  prochaine mise à jour de SvelteKit.
- **Google Agenda sur Android, à vérifier sur un vrai téléphone** (étape 18, E3). L'aide de Google
  dit qu'on ne s'abonne à un agenda par son adresse que depuis un ordinateur, jamais depuis
  l'application Android ; le bouton de la page d'abonnement ouvre la version web de Google Agenda
  dans le navigateur, par un lien que Google ne documente pas (ADR 0048). La page ne se contredit
  plus : elle dit ce que le bouton demande, puis, si rien ne se passe, le passage par un
  ordinateur, en disant d'ouvrir cette page sur un ordinateur, avec son adresse (étape 19). Aucun
  essai n'a encore été fait sur un vrai téléphone, seulement des appareils simulés par leurs
  en-têtes : le chef de projet le fait, et ses résultats décideront des phrases d'Android. Les deux
  liens d'Outlook (compte personnel, et compte de travail ou d'école depuis l'étape 19) ne sont pas
  documentés non plus ; le second reste à essayer avec un vrai compte de travail. La phrase des
  24 heures de Google a disparu à l'étape 19, faute d'appui ; celle d'Outlook reste, parce que la page
  d'aide de Microsoft donne ce délai.
- **Le choix de la langue fait avant la connexion part avec le lien de connexion** (ADR 0047) : il
  n'est plus perdu quand le lien s'ouvre dans un autre navigateur. Ce qui reste vrai : tant qu'aucun
  lien n'est demandé sur le navigateur du choix, le cookie d'attente, qui vit un an, peut remettre
  ce choix sur le compte à la première connexion sur ce navigateur, par-dessus une langue changée
  depuis sur un autre appareil. Une demande de lien freinée par la limite de débit consomme aussi
  le choix. Le chef de projet a accepté cette règle à l'étape 19 ; l'adresse d'arrivée ne montre
  plus `?language=de` depuis la même étape.
- Les pages de l'espace, la page d'abonnement et la page d'un cours changent selon la langue, le
  cookie ou l'appareil, et le disent par `Vary`. Un cache partagé qui l'ignorerait servirait la
  mauvaise version ; le modèle de `infra/` n'en place aucun.
- **GitHub sert encore les anciens commits par leur empreinte** (étape 19, A3). L'historique est
  réécrit et ne porte plus le nom, mais l'adresse d'un commit d'avant la réécriture répond encore,
  page, API et `.patch` compris, et le `.patch` montre ce que le commit portait. Les faire
  disparaître demande de supprimer et de recréer le dépôt, comme le 21.09.2026, ou une demande au
  support de GitHub ; aucune des deux n'est autorisée à ce jour.
- Trois limites de la base, écrites et laissées : une adresse publique sans aucune lettre n'est
  refusée que par l'application (la base accepte encore `2026`, migration 0003) ; la base ne
  vérifie pas que le compte qui écrit comme super-admin porte `is_super_admin` (ADR 0025) ; un
  éditeur lit l'identifiant de la personne qui a écrit une ligne (`course.updated_by`,
  `created_by` des changements et des pauses), sans plus pouvoir le relier à un nom ni à une
  adresse (ADR 0046).
- La liste des localités suisses est celle du 01.09.2026. swisstopo en publie une chaque mois ; une
  mise à jour par an suffit, ou plus tôt après une fusion de communes (`docs/EXPLOITATION.md`). Le
  générateur refuse une date de version qui n'existe pas (étape 19).

## Décisions en attente

- ~~Nom public et domaine~~ : tranché à l'étape 9. Le nom de travail `jadwal` est gardé, et le
  service est servi sur `jadwal.voltia.ch`, sous-domaine à part entière et jamais un chemin de
  `voltia.ch`. Le pied de page des pages publiques, du widget et des courriels porte « jadwal, un
  service de Voltia ».
- ~~L'isolation du déploiement~~ : tranchée à l'étape 9, ADR 0034. Un serveur peut héberger
  d'autres applications : jadwal s'installe donc sans rien supposer de ce qui tourne à côté, ses
  secrets restent illisibles à tout compte non privilégié, et rien de ce qu'il pose ne peut être
  remplacé depuis un compte ordinaire de la machine.
- **L'insertion du bloc de site dans la configuration du serveur web** : une ligne, additive, mais
  posée dans la configuration d'un service en fonctionnement. Elle revient à qui exploite le
  serveur visé.
- **La destination des sauvegardes** et sa clé publique `age` : à fournir par l'exploitant.
- ~~Texte du CLA et outil de signature~~ : tranché à l'étape 19, il n'y a pas de CLA. Les
  contributions arrivent sous la licence MIT du dépôt, et `CONTRIBUTING.md` le dit.
- **L'avis du juriste** sur les onze points de la page de garde, dont le point 10 : l'acceptation
  par personne, rattachée à son adhésion, suffit-elle ? Et le point 11, ajouté à l'étape 18 :
  « Voltia » seul suffit-il comme exploitant et comme titulaire du droit d'auteur ? Voltia est une
  entreprise individuelle : l'exploitant l'a confirmé à l'étape 19, et la page de garde le dit.
- ~~La langue d'une invitation~~ : tranchée à l'étape 19. Le formulaire d'invitation propose
  « Langue du courriel », les cinq langues, celle de l'écran par défaut ; aucune recherche de compte
  (ADR 0017 inchangée). Le lien de connexion reste dans la langue de l'écran où il est demandé.
- ~~Le choix de la langue doit-il suivre le lien de connexion~~ : fait à l'étape 18, il part avec
  le lien (ADR 0047). Accepté à l'étape 19, tel que livré, ce que la règle laisse : un
  choix fait sans demander de lien peut, jusqu'à un an plus tard, remettre sa langue sur le compte
  par-dessus une langue changée ailleurs, et une demande freinée consomme le choix.
- **Les deux cookies de langue** sont fonctionnels, posés sur demande, sans donnée personnelle.
  Faut-il les nommer dans `docs/CONDITIONS.md`, qui ne parle que des cookies de mesure
  d'audience ? La question revient au juriste.
- ~~Ce que la base laisse encore à un éditeur~~ : fermé à l'étape 19 (migrations 0063, 0064 et
  0070, ADR 0046). Chacun peut quitter une organisation depuis « Vos organisations », sauf le
  dernier responsable (migration 0066).
- ~~L'attribut `view="prieres"` du widget~~ : fait à l'étape 19, dans une nouvelle version du
  widget ; une version épinglée avant garde ses trois vues (ADR 0005).
- ~~La relecture par des locuteurs des textes de l'étape 18~~ : faite. Le chef de projet a relu
  l'arabe (ses corrections sont faites à l'étape 19), et accepte `Durchgang`, `turno` et les
  noms du bloc WordPress. **Reste** la relecture des textes arabes, allemands et italiens écrits à
  l'étape 19.
- **La relecture, par le chef de projet, d'un texte arabe écrit sans lui** : la place des
  parenthèses autour de l'annonce qu'il a donnée, « شروط الاستخدام (يُفتح في علامة تبويب جديدة) »
  (étape 17). Les autres textes de cette ligne (le lien des conditions, les formes en « قبل », la
  page 404) étaient dans la relecture de l'étape 18.
- ~~La séparation des rôles dans la base~~ : tranchée à l'étape 18, ADR 0046. Une fonction de la
  base, `jadwal.is_org_admin()`, dit si la personne du contexte est responsable de l'organisation
  du contexte, et les politiques des gestes réservés au responsable l'exigent (migration 0059).

## Défauts connus

Aucun. Les défauts relevés à l'étape 18 sont tous corrigés à l'étape 19, avec ceux que ses propres
relectures ont trouvés. Restent des **questions**, où le code attend une décision du chef de projet
et n'a rien changé en l'attendant :

- un « Rétablir » sur une séance déplacée dont la date d'origine est déjà passée la remet à cette
  date, donc la fait disparaître de l'écran et de la page publique, sans message à envoyer (À venir
  et l'écran du vendredi) ;
- la suppression d'une session du vendredi reste ouverte à l'éditeur, qui la fait depuis l'écran
  du vendredi : D3 ne visait que l'écran des cours ;
- « Déplacé » reste au masculin après « Prière du vendredi », la décision ne visant que
  « Annulée » ; et « Annulée » s'écrit aussi après un titre que l'organisation a choisi, même
  masculin ;
- une personne d'une seule organisation qui n'a pas encore accepté les conditions ne peut pas
  atteindre « Vos organisations » pour la quitter (ADR 0044).

## À poser avant la mise en production

- **Les verrous de conservation de la destination de sauvegarde.** Trois préfixes, trois durées :
  `quotidien/` 7 jours, `hebdo/` 28 jours, `mensuel/` 180 jours, plus un cycle de vie qui efface un
  jour après chaque échéance. Ils se posent **chez le stockage**, jamais depuis le serveur : c'est
  toute la décision de l'ADR 0037. Le rôle `sauvegarde` refuse de continuer s'il arrive à effacer un
  objet d'essai.
- **La supervision.** Un service de battements de cœur, dehors, avec un contrôle par tâche
  périodique, deux pour la sonde `/healthz` (IPv4 et IPv6) et un pour le test de déchiffrement
  trimestriel. Les adresses de battement sont des jetons : elles vivent dans le coffre, et le
  playbook les écrit dans le fichier d'environnement. Sans elles, les tâches tournent exactement
  pareil et le disent dans leur journal.
- **L'inventaire Ansible.** Le copier depuis `infra/ansible/inventory.ini.example` vers
  `PRIVE/inventaire/inventory.ini` et le renseigner. `PRIVE/` est ignoré par git, et refusé à la
  poussée même si un `git add -f` l'y faisait entrer.
- **Le coffre `ansible-vault`.** Le créer à partir de
  `infra/ansible/group_vars/all/vault.yml.example` vers `PRIVE/coffre/vault.yml`, y mettre ses
  propres valeurs et le chiffrer. `ansible.cfg` lit sa phrase de passe dans
  `~/.jadwal-secrets/vault-pass.txt`, hors de tout dépôt. La marche à suivre est dans
  `infra/README.md`.
- **Le contrôle de secrets**, sur chaque poste qui commite : `pnpm hooks`, une fois.
