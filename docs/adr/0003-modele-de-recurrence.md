# ADR 0003 : Modèle de récurrence

## Contexte

Un cours porte un rythme, parmi quatre :

- chaque semaine (un jour) ;
- toutes les deux semaines (un jour) ;
- chaque mois (premier, deuxième, troisième, quatrième ou dernier jour de semaine du mois) ;
- dates précises.

Chaque séance peut faire l'objet d'une exception : annulée, ou déplacée (nouvelle date et nouvelle
heure).

Parmi les sorties du service figure un flux agenda ICS. Pour les cours à heure fixe, ce flux
contient des événements récurrents : `RRULE`, `EXDATE` pour une annulation, `RECURRENCE-ID` pour
un déplacement.

Deux représentations de la récurrence sont considérées pour le stockage : des colonnes explicites,
ou une chaîne `RRULE`.

## Décision

Nous stockons la récurrence en colonnes explicites, pas en chaîne `RRULE`.

Les occurrences sont calculées côté serveur.

Le `RRULE` n'est généré qu'à l'export ICS, avec `ical-generator`. Pour les cours à heure fixe,
l'export produit des événements récurrents : `RRULE`, `EXDATE` pour une annulation, `RECURRENCE-ID`
pour un déplacement.

Les exceptions sont portées par séance : une séance est annulée, ou déplacée (nouvelle date et
nouvelle heure). Une séance déplacée apparaît aux deux endroits : barrée à l'ancienne date, marquée
« date exceptionnelle » à la nouvelle.

La récurrence et les exceptions sont implémentées dans `packages/core`.

### Règles exactes (étape 1, `packages/core`)

Rythmes (`Recurrence`) :

- `weekly` : liste de jours de semaine ISO (1 = lundi … 7 = dimanche, non vide, sans doublon),
  intervalle 1 ou 2. Intervalle 1 = chaque semaine aux jours listés. Intervalle 2 = une semaine sur
  deux : les semaines actives sont à distance paire de la semaine (commençant le lundi) qui contient
  `anchorDate` (voir l'ADR 0011).
- `monthly` : nième jour de semaine du mois, ordinal 1 à 4, ou -1 pour le dernier.
- `dates` : les dates listées, sans doublon.

Expansion (`expandOccurrences({ schedules, exceptions, pauses, range, prayerTimes })`) :

- Une occurrence n'existe que dans `[startsOn, endsOn]` (bornes incluses ; `endsOn` absent = sans fin).
- Une date couverte par une pause (du cours ou de toute l'organisation) ne produit aucune occurrence,
  et une exception dont la date d'origine tombe dans une pause est ignorée (ADR 0011).
- `cancelled` : l'occurrence reste dans la sortie avec le statut `cancelled`.
- `moved` : l'occurrence d'origine passe en `moved_away` avec `movedTo` ; une occurrence
  `moved_here` apparaît à `toDate`, début `toStart`, même durée, `originalDate` renseigné.
  `moved_here` est incluse quand sa propre date est dans la plage, même si la date d'origine n'y est
  pas ; `moved_away` est incluse quand la date d'origine est dans la plage.
- Une exception dont la date n'est pas une séance du rythme (orpheline) est ignorée ;
  `findOrphanExceptions(schedules, exceptions)` les signale, avec les exceptions dont le cours
  n'existe pas.
- Horaire fixe : si `end` <= `start`, la séance finit le lendemain (`endDayOffset` = 1). Horaire ancré
  sur une prière : ADR 0004.
- Tri : date, puis début (heure inconnue en dernier), puis identifiant du cours.
- Garde-fou : plage inclusive, `from` <= `to`, 400 jours au plus, sinon `ValidationError`
  (codes `range_inverted`, `range_too_long`). Toute entrée invalide (date ou heure mal formée,
  `weekdays` vide ou en double, `endsOn` avant `startsOn`, décalage ou durée hors bornes,
  doublons d'identifiants ou d'exceptions) lève la même erreur typée, avec la liste des anomalies.
- L'expansion avance par sauts (semaine ou quinzaine, mois par mois), jamais jour par jour ;
  `nextOccurrences` explore l'avenir par tranches de huit semaines jusqu'au nombre demandé.
- Modifier le rythme d'un cours réécrit ses occurrences passées (et rend orphelines les exceptions
  qui ne tombent plus sur une séance). Parade en V1 : clore le cours (`endsOn`) puis en créer un
  nouveau.

Export agenda (`buildCalendar`, point d'entrée `@jadwal/core/ics`, seul endroit du paquet qui
dépend de `ical-generator` et d'un fournisseur de `VTIMEZONE` ; l'entrée `@jadwal/core` reste
sans dépendance à l'exécution, ce qui précise l'ADR 0002) :

- Cours à heure fixe `weekly` ou `monthly` : un seul VEVENT avec `RRULE`
  (`FREQ=WEEKLY;INTERVAL=n;BYDAY=MO,WE` ou `FREQ=MONTHLY;BYDAY=1SU`, `-1SA`…), `DTSTART` = la
  première vraie occurrence à partir de `startsOn`, `UNTIL` si `endsOn`, heures locales avec
  `TZID` et `VTIMEZONE` présent dans le fichier, `EXDATE` pour les dates annulées et en pause.
  Séance déplacée : VEVENT séparé, même UID, `RECURRENCE-ID` sur la date d'origine, nouveaux
  `DTSTART` et `DTEND`, sans `EXDATE`. Les `EXDATE` d'un cours sans date de fin sont
  bornées à 400 jours : une pause de plusieurs siècles produirait autrement des millions de valeurs,
  et le flux régénéré à chaque lecture rattrape la pause avant qu'elle ne commence. Un cours avec
  `endsOn` garde toutes ses `EXDATE`. `UNTIL` vise l'instant qui précède le début du jour suivant
  `endsOn` : « 23:59:59 » n'existe pas dans tous les fuseaux (America/Nuuk change d'heure à 22:00).
  Quand le fuseau de l'organisation est « UTC », les heures sortent en forme UTC sans TZID et le
  fichier ne porte pas de VTIMEZONE : les `EXDATE` suivent cette forme.
