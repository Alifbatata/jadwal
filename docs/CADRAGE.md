# Cadrage de `jadwal`

`jadwal` (« horaire » en arabe) est un service qui permet à une mosquée, puis plus tard à toute
organisation, de publier le programme de ses cours récurrents à partir d'une seule saisie.
Ce document fixe le périmètre de la V1. Les décisions structurantes sont détaillées dans les ADR
(`docs/adr/`). Le nom `jadwal` est un nom de travail.

## Produit

### Problème

Les informations de cours d'une mosquée sont éparpillées et se contredisent entre Instagram,
Facebook, WhatsApp et Mawaqit.

### Solution

Une seule saisie par les responsables, quatre sorties :

1. un **widget** intégrable au site de la mosquée ;
2. une **page publique** par organisation, avec un lien unique à mettre partout ;
3. un **flux agenda ICS** auquel on s'abonne ;
4. des **messages WhatsApp** générés : programme de la semaine, annulation, déplacement, nouveau cours.

### Cible

- V1 : les mosquées, gratuitement.
- Plus tard : d'autres organisations, en payant.
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

- En pratique, 2 à 3 responsables par mosquée.
- Connexion par lien magique reçu par mail, sans mot de passe.
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
- **ou** ancré sur une prière (fajr, dhuhr, asr, maghrib, isha), avec un décalage en minutes et une durée.

À l'affichage, « après Maghrib » passe en premier et l'heure reste indicative.

### Exceptions par séance

- annulée ;
- déplacée (nouvelle date et nouvelle heure). Une séance déplacée apparaît aux deux endroits :
  barrée à l'ancienne date, marquée « date exceptionnelle » à la nouvelle.

### Heures de prière

**Trois sources, dans cet ordre de priorité** (ADR 0004, complété à l'étape 8) :

1. **Les horaires saisis par la mosquée**, sous forme de périodes : un nom, des dates, et pour
   chaque prière l'heure affichée et l'heure d'**iqama** — une heure fixe ou un décalage en minutes.
   C'est ce qu'elle imprime sur son panneau.
2. **L'import du calendrier CSV** de l'organisation, avec un modèle téléchargeable prérempli.
3. **Le calcul** avec la bibliothèque Adhan (MIT), méthode, école, règle des latitudes hautes et
   ajustements par prière réglables par organisation.

Un cours ancré sur une prière suit l'**iqama** quand elle existe, l'heure du soleil sinon.

Ne jamais appeler ni scraper Mawaqit.

### Prière du vendredi

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

Filtres par public. Le détail d'un cours se déplie sur place, sans modale : description, horaire,
intervenant, lieu, rythme, prochaines dates, « ajouter à mon agenda », « partager ».

### Langues

- Langues d'interface : fr, de, it, ar, avec RTL complet et chiffres latins en arabe.
- Contenu : une langue source obligatoire par cours, traductions optionnelles, repli sur la langue source.

### Flux ICS

Un flux ICS par organisation, et — depuis l'étape 6 — **un flux par cours**, à son propre lien et
construit par le même code (ADR 0028). Pas de filtre par public sur un flux : la question est
fermée.

- Cours à heure fixe : événements récurrents (RRULE, EXDATE pour une annulation, RECURRENCE-ID
  pour un déplacement).
- Cours ancrés sur une prière : événements datés un par un sur une fenêtre glissante, puisque
  l'heure change chaque jour.

### Widget

**Révisé à l'étape 6 (ADR 0005).** Le widget ne redessine plus les trois vues : il pose un cadre qui
affiche la page publique, et lui donne la hauteur de son contenu.

- Balise `<jadwal-widget org="...">`, Shadow DOM.
- Zéro dépendance à l'exécution : TypeScript pur, un seul fichier, 1,71 Kio gzip.
- Attributs `org`, `lang`, `view`, `audience`, `min-height`.
- Le cadre **posé à la main** est le mode sans script, pour un site qui les refuse ; sa hauteur est
  alors fixe.
- URL versionnée avec empreinte SRI pour les sites stricts, et `crossorigin` obligatoire avec elle.
- Mention discrète « Proposé gratuitement par jadwal » en pied, avec un lien vers la page publique.
- La couleur d'accent par organisation reste au contrat de la page publique : c'est elle qui rend.

### Données personnelles

V1 sans inscription aux cours : aucune donnée personnelle côté public, aucun cookie, aucun
analytics. Une inscription à un cours de mosquée serait une donnée sensible au sens de la nLPD
suisse. Seules données personnelles du système : les emails des responsables.

## Technique

- `packages/core` : récurrence, exceptions, ancrage sur la prière, export ICS. TypeScript pur,
  très testé (changements d'heure, cinquième semaine du mois, exceptions).
- `packages/db` : Drizzle + PostgreSQL, RLS par organisation, tests avec un rôle NOBYPASSRLS.
- `apps/web` : SvelteKit. Espace des responsables pensé pour le téléphone, pages publiques rendues
  côté serveur, API publique en lecture seule et sans cookie, flux ICS.
- `packages/widget` : custom element en TypeScript pur, un seul fichier JS, sans dépendance à
  l'exécution. Il ne rend aucune vue — il pose un cadre vers la page publique (ADR 0005 révisé).
- Récurrence stockée en colonnes explicites, pas en chaîne RRULE. Occurrences calculées côté
  serveur. Le RRULE n'est généré qu'à l'export ICS, avec ical-generator.
- Connexion : Better Auth (lien magique, limitation de débit, passkeys pour le super-admin ;
  organisations, invitations et rôles restent à nous, ADR 0016). Mails envoyés par SMTP (ADR 0024).
- Instance officielle : VPS dédié, Docker Compose, Caddy, sauvegardes quotidiennes.
- Licences : AGPL-3.0-or-later pour tout le dépôt, sauf `packages/widget` en MIT pour qu'aucun
  site qui colle le script n'ait de doute sur ses obligations. Contributions externes soumises à
  un CLA.

## Feuille de route

0. Dépôt, licences, docs, CI.
1. `core` et ses tests.
2. Base, RLS, données de démo.
3. Connexion, organisations, rôles, invitations, super-admin, journal.
4. Espace des responsables, fidèle à la maquette.
5. API publique, page publique en 4 langues, flux ICS.
6. Widget, fidèle à la maquette, avec page de test d'intégration.
7. Heures de prière : import CSV et Adhan, couleur d'accent, compteur de vues.
8. Heures réelles de la mosquée, iqama, prière du vendredi.
9. Finitions, infrastructure en fichiers, déploiement, pose sur le site de la première mosquée.

Plus tard : pré-traduction automatique validée par le responsable, image « story » du programme,
passkeys pour tous les comptes, paiement. (Les passkeys sont arrivées à l'étape 4 pour le seul
super-admin, où elles sont obligatoires : ADR 0025.)

## Risques ouverts

- Vérifier que le bloc « Embed Code » du site Odoo de la première mosquée exécute un script
  externe. Sinon, le cadre posé à la main, livré à l'étape 6.
- `jadwal` est un nom de travail. Le nom public et le domaine sont à choisir avant le lancement.
- VPS dédié à provisionner à l'étape 9.
