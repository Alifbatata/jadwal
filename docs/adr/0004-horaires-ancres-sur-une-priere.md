# ADR 0004 : Horaires ancrés sur une prière

## Contexte

L'horaire d'un cours prend l'une de deux formes : une heure fixe (début et fin), ou un ancrage sur
une prière. Un cours « après Maghrib » n'a pas d'heure fixe : l'heure de la prière change chaque
jour.

L'organisation peut exporter le calendrier annuel de ses heures de prière, au format CSV, depuis
son service de calendrier de prière. Contrainte : ne jamais appeler ni scraper un service tiers de
calendrier de prière.

Le flux ICS par organisation exporte les cours à heure fixe en événements récurrents (`RRULE`).
L'ancrage sur la prière relève de `packages/core` (TypeScript pur, zéro dépendance à l'exécution,
très testé). La feuille de route place `core` et ses tests à l'étape 1, et les heures de prière
(import CSV et Adhan) à l'étape 7. Règle du projet : aucune dépendance sans besoin immédiat.

## Décision

- Un horaire est soit à heure fixe (début et fin), soit ancré sur une prière parmi fajr, dhuhr,
  asr, maghrib et isha, avec un décalage en minutes et une durée.
- À l'affichage, « après Maghrib » passe en premier et l'heure reste indicative.
- Les heures de prière viennent de l'import du calendrier annuel CSV de l'organisation (export de
  son service de calendrier de prière). À défaut, elles sont calculées avec la bibliothèque Adhan
  (MIT), la méthode et les ajustements par prière étant réglables par organisation.
- Nous n'appelons jamais un service tiers de calendrier de prière et nous ne le scrapons jamais.
- Dans le flux ICS, les cours ancrés sur une prière sont exportés en événements datés un par un,
  sur une fenêtre glissante, puisque l'heure change chaque jour.

### Règles exactes (étape 1, `packages/core`)

- Un horaire ancré porte la prière (`fajr`, `dhuhr`, `asr`, `maghrib`, `isha`), un décalage
  `offsetMinutes` entier dans -120..240 et une durée `durationMinutes` entière dans 5..1440.
- Les heures de prière sont fournies à l'expansion par une fonction `prayerTimes(date)` qui renvoie
  les cinq heures locales du jour, ou rien si le jour est inconnu ; le cœur ne calcule rien lui-même.
- Début = heure de la prière + `offsetMinutes`, arrondi aux 5 minutes supérieures ; fin = début +
  `durationMinutes`. Si la table ne connaît pas ce jour : `start` et `end` à `null`, `anchor`
  (prière et décalage) présent quand même, pour que l'affichage puisse dire « après Maghrib ».
- Une heure illisible pour la prière demandée (cellule vide, « `20h00` », valeur absente) vaut heure
  inconnue, exactement comme un jour absent de la table : la séance sort sans heure au lieu de faire
  échouer l'expansion entière. L'import CSV de l'étape 7 signalera ces cellules à part.
- Si le début calculé passe minuit, la séance reste rattachée au jour de la prière : `start` est
  l'heure du lendemain et `startDayOffset` vaut 1. Un début qui tomberait la veille (décalage
  négatif sur une prière très matinale) est traité comme inconnu.
- Une séance déplacée d'un cours ancré prend `toStart` comme heure fixe, garde la durée et perd
  son `anchor` ; la séance d'origine (`moved_away`) conserve ses heures calculées et son `anchor`.
- Tri au sein d'une journée par heure de début effective ; une séance sans heure connue va en
  dernier.
- Une occurrence porte `startDayOffset` et `endDayOffset`, en nombre de jours depuis `date` (0 le
  jour même). Une séance ancrée qui commence après minuit et dure longtemps peut finir le
  surlendemain : `endDayOffset` vaut alors 2, ce qu'un booléen « le lendemain » ne saurait dire.
