# Cadrage de `jadwal`

`jadwal` (« horaire » en arabe) est un service qui permet à une organisation de publier le
programme de ses cours récurrents à partir d'une seule saisie.
Ce document fixe le périmètre de la V1. Les décisions structurantes sont détaillées dans les ADR
(`docs/adr/`). Le nom `jadwal` est un nom de travail.

## Produit

### Problème

Les informations de cours d'une organisation sont éparpillées et se contredisent entre son site,
ses réseaux sociaux, ses groupes de discussion et les annuaires où elle est inscrite.

### Solution

Une seule saisie par les responsables, quatre sorties :

1. un **widget** intégrable au site de l'organisation ;
2. une **page publique** par organisation, avec un lien unique à mettre partout ;
3. un **flux agenda ICS** auquel on s'abonne ;
4. des **messages WhatsApp** générés : programme de la semaine, annulation, déplacement, nouveau
   cours. Depuis l'étape 18, l'espace les propose dans chacune des langues que l'organisation
   publie. Le message « nouveau cours » s'affiche sur la liste des cours après la publication d'un
   nouveau cours, depuis le lot 2 de l'étape 19.

### Cible

- V1 : toute organisation qui donne des cours récurrents, gratuitement.
- Plus tard : un accès payant.
- Le modèle prévoit dès le départ un `plan` par organisation et un statut « offert » que seul le
  super-admin peut attribuer. Aucun paiement n'est codé en V1.

### Modes de déploiement

Deux modes avec le même code :

- service hébergé par l'auteur ;
- auto-hébergement par une organisation, avec Docker Compose documenté.

## Rôles

| Rôle         | Pouvoirs                                         |
| ------------ | ------------------------------------------------ |
| `superadmin` | crée les organisations, attribue la gratuité     |
| `org_admin`  | invite et retire les membres de son organisation |
| `editor`     | saisit et modifie les cours                      |

- En pratique, 2 à 3 responsables par organisation.
- La base elle-même sépare l'éditeur du responsable : ce que l'écran réserve au responsable, elle
  le refuse à l'éditeur (ADR 0046). L'écran Membres dit ce que chaque rôle permet.
- Connexion par lien magique reçu par mail, sans mot de passe.
- Avant d'entrer dans l'espace d'une organisation, chaque personne accepte les conditions
  d'utilisation, puis chaque nouvelle version du texte. Le super-admin n'y est pas soumis
  (ADR 0044).
- Journal des modifications (qui, quoi, quand) avec retour arrière.

## Cours

### Champs

Titre, description, public (enfants, jeunes, femmes, adultes, ouvert à tous), langue(s)
d'enseignement, lieu (salles définies par l'organisation), intervenant (texte libre optionnel),
rythme, horaire.

### Rythmes

- chaque semaine (un jour) ;
- toutes les deux semaines (un jour) ;
- chaque mois (premier, deuxième, troisième, quatrième ou dernier jour de semaine du mois) ;
- dates précises.

### Horaire

- heure fixe (début et fin) ;
- **ou** ancré sur une prière (fajr, dhuhr, asr, maghrib, isha), après ou avant elle, avec un nombre
  de minutes (de 0 à 240 après, de 1 à 120 avant) et une durée. La base garde un décalage signé :
  « 10 min avant Maghrib » s'y écrit −10 (ADR 0004, addendum de l'étape 18).

À l'affichage, « après Maghrib » ou « 10 min avant Maghrib » passe en premier et l'heure reste
indicative.

### Exceptions par séance

- annulée ;
- déplacée (nouvelle date et nouvelle heure). Une séance déplacée apparaît aux deux endroits :
  barrée à l'ancienne date, marquée « date exceptionnelle » à la nouvelle. Déplacée le même jour à
  une autre heure, elle est marquée « nouvelle heure », avec l'heure d'avant (étape 18).

### Heures de prière

**Module optionnel, éteint par défaut.** Une organisation qui ne l'allume pas ne voit nulle part
d'heures de prière : ni dans son espace, ni sur sa page publique, ni dans son widget, ni dans
l'API, et l'ancrage d'un cours sur une prière ne lui est pas proposé. Celle qui l'allume retrouve
tout ce qui suit (ADR 0042).

