# ADR 0012 : Dates civiles en chaînes, aucun objet `Date` dans les calculs

## Contexte

`packages/core` calcule les séances d'une organisation : dates civiles (« le lundi 21 septembre »)
et heures locales (« 19:00 ») dans le fuseau de l'organisation. L'objet `Date` de JavaScript
représente un instant UTC et n'expose l'heure civile qu'à travers le fuseau de la machine qui
exécute le code : un serveur en UTC, un poste de développement à Zurich et un navigateur à Los
Angeles ne lisent pas les mêmes composantes pour le même instant, et une heure civile qui n'existe
pas dans le fuseau de la machine (trou du passage à l'heure d'été) est décalée en silence.

Le même code tourne sur l'instance officielle, chez les organisations qui s'auto-hébergent et, pour
le widget, dans les navigateurs des visiteurs. Les tests doivent donner le même résultat quel que
soit le fuseau de la machine. L'export ICS écrit des heures locales avec `TZID` et un `VTIMEZONE`,
ce qui n'exige aucune conversion en instant, sauf pour le `UNTIL` des règles de récurrence.

Options considérées : `Date` avec des conventions (tout en UTC), une bibliothèque de dates avec
fuseaux (`luxon`, `dayjs` + plugins, `Temporal` quand il sera disponible partout), ou des chaînes
typées et de l'arithmétique entière.

## Décision

- Une date civile est une chaîne `IsoDate` (« `AAAA-MM-JJ` ») et une heure locale une chaîne
  `LocalTime` (« `HH`:MM »), types littéraux de gabarit TypeScript, validés à l'entrée.
- Tout le calcul de dates se fait en **arithmétique entière** : jours depuis 1970-01-01 (algorithmes
  de Howard Hinnant `days_from_civil`, `civil_from_days`, `weekday_from_days`) et minutes depuis
  minuit. Aucun objet `Date` n'apparaît dans les calculs, ni dans les sources de `@jadwal/core`,
  hormis le point suivant.
- **Seule exception** : `todayInZone(timeZone, now)` donne la date civile du jour dans un fuseau
  IANA à partir d'un instant fourni par l'appelant, avec `Intl.DateTimeFormat`. « Aujourd'hui » et
  « maintenant » sont toujours des paramètres : le cœur ne lit jamais l'horloge.
- Les jours de semaine sont ISO 8601 : 1 = lundi … 7 = dimanche.
- Dans les tests, `Date.UTC` sert d'oracle aux tests de propriété de l'arithmétique (1970 à 2100),
  et la suite est rejouée sous quatre fuseaux de machine (`UTC`, `Europe/Zurich`,
  `America/Los_Angeles`, `Pacific/Kiritimati`) avec des résultats identiques.
- L'export ICS passe les heures civiles à `ical-generator` sans passer par un objet `Date` ; les
  détails sont dans l'ADR 0003.

## Conséquences

- Le cœur est déterministe et portable : même sortie sur le serveur, en auto-hébergement et dans le
  navigateur, sans dépendance de dates.
- Les comparaisons de dates sont des comparaisons de chaînes (format canonique) ou d'entiers ; les
  sauts par semaine et par mois se font en entiers, sans itération jour par jour.
- Les bornes de validité sont celles du calendrier grégorien proleptique sur quatre chiffres
  d'année ; les tests couvrent 1970 à 2100.
- L'appelant fournit l'instant courant (`now`) et le fuseau de l'organisation ; aucune fonction du
  cœur n'a de valeur par défaut « maintenant ».
- Une heure civile ne se convertit en instant qu'à l'export ICS, pour le `UNTIL` (obligatoirement
  en UTC selon la RFC 5545) ; cette conversion est confinée au point d'entrée `@jadwal/core/ics`.

## Statut

Accepté, 2026-09-20. Étape 1 de la feuille de route (`core` et ses tests).