- Export ICS : un `VEVENT` daté par occurrence dans la fenêtre glissante, `DESCRIPTION` commençant par
  le libellé fourni par l'appelant, occurrence sans heure connue omise, annulée omise.
- Les tests utilisent une petite table d'heures de prière pour Bienne, marquée comme données de
  test, autour des changements d'heure de mars et d'octobre : les heures locales « sautent » d'une
  heure d'un jour à l'autre, ce que l'expansion reproduit sans conversion de fuseau.

### Les deux sources (étape 7)

**Priorité, en une phrase : un jour importé l'emporte toujours sur le calcul.** Ce n'est pas une
consigne donnée au code appelant, c'est une clause `where` de l'écriture — `fillPrayerDays` ne
modifie une ligne que si sa `source` vaut `computed`. Un calcul ne peut donc pas écraser un jour
importé, quel que soit le chemin qui l'a déclenché.

Toutes les heures servies viennent de la table `prayer_day`, lue par la fonction
`prayerTimes(date)` que le cœur attend déjà. Rien ne calcule à la volée pendant une requête : ce qui
est affiché est ce qui est écrit.

**L'import.** Un CSV documenté (`docs/calendrier-prieres-exemple.csv`), avec un aperçu obligatoire :
nombre de jours, première et dernière date, jours manquants, lignes refusées avec leur numéro et
leur raison. **Rien n'est écrit avant confirmation**, et l'aperçu ne range rien côté serveur — la
forme normalisée repart au navigateur dans un champ caché, et elle est entièrement revérifiée au
retour. Un nouvel import remplace les jours qu'il couvre et ne touche à aucun autre.

Les contrôles : dates valides et non dupliquées, heures valides, ordre des prières respecté, dérive
d'un jour à l'autre plausible. La dérive et l'ordre sont **signalés, jamais refusés** : le
calendrier d'une organisation peut arrondir, avancer l'Isha d'été, ou changer de méthode en cours
d'année. Le passage à l'heure d'été fait bouger les cinq prières d'une heure le même jour ; ce cas-là
est reconnu et n'est pas signalé, alors qu'un saut d'une heure sur une seule prière l'est.

Nous n'inventons pas le format de calendrier le plus répandu. Le lecteur accepte le format documenté
et les tolérances qu'un tableur impose en pratique — marque d'ordre des octets, séparateur `;` ou
tabulation, guillemets, `CRLF`, colonnes nommées en français, en anglais ou en arabe translittéré,
heures écrites `19:23`, `9:23`, `19:23:00`, `19h23` ou `7:23 PM`. Le jour où l'exploitant fournit un
export réel de ce format dans `docs/`, le lecteur s'y adaptera en plus.

