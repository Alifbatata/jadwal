# API publique de jadwal

Le programme des cours d'une organisation, en lecture seule, en JSON. C'est un **contrat** : le
widget en dépend, et une organisation qui s'auto-héberge aussi. Les champs décrits ici ne
disparaissent pas sans un changement de version.

Écrit pour quelqu'un qui n'a pas le code sous les yeux. Les décisions sont dans l'ADR 0026.

## En deux lignes

```
GET https://<hôte>/api/v1/organisations/belvedere/schedule?from=2026-09-21&to=2026-09-27&lang=fr
```

Pas de clé, pas de compte, pas de cookie. Une organisation est désignée par son **identifiant
d'URL** (`belvedere`), jamais par un identifiant interne.

## Ce qui est servi, et ce qui ne l'est jamais

Servi : les organisations **actives**, et leurs cours **publiés**.

Jamais servi, et ce n'est pas une question de discrétion mais de droits — le compte qui lit pour
vous n'a aucun accès à ces tables :

- les adresses des personnes responsables, ni aucune donnée personnelle ;
- les brouillons et les cours archivés ;
- les organisations suspendues ;
- le journal des modifications, les réglages internes, le plan de l'organisation ;
- les identifiants internes, à une exception près : **l'identifiant d'un cours publié**, dont vous
  avez besoin pour faire un lien.

Un brouillon, un cours archivé, une organisation suspendue et un identifiant inventé rendent tous la
**même réponse** : `404` avec le même corps. Rien ne permet de deviner qu'une organisation a existé.

## Points d'entrée

| Méthode | Chemin                                  | Ce qu'il rend                          |
| ------- | --------------------------------------- | -------------------------------------- |
| `GET`   | `/api/v1/organisations/{slug}`          | les réglages d'affichage publics       |
| `GET`   | `/api/v1/organisations/{slug}/schedule` | les séances sur une plage de dates     |
| `GET`   | `/api/v1/organisations/{slug}/courses`  | les cours, groupés par rythme          |
| `GET`   | `/m/{slug}/agenda.ics`                  | le flux agenda de l'organisation       |
| `GET`   | `/m/{slug}/agenda/{courseId}.ics`       | le flux agenda d'un seul cours         |
| `GET`   | `/api/v1/status`                        | l'état du service, pour la supervision |

`OPTIONS` est accepté sur chaque point d'entrée et répond au sondage préalable d'un navigateur.

### Paramètres communs

| Paramètre | Où      | Défaut                                 | Notes                                           |
| --------- | ------- | -------------------------------------- | ----------------------------------------------- |
| `lang`    | requête | la langue par défaut de l'organisation | `fr`, `de`, `it` ou `ar` ; sinon `fr`           |
| `from`    | requête | aujourd'hui                            | `AAAA-MM-JJ` ; une valeur illisible est ignorée |
| `to`      | requête | `from` + 6 jours                       | borné par `maxDays`                             |
| `maxDays` | requête | `92`                                   | entier, **366 au plus** ; sinon `400`           |

La plage est ramenée dans ses bornes **par le serveur**. Demander dix ans rend quatre-vingt-douze
jours, sans erreur : le champ `range` de la réponse dit toujours ce qui a réellement été servi.

Pour aller au-delà d'un trimestre, demandez-le explicitement avec `maxDays`, jusqu'à **366 jours** —
une année bissextile. Une valeur illisible est ignorée, comme pour `from` et `to` ; une valeur
lisible mais supérieure à 366 est **refusée**, avec un message qui dit la borne : elle exprime une
intention, et la borner en silence reviendrait à servir autre chose que ce qui est demandé.

```
GET /api/v1/organisations/belvedere/schedule?from=2026-09-01&to=2027-06-30&maxDays=366
```

## Les réglages d'affichage

`GET /api/v1/organisations/belvedere`

```json
{
	"organization": {
		"slug": "belvedere",
		"name": "Association Belvédère",
		"timeZone": "Europe/Zurich",
		"accentColor": "#0f766e",
		"languages": ["fr", "de", "it", "ar"],
		"defaultLanguage": "fr",
		"rooms": ["Grande salle", "Salle 2", "Salle des sœurs"]
	}
}
```