- Cours `dates` et cours ancrés sur une prière : un VEVENT par occurrence dans la fenêtre
  (`pastDays` = 30 et `horizonDays` = 120 par défaut, autour d'« aujourd'hui » dans le fuseau de
  l'organisation). Les annulées sont omises. Pour les ancrés, la `DESCRIPTION` commence par le
  libellé fourni par l'appelant (`anchorLabel`) ; une occurrence sans heure de prière connue est
  omise.
- UID stables : `<courseId>@<hôte>` pour un récurrent, `<courseId>-<date>@<hôte>` sinon (la date
  d'origine pour une séance déplacée, afin que l'agenda mette l'événement à jour au lieu d'en créer
  un second). `SEQUENCE` = `sequence` du cours, `DTSTAMP` = `now`.
- Propriétés du calendrier : nom, fuseau, `REFRESH-INTERVAL` et `X-PUBLISHED-TTL` d'une heure,
  toutes écrites avant le premier composant (RFC 5545 §3.6). Pas de `METHOD` : `PUBLISH` exigerait
  un `ORGANIZER` dans chaque VEVENT (RFC 5546 §3.2.1), qu'un flux d'abonnement n'a pas à déclarer.
  Les règles hebdomadaires portent `WKST=MO` explicitement. Le fichier se termine par un CRLF, et
  un calendrier sans aucune séance contient tout de même le VTIMEZONE de l'organisation, la
  grammaire exigeant au moins un composant. Les identifiants repris dans les UID (`uidHost`,
  identifiant de cours) sont refusés s'ils contiennent un caractère à échapper ou s'ils finissent
  par `-AAAA-MM-JJ`, forme réservée aux séances datées.
- Une séance déplacée vers une date postérieure à `endsOn` (ou antérieure à `startsOn`) a bien
  lieu : comme pour une pause, le déplacement est une décision explicite du responsable, alors que
  les bornes du cours ne gouvernent que les dates produites par le rythme.
- Tout texte passe par l'échappement de la bibliothèque, sans concaténation brute de texte saisi.
  Les caractères de contrôle sont retirés des textes saisis, que la RFC interdit dans une valeur.
  L'`URL` fait exception à l'échappement : sa valeur est de type URI (RFC 5545 §3.3.13), et la
  bibliothèque l'échappe à tort comme du texte ; les contre-obliques ajoutées sont retirées à
  l'émission.
- Limite : certaines applications d'agenda ne relisent un flux abonné que quelques fois par jour.
  Les changements de dernière minute sont couverts par le message WhatsApp généré (étape 4).

## Conséquences

- La chaîne `RRULE` n'existe qu'à l'export ICS : elle n'est pas stockée.
- `packages/core` est très testé : changements d'heure, cinquième semaine du mois, exceptions.
- La mise en œuvre est faite à l'étape 1 de la feuille de route (`core` et ses tests) ; les règles
  exactes ci-dessus sont celles du code et de ses tests.
- Un flux abonné est relu par les applications d'agenda à leur rythme : les changements de dernière
  minute passent par le message WhatsApp (étape 4), pas par le flux.

## Statut

Accepté, 2026-09-19 ; complété avec les règles exactes le 2026-09-20. Étape 1 de la feuille de route
(`core` et ses tests).