**Trois sources, dans cet ordre de priorité** (ADR 0004, complété à l'étape 8) :

1. **Les horaires saisis par l'organisation**, sous forme de périodes : un nom, des dates, et pour
   chaque prière l'heure affichée et l'heure d'**iqama** — une heure fixe ou un décalage en minutes.
   C'est ce qu'elle imprime sur son panneau.
2. **L'import du calendrier CSV** de l'organisation, avec un modèle téléchargeable prérempli.
3. **Le calcul** avec la bibliothèque Adhan (MIT), méthode, école, règle des latitudes hautes et
   ajustements par prière réglables par organisation. La position est celle de la localité de
   l'organisation, choisie par son nom ou son code postal dans la liste officielle des localités de
   swisstopo, embarquée dans le serveur ; hors de Suisse, une latitude et une longitude.

L'écran des responsables pose une seule question, « D'où viennent vos heures de prière ? », avec
trois réponses (calculées, importées, saisies à la main) ; chacune montre l'aperçu des sept
prochains jours avant d'enregistrer.

Un cours ancré sur une prière suit l'**iqama** quand elle existe, l'heure du soleil sinon.

Ne jamais appeler ni scraper un service tiers de calendrier de prière, ni un service de recherche
d'adresse.

### Prière du vendredi

Elle fait partie du même module, et suit le même interrupteur.

Une, deux ou trois **sessions**, chacune avec son rang, son heure fixe, sa salle et ses **langues de
sermon**. Elles passent par le même modèle que les cours (ADR 0033) et apparaissent en haut de la
page publique, dans la vue Semaine, dans les flux agenda et dans leur propre écran côté responsables.

Quand des sessions existent, elles remplacent l'heure du Dhuhr du vendredi partout.

## Côté public

### Vues

Trois vues :

- **Semaine** (par défaut) ;
- **Tous les cours**, groupés par rythme ;
- **Mois** : grille, puis liste du jour choisi.

Et, quand le module des heures de prière est allumé, un quatrième onglet, **Prières** : les heures
du jour et des sept prochains jours (adhan et iqama), puis les sessions du vendredi avec la langue
de leur sermon (ADR 0042, addendum de l'étape 18).

Filtres par public. Chaque cours a sa propre page, sans modale, depuis l'étape 5 : son lien est ce
qu'on partage dans un message, et ce qu'un moteur de recherche indexe. Elle donne le rythme,
l'horaire, le public, la description, le lieu, l'intervenant, les langues d'enseignement, les
prochaines séances et « Ajouter ce cours à mon agenda » (`docs/maquettes/public-cours.md`).

### Langues

- Langues d'interface : `fr`, `de`, `it`, `en` (anglais britannique) et `ar`, avec RTL complet et
  chiffres latins en arabe. Depuis l'étape 18, les mêmes cinq langues valent pour l'espace des
  responsables, le super-admin et les courriels, et non plus pour le seul côté public (ADR 0007,
  ADR 0047).
- Les dates lues par une personne s'écrivent `JJ.MM.AAAA`, comme en Suisse, dans les cinq langues.
- Les conditions d'utilisation restent en français ; dans les autres langues, une phrase le dit.
- Contenu : une langue source obligatoire par cours, traductions optionnelles, repli sur la langue source.

### Flux ICS

Un flux ICS par organisation, et — depuis l'étape 6 — **un flux par cours**, à son propre lien et
construit par le même code (ADR 0028). Pas de filtre par public sur un flux : la question est
fermée.

- Cours à heure fixe : événements récurrents (`RRULE`, `EXDATE` pour une annulation,
  `RECURRENCE-ID` pour un déplacement).
- Cours ancrés sur une prière : événements datés un par un sur une fenêtre glissante, puisque
  l'heure change chaque jour.

La page d'abonnement, et le bloc « ajouter à mon agenda » d'un cours, proposent d'abord ce que
l'appareil du visiteur sait ouvrir : le lien `webcal:` sur un iPhone, un iPad ou un Mac, Google
Agenda sur Android, le choix complet ailleurs. Le serveur lit l'appareil dans les en-têtes, la page
reste sans script, et le choix complet est toujours à un lien (ADR 0048).

### Widget

**Révisé à l'étape 6 (ADR 0005).** Le widget ne redessine plus les trois vues : il pose un cadre qui
affiche la page publique, et lui donne la hauteur de son contenu.

- Balise `<jadwal-widget org="...">`, Shadow DOM.
- Zéro dépendance à l'exécution : TypeScript pur, un seul fichier, environ 2 Kio gzip (2 145 octets
  mesurés le 27.09.2026).
- Attributs `org`, `lang`, `view`, `audience`, `min-height`. `view` accepte `semaine`, `cours`,
  `mois` et, depuis le 27.09.2026, `prieres`, l'onglet des heures de prière (ADR 0005, addendum).
  Le fichier a changé pour cette vue : une version épinglée par son empreinte avant cette date
  reste servie ; avec `view="prieres"`, elle s'ouvre sur la semaine, et l'onglet reste dans le
  cadre.
- Le cadre **posé à la main** est le mode sans script, pour un site qui les refuse ; sa hauteur est
  alors fixe.
- URL versionnée avec empreinte SRI pour les sites stricts, et `crossorigin` obligatoire avec elle.
- Mention discrète « Proposé gratuitement par jadwal, un service de Voltia » en pied, avec un lien
  vers la page publique.
- La couleur d'accent par organisation reste au contrat de la page publique : c'est elle qui rend.

### Données personnelles

V1 sans inscription aux cours : un visiteur n'est pas identifié, ne reçoit aucun cookie, et aucun
outil de mesure d'audience ne le suit. Une inscription à un cours pourrait être une donnée sensible
au sens de la nLPD suisse. La liste complète des données personnelles que le service garde, avec
leur durée, est dans `docs/CONDITIONS.md`.

## Technique

- `packages/core` : récurrence, exceptions, ancrage sur la prière, export ICS. TypeScript pur,
  très testé (changements d'heure, cinquième semaine du mois, exceptions).
- `packages/db` : Drizzle + PostgreSQL, RLS par organisation, tests avec un rôle `NOBYPASSRLS`.
- `apps/web` : SvelteKit. Espace des responsables pensé pour le téléphone, pages publiques rendues
  côté serveur, API publique en lecture seule et sans cookie, flux ICS.
- `packages/widget` : élément personnalisé `<jadwal-widget>` en TypeScript pur, un seul fichier JS,
  sans dépendance à l'exécution. Il ne rend aucune vue : il pose un cadre vers la page publique
  (ADR 0005 révisé).
- Récurrence stockée en colonnes explicites, pas en chaîne `RRULE`. Occurrences calculées côté
  serveur. Le `RRULE` n'est généré qu'à l'export ICS, avec `ical-generator`.
- Connexion : Better Auth (lien magique, limitation de débit, passkeys pour le super-admin ;
  organisations, invitations et rôles restent à nous, ADR 0016). Mails envoyés par SMTP (ADR 0024).
- Instance officielle : Docker Compose derrière Caddy, sauvegardes quotidiennes chiffrées. jadwal
  n'exige pas une machine à lui : son isolation ne repose pas dessus (ADR 0034).
- Licence : MIT pour tout le dépôt, widget compris (ADR 0043), sauf la liste des localités suisses
  (`apps/web/src/lib/server/localites/localities.csv`), qui reste sous les conditions d'utilisation
  de swisstopo et se cite « Source : Office fédéral de topographie swisstopo ». Contributions
  externes soumises à un CLA.

## Feuille de route

0. Dépôt, licences, docs, CI.
1. `core` et ses tests.
2. Base, RLS, données de démo.
3. Connexion, organisations, rôles, invitations, super-admin, journal.
4. Espace des responsables, fidèle à la maquette.
5. API publique, page publique en 4 langues, flux ICS.
6. Widget, fidèle à la maquette, avec page de test d'intégration.
7. Heures de prière : import CSV et Adhan, couleur d'accent, compteur de vues.
8. Heures réelles de l'organisation, iqama, prière du vendredi.
9. Finitions, infrastructure en fichiers, déploiement, pose sur le site de la première
   organisation.

Les étapes suivantes, de la mise en ligne aux retours des tests du chef de projet (étape 18), sont
dans `ETAT-PROJET.md`.

Plus tard : pré-traduction automatique validée par le responsable, image « story » du programme,
passkeys pour tous les comptes, paiement. (Les passkeys sont arrivées à l'étape 4 pour le seul
super-admin, où elles sont obligatoires : ADR 0025.)

## Risques ouverts

- Vérifier que le bloc d'intégration du constructeur de site utilisé par l'organisation exécute un
  script externe. Sinon, le cadre posé à la main, livré à l'étape 6.
- Le nom de travail `jadwal` est gardé, et le service est servi sur `jadwal.voltia.ch`
  (tranché à l'étape 9).