| Champ             | Type   | Notes                                                       |
| ----------------- | ------ | ----------------------------------------------------------- |
| `slug`            | chaîne | l'identifiant d'URL de l'organisation                       |
| `name`            | chaîne | son nom, tel qu'il s'affiche                                |
| `timeZone`        | chaîne | nom IANA, par exemple `Europe/Zurich`                       |
| `accentColor`     | chaîne | couleur hexadécimale, pour le widget                        |
| `languages`       | liste  | les langues activées, parmi `fr`, `de`, `it`, `ar`          |
| `defaultLanguage` | chaîne | celle qui s'applique quand `lang` n'est pas donné           |
| `rooms`           | liste  | les **noms** des salles ; elles n'ont pas d'identifiant ici |

## Le programme

`GET /api/v1/organisations/belvedere/schedule?from=2026-09-21&to=2026-09-23`

```json
{
	"organization": {
		"slug": "belvedere",
		"name": "Association Belvédère",
		"timeZone": "Europe/Zurich"
	},
	"language": "fr",
	"range": { "from": "2026-09-21", "to": "2026-09-23" },
	"sessions": [
		{
			"courseId": "01930000-0000-7000-8000-000000000041",
			"date": "2026-09-21",
			"start": "19:00",
			"end": "20:30",
			"startDayOffset": 0,
			"endDayOffset": 0,
			"status": "cancelled",
			"title": "Arabe, niveau 1",
			"audience": "adults",
			"room": "Grande salle",
			"teacher": "Amina Cherif (personne fictive)"
		}
	]
}
```

### Une séance

| Champ             | Type              | Notes                                                                 |
| ----------------- | ----------------- | --------------------------------------------------------------------- |
| `courseId`        | chaîne            | l'identifiant du cours ; stable, utilisable dans un lien              |
| `kind`            | énumération       | `course` ou `jumua` — voir plus bas                                   |
| `date`            | `AAAA-MM-JJ`      | le **jour de la séance**, dans le fuseau de l'organisation            |
| `start` / `end`   | `HH:MM` ou `null` | `null` quand l'heure de la prière d'ancrage n'est pas connue          |
| `startDayOffset`  | entier            | 0 le jour même, 1 le lendemain — une séance ancrée peut passer minuit |
| `endDayOffset`    | entier            | 0, 1 ou 2, même raison                                                |
| `status`          | énumération       | voir ci-dessous                                                       |
| `anchor`          | objet, facultatif | `{ "prayer": "maghrib", "offsetMinutes": 15 }` pour un cours ancré    |
| `originalDate`    | date, facultatif  | pour `moved_here` : d'où la séance vient                              |
| `movedTo`         | objet, facultatif | pour `moved_away` : `{ "date": …, "start": … }`                       |
| `title`           | chaîne            | déjà dans la langue demandée, repli compris                           |
| `audience`        | énumération       | `kids`, `youth`, `women`, `adults`, `open`                            |
| `room`            | chaîne ou `null`  | le nom de la salle                                                    |
| `teacher`         | chaîne ou `null`  | texte libre saisi par l'organisation                                  |
| `jumuaOrder`      | 1, 2 ou 3         | `kind = "jumua"` seulement : le rang de la session                    |
| `sermonLanguages` | liste de chaînes  | `kind = "jumua"` seulement : les langues **du sermon**                |

### `kind`

| Valeur   | Ce que cela veut dire                                                             |
| -------- | --------------------------------------------------------------------------------- |
| `course` | un cours ordinaire                                                                |
| `jumua`  | une session de la prière du vendredi : heure fixe, chaque vendredi, ouvert à tous |

Une session du vendredi passe par le même modèle qu'un cours et sort partout où sort un cours : dans
le programme, dans la liste des cours, dans le flux agenda de l'organisation et dans le sien
(ADR 0033). Ce qui la distingue : son rang, ses langues de **sermon**, et le fait que, lorsqu'il en
existe, l'heure du Dhuhr du vendredi ne s'affiche plus seule.

Champ ajouté à l'étape 8. Un lecteur plus ancien l'ignore sans rien perdre : c'est une addition, pas
une rupture, et `/api/v1/` reste `/api/v1/`.

### `status`

| Valeur       | Ce que cela veut dire                                                  |
| ------------ | ---------------------------------------------------------------------- |
| `scheduled`  | la séance a lieu                                                       |
| `cancelled`  | annulée ; **elle reste dans la réponse**, à afficher barrée            |
| `moved_away` | déplacée ailleurs ; `movedTo` dit où. À afficher barrée à cette date   |
| `moved_here` | c'est la nouvelle date d'une séance déplacée ; `originalDate` dit d'où |

