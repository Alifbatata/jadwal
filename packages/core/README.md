# @jadwal/core

Logique métier pure de `jadwal` : rythme des cours, exceptions par séance, pauses, ancrage sur une
prière, et export agenda ICS. TypeScript strict, aucune API propre à Node : le même code tourne sur
le serveur, en auto-hébergement et dans le navigateur.

Deux points d'entrée :

- `@jadwal/core` : types, validation, arithmétique des dates, expansion des occurrences. Zéro
  dépendance à l'exécution.
- `@jadwal/core/ics` : export agenda (`buildCalendar`). Seul endroit qui dépend d'`ical-generator`
  et de `timezones-ical-library` (VTIMEZONE).

## Principes

- Les calculs ne lisent jamais l'horloge ni le fuseau de la machine : « aujourd'hui » et
  « maintenant » sont toujours des paramètres (ADR 0012).
- Dates civiles et heures locales en chaînes typées : `IsoDate` (`'2026-09-19'`) et `LocalTime`
  (`'19:00'`). Toute l'arithmétique se fait en jours depuis 1970-01-01 et en minutes depuis minuit ;
  seule `todayInZone(timeZone, now)` utilise `Intl.DateTimeFormat`.
- Jours de semaine ISO : 1 = lundi … 7 = dimanche.
- Une occurrence porte `startDayOffset` et `endDayOffset`, en nombre de jours depuis sa `date`
  (0 le jour même). Une séance qui passe minuit finit à 1 ; une séance ancrée qui commence après
  minuit et dure longtemps peut finir à 2.
- Les règles exactes (rythmes, pauses, exceptions, ancrage, ICS) sont dans `docs/adr/0003`,
  `0004`, `0011` et `0012`.

## Exemple

```ts
import { expandOccurrences, nextOccurrences, type CourseSchedule } from '@jadwal/core';

const tafsir: CourseSchedule = {
	id: 'tafsir',
	// lundi et mercredi, une semaine sur deux, à partir de la semaine du 7 septembre 2026
	recurrence: { kind: 'weekly', weekdays: [1, 3], interval: 2, anchorDate: '2026-09-07' },
	timing: { kind: 'fixed', start: '19:00', end: '20:30' },
	startsOn: '2026-09-07',
	endsOn: '2027-06-30',
	sequence: 0
};

const fiqh: CourseSchedule = {
	id: 'fiqh',
	recurrence: { kind: 'monthly', weekday: 6, ordinal: -1 }, // le dernier samedi du mois
	timing: { kind: 'prayer', prayer: 'maghrib', offsetMinutes: 30, durationMinutes: 60 },
	startsOn: '2026-09-01',
	sequence: 0
};

const occurrences = expandOccurrences({
	schedules: [tafsir, fiqh],
	exceptions: [
		{ kind: 'cancelled', courseId: 'tafsir', date: '2026-09-21' },
		{
			kind: 'moved',
			courseId: 'tafsir',
			date: '2026-10-05',
			toDate: '2026-10-06',
			toStart: '18:00'
		}
	],
	pauses: [{ from: '2026-12-21', to: '2027-01-03' }], // toute l'organisation
	range: { from: '2026-09-01', to: '2026-10-31' }, // inclusive, 400 jours au plus
	// Heures de prière de l'organisation, par date ; undefined si le jour est inconnu.
	// Ici : maghrib le 26 septembre 2026 à 19:23, et rien pour le 31 octobre.
	prayerTimes: (date) => prayerTable.get(date)
});
// Extrait de la sortie, triée par date (les séances du 9 et du 23 septembre, du 7, du 19 et du
// 21 octobre sont omises ici) :
// [{ courseId: 'tafsir', date: '2026-09-07', start: '19:00', end: '20:30', status: 'scheduled', ... },
//  { courseId: 'tafsir', date: '2026-09-21', ..., status: 'cancelled' },
//  { courseId: 'fiqh', date: '2026-09-26', start: '19:55', end: '20:55',  // 19:23 + 30 min, arrondi
//    anchor: { prayer: 'maghrib', offsetMinutes: 30 }, status: 'scheduled', ... },
//  { courseId: 'tafsir', date: '2026-10-05', ..., status: 'moved_away', movedTo: { date: '2026-10-06', start: '18:00' } },
//  { courseId: 'tafsir', date: '2026-10-06', start: '18:00', end: '19:30', status: 'moved_here', originalDate: '2026-10-05' },
//  { courseId: 'fiqh', date: '2026-10-31', start: null, end: null,  // jour absent de la table
//    anchor: { prayer: 'maghrib', offsetMinutes: 30 }, status: 'scheduled', ... }]

const next = nextOccurrences({
	schedules: [tafsir, fiqh],
	from: '2026-09-20',
	fromTime: '19:30',
	limit: 3
});
```

Export agenda :

```ts
import { buildCalendar } from '@jadwal/core/ics';

const ics = buildCalendar({
	name: 'Cours de l’organisation',
	timeZone: 'Europe/Zurich',
	now: new Date(), // fourni par l'appelant : DTSTAMP et fenêtre glissante
	uidHost: 'jadwal.example',
	courses: [{ schedule: tafsir, title: 'Tafsir', location: 'Salle 1' }],
	exceptions: [],
	pauses: [],
	anchorLabel: (prayer, offsetMinutes) => `${offsetMinutes} min après ${prayer}`
});
```

Les cours à heure fixe hebdomadaires ou mensuels sortent en un seul VEVENT récurrent (`RRULE`,
`EXDATE`, `RECURRENCE-ID` pour une séance déplacée). Les cours à dates précises et les cours ancrés
sur une prière sortent séance par séance sur une fenêtre glissante (30 jours en arrière, 120 jours
en avant par défaut).

Les identifiants de cours et l'hôte des UID sont repris tels quels dans les UID : ils ne peuvent
contenir ni espace, ni caractère de contrôle, ni virgule, point-virgule, antislash ou guillemet, et
un identifiant ne peut pas finir par `-AAAA-MM-JJ` (il entrerait en collision avec l'UID d'une
séance datée). Une entrée fautive lève une `ValidationError` de code `invalid_uid`.

## Validation

Toute entrée invalide lève une `ValidationError` qui porte la liste des anomalies (`code`, `path`,
`message`) : date ou heure mal formée, `weekdays` vide ou en double, `endsOn` avant `startsOn`,
`offsetMinutes` hors de -120..240, `durationMinutes` hors de 5..1440, plage inversée ou de plus de
400 jours, doublons d'identifiants ou d'exceptions. Les fonctions `validateSchedule`,
`validateException`, `validatePause`, `validateRange` et `validateInput` renvoient cette liste sans
lever d'erreur.

`findOrphanExceptions(schedules, exceptions)` signale les exceptions dont la date n'est plus une
séance (après un changement de rythme) ou dont le cours n'existe pas.

## Tests

```
pnpm --filter @jadwal/core test      # vitest run --coverage : 90 % en lignes et en branches imposés
pnpm --filter @jadwal/core test:tz   # la suite rejouée sous TZ=UTC, Europe/Zurich, America/Los_Angeles, Pacific/Kiritimati
```

L'arithmétique des dates est vérifiée par des tests de propriété (`fast-check`) de 1970 à 2100 avec
`Date.UTC` comme oracle ; l'export ICS est relu avec `ical.js` (Mozilla) et développé sur deux ans à
cheval sur les changements d'heure, puis comparé à `expandOccurrences`.