**Le calcul.** `adhan` (MIT), la seule dépendance de `packages/core/src/prayer/`. Position saisie à
la main en degrés décimaux — **aucun géocodage**, qui serait un service extérieur interrogé avec
l'adresse d'une organisation (ADR 0009). Méthode parmi les treize qu'`adhan` nomme, école pour
l'Asr, règle des latitudes hautes, et un ajustement en minutes par prière. Une fenêtre glissante de
quatre cent un jours — trente en arrière, trois cent soixante-dix en avant — remplie à chaque
changement de réglage et par une tâche quotidienne idempotente
(`pnpm --filter @jadwal/db run prayer-fill`, ordonnancée à l'étape 8).

Le remplissage n'écrit que ce qui change : la clause `is distinct from` laisse `updated_at`
tranquille quand les heures sont identiques. Cela compte, parce que cet horodatage entre dans
l'empreinte de cache des flux agenda (ADR 0026) : une tâche de nuit qui toucherait les quatre cents
jours ferait retélécharger son calendrier à tout le monde, chaque nuit, pour rien.

Le changement d'heure est traité par le fuseau de l'organisation, jamais par un décalage fixe : les
heures sont formatées avec `Intl.DateTimeFormat` et le fuseau explicite, donc les deux journées de
mars et d'octobre sortent justes sans cas particulier.

### La règle des latitudes hautes, et son défaut

À 47° nord — Bienne — la nuit de juin est courte : le soleil ne descend jamais à 18° sous l'horizon,
et l'Isha « astronomique » n'existe pas certains jours. Toutes les méthodes s'en remettent alors à
une convention. `adhan` en propose trois : partager la nuit en deux (`middleofthenight`), en sept
(`seventhofthenight`), ou plafonner l'angle (`twilightangle`).

Le défaut du service est `middleofthenight`, et voici pourquoi. Nous avons calculé les trois cent
soixante-cinq jours de Bienne avec la méthode de la Ligue islamique mondiale : à cette latitude, la
règle ne **mord** aucun jour de l'année, c'est-à-dire que les trois règles donnent le même résultat.
Le choix n'est donc pas un choix d'exactitude, il est un choix de commodité pour les latitudes plus
hautes, et il appartient à l'organisation — qui en voit la conséquence dans l'aperçu à sept jours
avant d'enregistrer. Au-delà de 48°, l'écran recommande `seventhofthenight`, qui resserre l'écart
entre l'Isha et la nuit réelle, et c'est aussi ce que recommande la documentation d'`adhan`.

Limite assumée : à Tromsø, aucune règle ne produit d'heure certains jours d'été. Un jour incomplet
n'est pas écrit du tout ; il vaut « heure inconnue », et la séance s'affiche « après Maghrib » sans
heure. C'est exactement le comportement décrit plus haut pour un jour absent de la table.

### L'Isha après minuit

À Bienne, l'Isha tombe après minuit vingt-huit jours par an, autour du solstice d'été. L'heure
rangée est alors l'heure locale vraie — `00:41` par exemple — datée du jour de la prière. C'est ce
qu'attend un cours ancré, dont le cœur sait déjà dire « le lendemain » par `startDayOffset`, et
l'écran des réglages le marque dans l'aperçu.

La limite : un lecteur qui trierait `prayer_day` par heure verrait l'Isha passer en tête de sa
journée. Aucun écran ne le fait, et la colonne `date` reste le jour de la prière, ce qui est la
seule convention qui permette de retrouver une journée entière d'un coup.

### Trois sources, et l'iqama (étape 8)

L'étape 7 disait : « toutes les heures servies viennent de `prayer_day` ». Cela ne tient plus, et
c'est délibéré.

#### La saisie à la main, qui passe avant tout

Ce que l'organisation décide elle-même est la vérité. La table `prayer_period` porte ce qu'elle
imprime sur son panneau : un nom, une date de début, une date de fin **facultative** — vide vaut
« jusqu'à nouvel ordre » —, et pour chacune des cinq prières l'heure du soleil qu'elle affiche et
l'heure d'iqama qu'elle appelle.

Ce n'est pas une saisie jour par jour : personne ne remplit trois cent soixante-cinq jours. Une
organisation qui règle un décalage d'iqama le fait une fois, sans date de fin ; une organisation
qui affiche des heures fixes crée deux ou trois périodes par an, exactement comme elle réimprime
son panneau.

**Deux périodes ne peuvent pas se chevaucher**, et ce n'est pas l'écran qui le vérifie : c'est une
contrainte d'exclusion de PostgreSQL sur `daterange(from_date, coalesce(to_date, 'infinity'), '[]')`,
donc vraie quel que soit le chemin d'écriture. Sans elle, deux lignes pourraient couvrir la même date
et la réponse dépendrait de l'ordre de lecture.

#### La priorité, et pourquoi elle est résolue à la lecture

**Saisie à la main > import > calcul.**

La priorité ne pouvait pas être matérialisée dans `prayer_day` : si une période écrasait les jours
importés, supprimer la période ferait disparaître l'import pour toujours. Les périodes vivent donc
dans leur table, et la résolution se fait à la lecture, **en une seule requête** —
`resolvedPrayerDaysQuery` dans `@jadwal/db` — que le côté public et l'espace des responsables
partagent. La priorité est donc écrite une seule fois, et un test la vérifie dans tous les ordres,
y compris le cas qui les mêle.

L'empreinte de cache des flux agenda compte désormais `prayer_period` : sans cela, changer une iqama
ne périmerait aucun flux, et l'organisation servirait ses anciennes heures pendant une heure.

#### L'iqama, séparée de l'heure du soleil

L'heure du soleil dit quand la prière **entre** ; l'iqama dit quand elle est **appelée dans la
salle**. Ce ne sont pas les mêmes, et les deux sont conservées et affichées.

Pour chaque prière, l'organisation règle soit une **heure fixe**, soit un **décalage en minutes**
après l'heure du soleil — jamais les deux, une contrainte l'interdit. Les deux formes coexistent
dans une même organisation : Fajr à 06:30, Maghrib cinq minutes après le coucher.

**L'iqama est dans la période, et non dans les réglages généraux.** Une iqama en heure fixe est
saisonnière par nature — 06:30 l'hiver ne vaut pas l'été — et la mettre ailleurs aurait obligé à
inventer un second mécanisme de saison. Une iqama en décalage, elle, n'a pas ce problème et s'écrit
dans une période sans date de fin, donc une seule fois.

#### Ce qu'un cours suit

**Un cours ancré sur une prière s'ancre sur l'iqama quand elle existe**, sur l'heure du soleil
sinon. C'est le moment où les gens sont dans la salle, et c'est donc le seul moment qui ait un sens
pour un cours. Le décalage propre au cours s'ajoute par-dessus, sans changer de sens : ce n'est pas
une seconde règle, c'est la même appliquée à une autre base.

Le repli est complet et testé : iqama, puis heure du soleil, puis « heure inconnue » — ce dernier cas
étant le comportement d'avant l'étape 8, mot pour mot.

Le vendredi, quand des sessions de Jumu'a existent, l'iqama du Dhuhr est l'heure de la dernière
d'entre elles (ADR 0033).

#### Le changement d'heure avec une iqama fixe

Le dimanche de mars, l'heure du soleil recule d'une heure d'un jour à l'autre ; une iqama fixée à
06:30 **reste à 06:30**. C'est voulu — c'est ce que fait le panneau de l'organisation, qui ne
change pas de lui-même — et le test le dit en toutes lettres pour que personne ne le « corrige »
plus tard. L'organisation corrigera sa période quand elle le décidera ; ce n'est pas au service de
décider à sa place.

## Conséquences

- Un cours ancré se saisit une fois (prière, décalage, durée) ; ses heures découlent des heures
  de prière de l'organisation.
- Les heures affichées pour un cours ancré dépendent des heures de prière disponibles pour
  l'organisation (calendrier importé, sinon calcul avec Adhan) et restent indicatives.
- Aucun appel à un service tiers de calendrier de prière et aucun scraping : les heures de prière
  viennent d'un fichier importé par l'organisation ou d'un calcul avec Adhan.
- Les cours ancrés sur une prière ne sont pas exportés en `RRULE` : le flux ICS contient un
  événement daté par séance, sur une fenêtre glissante.
- L'ancrage sur la prière fait partie de `packages/core` et de ses tests (étape 1).
- L'import CSV et le calcul avec Adhan sont reportés à l'étape 7. Adhan (MIT) n'est ajouté qu'à
  cette étape, comme dépendance listée et justifiée en une ligne dans le rapport.

## Statut

Accepté, 2026-09-19 ; complété avec les règles exactes le 2026-09-20 ; complété avec les deux
sources, la fenêtre glissante et la règle des latitudes hautes le 2026-09-21 ; complété avec la
saisie à la main, l'iqama et la priorité des trois sources le 2026-09-21 (étape 8). Étapes 1, 7 et 8
de la feuille de route. La tâche quotidienne de remplissage est écrite ; son ordonnancement
appartient à l'étape 9.