Une séance déplacée apparaît **deux fois** : `moved_away` à sa date d'origine, `moved_here` à sa
nouvelle date. C'est voulu : un visiteur qui regarde l'ancienne date doit comprendre, et un visiteur
qui regarde la nouvelle aussi.

Une date couverte par une pause ne produit **aucune** séance — ni annulée, ni autre. Une pause n'est
pas une annulation : la séance n'existe pas.

## Les cours

`GET /api/v1/organisations/belvedere/courses`

```json
{
	"organization": { "slug": "belvedere", "name": "…", "timeZone": "Europe/Zurich" },
	"language": "fr",
	"groups": [
		{
			"rhythm": "weekly",
			"courses": [
				{
					"id": "01930000-0000-7000-8000-000000000041",
					"kind": "course",
					"title": "Arabe, niveau 1",
					"description": "Lecture et écriture, à partir de zéro.",
					"audience": "adults",
					"teachingLanguages": ["fr", "ar"],
					"room": "Grande salle",
					"teacher": "Amina Cherif (personne fictive)",
					"recurrence": { "kind": "weekly", "weekdays": [1, 3], "interval": 1 },
					"timing": { "kind": "fixed", "start": "19:00", "end": "20:30" },
					"startsOn": "2026-09-07",
					"endsOn": "2027-06-30",
					"nextSessions": [{ "date": "2026-09-23", "start": "19:00", "status": "scheduled" }]
				}
			]
		}
	]
}
```

`groups` sort toujours dans cet ordre, et un groupe vide est omis :

| `rhythm`      | Ce que cela veut dire            |
| ------------- | -------------------------------- |
| `weekly`      | chaque semaine, aux jours listés |
| `fortnightly` | une semaine sur deux             |
| `monthly`     | le nième jour de semaine du mois |
| `dates`       | à des dates précises             |

### `recurrence`

| `kind`    | Champs                                                     |
| --------- | ---------------------------------------------------------- |
| `weekly`  | `weekdays` (1 = lundi … 7 = dimanche), `interval` (1 ou 2) |
| `monthly` | `weekday` (1–7), `ordinal` (1 à 4, ou -1 pour le dernier)  |
| `dates`   | `dates` (liste de `AAAA-MM-JJ`)                            |

### `timing`

| `kind`   | Champs                                                               |
| -------- | -------------------------------------------------------------------- |
| `fixed`  | `start`, `end` en `HH:MM`                                            |
| `prayer` | `prayer`, `offsetMinutes` (-120 à 240), `durationMinutes` (5 à 1440) |

Pour un cours ancré, **affichez la prière en premier** et l'heure en indication : elle change chaque
jour, et elle peut être inconnue.

## Les flux agenda

### Tout le programme

`GET /m/belvedere/agenda.ics` rend un fichier iCalendar (RFC 5545), en `text/calendar`, avec un nom
de fichier lisible. Les cours à heure fixe sortent en événements récurrents (`RRULE`, `EXDATE` pour
une annulation ou une pause, `RECURRENCE-ID` pour un déplacement) ; les cours ancrés sur une prière
et les cours à dates précises sortent séance par séance, sur une fenêtre glissante de 30 jours en
arrière et 120 en avant. Le fichier annonce un rafraîchissement d'une heure.

Le paramètre `lang` s'applique aussi : il choisit la langue des titres et du libellé d'ancrage.

**Le libellé d'ancrage** est la première ligne de `DESCRIPTION` d'un cours ancré sur une prière. Il
est écrit dans la langue du flux, et c'est la phrase de la page publique dans cette langue, mot pour
mot : `بعد المغرب` en arabe, `Nach Fadschr` et `15 Min. nach Ischa` en allemand. Sans décalage, le
flux dit `Après Maghrib`, comme la page. Un décalage négatif se dit « avant », avec sa valeur
absolue.

| Décalage | `fr`                   | `de`                   | `it`                      | `ar`                    |
| -------- | ---------------------- | ---------------------- | ------------------------- | ----------------------- |
| 0        | `Après Maghrib`        | `Nach Maghrib`         | `Dopo Maghrib`            | `بعد المغرب`            |
| 15       | `15 min après Maghrib` | `15 Min. nach Maghrib` | `15 min dopo Maghrib`     | `بعد المغرب بـ15 دقيقة` |
| -15      | `15 min avant Maghrib` | `15 Min. vor Maghrib`  | `15 min prima di Maghrib` | `قبل المغرب بـ15 دقيقة` |

Depuis l'étape 16, le champ `DESCRIPTION` change donc pour trois sortes d'abonnés : en arabe, où
la prière était écrite en lettres latines (`عند Maghrib`) ; en allemand, pour Fajr et Isha ; et dans
toutes les langues pour un décalage négatif, qui sortait en `-15 min après Maghrib`. Les heures et les
identifiants d'événement ne changent pas.

Depuis l'étape 17, le décalage nul change aussi, dans les quatre langues : le flux disait
`À Maghrib`, `Zu Maghrib`, `A Maghrib` et `عند المغرب`, là où la page disait « après ». Il dit
maintenant la phrase de la page, et n'en a plus aucune à lui. Les heures et les identifiants
d'événement ne changent pas non plus.

### Un seul cours

`GET /m/belvedere/agenda/{courseId}.ics` rend le même fichier, pour **un seul cours** : mêmes règles,
même code, même fenêtre glissante. Le nom du calendrier devient `<Nom de l'organisation> – <Titre du
cours>`, avec un tiret demi-cadratin depuis l'étape 16 (un tiret cadratin avant), et le nom de
fichier suit le titre du cours.

Les identifiants d'événement sont les mêmes que dans le flux de l'organisation. Qui s'abonne aux
deux verra les mêmes séances dans deux calendriers — c'est ce que font deux calendriers distincts.

Un cours non publié, archivé, d'une autre organisation ou inventé rend le même `404` qu'une
organisation inconnue.

**Il n'y a pas de filtre par public sur un flux.** Un abonnement se pose une fois et s'oublie ; un
découpage par public ne correspondrait à rien de durable. Le flux par cours répond au vrai besoin,
qui est « je veux celui-là ». La question est fermée (ADR 0028).

## Cache

Chaque réponse porte un `ETag` et un `Cache-Control`. Renvoyez l'`ETag` dans `If-None-Match` : si
rien n'a changé, la réponse est un `304` **sans corps**.

| Réponse          | `Cache-Control`                                      |
| ---------------- | ---------------------------------------------------- |
| programme, cours | `public, max-age=120, stale-while-revalidate=86400`  |
| réglages         | `public, max-age=300, stale-while-revalidate=86400`  |
| agenda           | `public, max-age=3600, stale-while-revalidate=86400` |
| état             | `no-store`                                           |

L'`ETag` change dès qu'un responsable modifie quoi que ce soit dans l'organisation — **y compris une
suppression**, que les horodatages seuls ne verraient pas.

## Limites

- **120 requêtes par minute et par adresse IP**, compteur partagé entre toutes les instances.
  Au-delà : `429` avec un en-tête `Retry-After`. Les fichiers du widget n'y sont pas comptés : ils
  sont servis de mémoire, sans toucher la base, et une grande organisation tomberait avant son
  programme.
- Plage de dates : 92 jours par défaut, 366 sur demande explicite.
- `CORS` : `Access-Control-Allow-Origin: *`, méthodes `GET, HEAD, OPTIONS`. **Aucun en-tête
  d'authentification n'est accepté** : il n'y a rien à authentifier, et un navigateur ne peut donc
  joindre aucun cookie à votre requête.

## Erreurs

```json
{ "error": "not_found" }
```

| Code  | `error`                | Quand                                                  |
| ----- | ---------------------- | ------------------------------------------------------ |
| `400` | `range_too_long`       | `maxDays` dépasse 366                                  |
| `404` | `not_found`            | organisation inconnue, suspendue, ou cours non publié  |
| `429` | `too_many_requests`    | limite de débit atteinte                               |
| `503` | `database_unavailable` | la base ne répond pas (seulement sur `/api/v1/status`) |

Certaines erreurs portent en plus un champ `message`, en anglais, quand le code ne suffit pas à
corriger l'appel. Il ne décrit jamais l'état du service, et il n'est pas destiné à être montré à un
visiteur.

```json
{ "error": "range_too_long", "message": "maxDays must be 366 or less (one leap year)." }
```

## Référencement

Toutes les réponses de cette page portent `X-Robots-Tag: noindex` : ce ne sont pas des pages, et un
moteur n'a rien à en faire. Elles restent **explorables** — une adresse interdite d'exploration ne
peut porter aucune consigne d'indexation, puisque le robot ne la lit jamais.

Les pages publiques `/m/**`, elles, sont indexables, et elles seules. Voir `robots.txt`,
`/sitemap.xml` et l'ADR 0029.

## Ce qui n'existe pas

Il n'y a **aucune** écriture. Le compte qui sert cette API ne peut rien modifier : ce n'est pas une
règle du code, c'est un droit qu'il n'a pas.
