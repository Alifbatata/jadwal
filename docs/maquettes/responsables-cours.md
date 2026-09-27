# Les cours, les pauses et le formulaire d'un cours

Décrit après le code, à l'étape 18 (retours B4, C3, et B1, D2, A3 pour ces écrans), et complété aux
lots 2 et 3 de l'étape 19 (27.09.2026). Textes : `apps/web/src/lib/i18n/courses.ts` et
`course-form.ts`, dans les cinq langues. Le résumé et le passage entre la base et l'écran sont dans
`apps/web/src/lib/course-form.ts`, le même code pour le serveur et pour le navigateur.

## La liste des cours, `/cours`

1. Titre de niveau 1 : `Cours`, puis `Les cours de votre organisation. Un cours publié apparaît sur
la page publique du programme. Un brouillon reste dans cet espace.`
2. Le bouton `Ajouter un cours` (avant : `Nouveau cours`).
3. Un bloc par cours : le titre (`Cours sans titre` s'il n'en a pas), l'état (`brouillon`
   ou `publié`), le rythme et l'horaire (`un lundi et mercredi sur deux, 10 min avant
Maghrib, pendant 1 h`), puis les valeurs avec leur libellé : `Public : adultes · Salle : Grande
salle · Intervenant : …`, et le lien `Modifier ce cours`, dont les lecteurs d'écran entendent aussi
   le titre.
4. Un cours à dates précises dont des dates tombent hors de sa période, un cours enregistré avant
   la règle de l'étape 18, porte en plus, en brun et en gras : `À corriger : des dates de ce cours
tombent hors de sa période et ne sont pas publiées. Ouvrez « Modifier ce cours » pour voir
lesquelles.` Sa fiche les nomme (étape 19, lot 2).
5. Pour une personne responsable seulement : `Supprimer ce cours` (plus bas).

Sans cours : `Aucun cours pour l'instant. Touchez « Ajouter un cours » pour créer le premier.`

### Supprimer un cours (étape 19, lot 2, D3)

Le geste est réservé à la personne responsable (ADR 0046). Un éditeur ne le voit pas ; s'il envoie
le formulaire à la main, l'action le renvoie à l'accueil sans rien lire, par la garde des écrans
réservés, et la base le lui refuse de toute façon (migration 0065).

- Un élément `details` natif, fermé : `Supprimer ce cours`, dont les lecteurs d'écran entendent aussi
  le titre du cours. Ouvert, avec ou sans JavaScript, il dit ce que la suppression emporte : `Le cours
disparaîtra de cet écran, de votre page publique et des agendas abonnés, avec ses pauses et les
changements de ses séances. Cela ne peut pas être annulé. Pour arrêter le cours à une date, indiquez
plutôt son dernier jour dans « Modifier ce cours ».`, puis le bouton `Oui, supprimer`. La même
  confirmation que pour une session du vendredi.
- Après : `Le cours est supprimé.`, en haut de la liste, et le journal le garde.
- Un cours qui n'existe plus, supprimé depuis une page restée ouverte, un identifiant mal formé, ou
  une session du vendredi, qui a son propre écran : `Ce cours n'existe plus : il a peut-être déjà
été supprimé.` Rien n'est supprimé, et rien ne s'écrit au journal : l'action juge au nombre de
  lignes que la base a supprimées.

### Après la publication d'un nouveau cours (étape 19, lot 2)

Un cours créé publié, ou un brouillon publié depuis sa fiche, ramène à la liste avec
`?publie=<identifiant>`. Un bloc s'ouvre en haut : `Le cours est publié.`, puis `Un message pour
annoncer ce cours à votre communauté, par exemple dans WhatsApp. Il est écrit dans chaque langue de
votre page publique, la langue du cours d'abord : ouvrez une langue, puis copiez son texte.`, et un
élément `details` par langue, le premier ouvert, comme sur « À venir » (règle D1 de l'étape 18).
Chaque zone, en lecture seule, porte la langue et le sens de son texte, et son nom dit sa langue dans
celle de l'écran : `Message à copier en allemand`.

```
Salam alaykoum,

Nouveau cours : « Cours du soir », le mardi, de 19:00 à 20:00, Grande salle.
```

Le titre est celui de la langue du message quand le cours y est traduit, sinon celui de sa langue
de saisie. Le rythme est celui de la page publique ; pour un cours à dates précises, ses dates, comme
la liste les écrit (`à des dates précises : lundi 12.10.2026 et lundi 26.10.2026`) : les trois
premières du calendrier, puis `et 1 autre`, quel que soit l'ordre dans lequel on les a écrites. La
liste et le message montraient d'abord les trois premières écrites, et pouvaient taire la première
séance. L'horaire est celui de la liste, avec sa durée.

Le bloc suit l'adresse, et non le geste : `/cours?publie=<identifiant>` le montre pour tout cours
publié de l'organisation, juste après sa publication, mais aussi après un rechargement, depuis un
favori ou si l'on écrit l'adresse à la main. Seuls les cours de l'organisation y sont cherchés. Un
brouillon, un identifiant inconnu ou mal formé, ou celui d'une session du vendredi, n'ont pas de
bloc. Un cours déjà publié qu'on enregistre de nouveau ramène à `/cours`, sans cette adresse, et
donc sans bloc.

### Les pauses, sur le même écran

- Titre `Pauses`, puis `Une pause arrête les séances pendant une période : vacances, Ramadan,
travaux. Elle vaut pour un seul cours, ou pour tous les cours de l'organisation.`
- Chaque pause : le cours ou `Toute l'organisation`, `Du lundi 21.12.2026 au dimanche 03.01.2027`,
  la raison, et le bouton `Supprimer cette pause`. Sans pause : `Aucune pause prévue.`
- **Nouvelle pause** : `Pour quel cours ?`, `Premier jour de la pause`, `Dernier jour de la pause`,
  `Raison (facultatif)` avec l'aide `Elle s'affiche sur la page publique. Exemple : Vacances d'été`,
  puis le bouton `Ajouter la pause`. Les deux champs de date vont du 01.01.1970 au 31.12.2100.
- Après un geste : `La pause est ajoutée.` ou `La pause est supprimée.` ; les erreurs :
  `Choisissez le premier et le dernier jour de la pause.` (aussi pour une date hors de 1970 à 2100),
  `Le dernier jour de la pause vient avant le premier.`, `Ce cours n'existe plus : il a peut-être
déjà été supprimé.` pour une pause d'un cours supprimé depuis l'ouverture de la page, et `Cette
pause n'existe plus : elle a peut-être déjà été supprimée.` pour une pause déjà retirée, qui ne
  s'écrit plus au journal (étape 19, lot 2).

## Nouveau cours, `/cours/nouveau`, et fiche d'un cours, `/cours/<id>`

Le même formulaire. Titre `Nouveau cours`, ou `Modifier le cours : <titre>` sur la fiche, puis
`Remplissez les champs, puis enregistrez. Le résumé ci-dessous montre ce qui sera publié, et
signale ce qui manque.`

La fiche n'ouvre qu'un cours. L'adresse d'une session du vendredi y répond 404, comme un cours
inconnu : la page `Page introuvable`, qu'on l'ouvre ou qu'on y envoie le formulaire. Jusqu'à l'étape
19, le formulaire envoyé à cette adresse faisait un cours de la session. La base refuse maintenant
qu'une ligne change de type (migration 0069, ADR 0033). Une adresse dont l'identifiant est mal formé
répond de même, au lieu d'une erreur 500 (étape 19, lot 2).

### Le résumé, en haut (retour B4)

Une section `Résumé : ce qui sera publié`, une ligne par information : le titre dans chaque langue
de l'organisation, la langue de saisie d'abord (`Titre en français :`), chacun suivi de sa
description quand elle est écrite (`Description en français :`), puis `Public :`, `Jours :` ou
`Dates :`, `Fréquence :`, `Horaire :`, `Salle :`, `Intervenant :`, `Langue d'enseignement :`,
`Premier jour :`, `Dernier jour :` s'il y en a un, et `État :`.

Ce qui manque garde sa ligne, marqué par la couleur, le gras et un souligné pointillé, et une phrase
le dit : `pas encore écrit`, `pas choisis`, `à indiquer`, `pas choisie`. Ce que le serveur
refuserait est marqué `à corriger`, avec la règle : `Horaire : à corriger, de 1 à 120 minutes avant
la prière`, `Dernier jour : à corriger, il tombe avant le premier jour`, `Description en allemand :
à corriger, il manque le titre en allemand`. Pour un cours à dates précises, seules les dates entre
le premier et le dernier jour sont montrées comme publiées ; les autres ont leur ligne, `Dates avant
le premier jour, pas publiées :` ou `Dates après le dernier jour, pas publiées :`, et `Dates : aucune
ne sera publiée` s'il n'en reste aucune. Une date hors des années 1970 à 2100, que le serveur refuse,
se lit de même : le premier jour `pas choisi`, le dernier `Dernier jour : à corriger, choisissez-le
dans le calendrier`, une date précise parmi `Dates à corriger :`.

La ligne d'un champ facultatif, rempli ou non, finit par `(facultatif)`, en gris et sans gras, en
discret (étape 19, lot 2) : chaque description, le titre de chaque autre langue que l'organisation
publie, la salle, l'intervenant et le dernier jour. `Salle : Grande salle (facultatif)`. Laissés
vides, la salle, l'intervenant et le titre d'une autre langue gardent leur ligne, sans marque de
manque : `Salle : pas choisie (facultatif)`, `Intervenant : aucun pour l'instant (facultatif)`,
`Titre en allemand : pas encore écrit, le titre en français s'affichera à sa place (facultatif)`.
Une description vide et un dernier jour vide n'ont pas de ligne, puisque rien n'est publié pour eux :
un cours sans dernier jour continue. Une description à corriger reste marquée comme telle, et
facultative : l'effacer est l'une des deux corrections. Le titre qui lui manque est marqué de même,
`Titre en allemand : pas encore écrit (facultatif)`, sans la phrase du titre qui s'afficherait à sa
place : le serveur refuse le cours tant qu'il manque, et l'écrire est l'autre correction. La première
version du lot lui donnait cette phrase, et le résumé se contredisait d'une ligne à l'autre.
Jusque-là, la salle et l'intervenant laissés vides étaient marqués comme le titre manquant, et le
titre d'une autre langue n'avait pas de ligne tant qu'il n'était pas écrit.

Le résumé est juste sans JavaScript, au rendu du serveur et après un envoi refusé ; avec JavaScript,
il suit la saisie.

### Les erreurs

Un encadré `Le cours n'est pas enregistré. À corriger :`, une phrase par champ, avec un exemple,
dans l'ordre du formulaire, et le formulaire garde ce qui a été tapé. Par exemple :
`Cochez au moins une langue d'enseignement.`, `Avant une prière : de 1 à 120 minutes, en chiffres.
Exemple : 10`, `Cette date n'est pas valable : 31.02.2026. Écrivez chaque date comme ceci :
12.10.2026`. Un cours sans langue d'enseignement cochée est refusé ; avant l'étape 18, il prenait la
langue de saisie sans le dire. Sont refusées aussi, au lieu de disparaître sans un mot : les dates
précises hors de la période (`Ces dates tombent avant le premier jour du cours et ne seraient pas
publiées : 12.10.2026 et 26.10.2026. Choisissez comme premier jour le 12.10.2026 ou un jour plus
tôt. Vous pouvez aussi retirer ces dates.`), et une description sans titre dans sa langue (`La
description en allemand ne peut pas être publiée sans titre dans la même langue. Écrivez aussi le
titre en allemand, ou effacez cette description.`). Avec JavaScript, la page revient sur l'onglet de
la première langue que l'encadré nomme.

Depuis le lot 2 de l'étape 19, une date s'accepte de 1970 à 2100, comme sur « À venir » et le
vendredi : l'an 0000, que PostgreSQL n'a pas, donnait une erreur 500, et un dernier jour au
31.12.9999 faisait tomber le flux agenda de toute l'organisation. Hors de ces années, le premier jour
reçoit `Choisissez le premier jour du cours.`, le dernier `Le dernier jour est illisible.
Choisissez-le dans le calendrier, ou laissez-le vide.`, et une date précise la phrase d'une date qui
n'est pas valable. Une salle supprimée entre-temps, ou qui n'est pas une salle de l'organisation,
reçoit `Cette salle n'existe plus : elle a été supprimée entre-temps. Choisissez une autre salle, ou
« aucune salle ».`, à sa place dans l'ordre du formulaire, avant la période. Le caractère nul, qu'un
formulaire écrit à la main peut envoyer, est retiré de chaque champ, et le reste est gardé.

### Les cadres du formulaire, dans cet ordre

**Titre et description.** Des onglets `Langue du texte`, la langue de saisie marquée
`(langue de saisie)`. Sans JavaScript, il n'y a pas d'onglets : les champs de toutes les langues
sont visibles. Chaque champ porte la langue et le sens de son texte (`lang`, `dir`) : l'arabe se
lit de droite à gauche, et un texte français se lit de gauche à droite dans l'espace en arabe.
`Titre en français (obligatoire)`, avec `Le nom du cours sur la page publique. Exemple : Arabe pour
débutants` ; `Description en français (facultatif)`, avec `Quelques phrases : à qui s'adresse le
cours, ce qu'on y apprend.` ; `Langue de saisie`, avec `La langue dans laquelle vous écrivez. Le
titre dans cette langue est obligatoire. Les autres langues sont facultatives, et rien n'est
traduit automatiquement.`

**Public et langue.** `À qui s'adresse le cours ?`, puis `Langue d'enseignement`, avec `La langue
parlée pendant le cours. Cochez-en une ou plusieurs.` Sur un nouveau cours, la langue de saisie est
cochée d'office, sans JavaScript comme avec. Avec JavaScript, la case suit la langue de saisie quand
on en choisit une autre, tant qu'on n'a pas touché aux cases ; ensuite, elles restent comme on les a
cochées (étape 19, lot 2). Aucune case cochée reste refusé.

**Jours et fréquence.** `Le cours a lieu` : `chaque semaine, ou une semaine sur deux`,
`une fois par mois`, `à des dates précises`. Puis selon le choix : les jours et `Fréquence` (`Une
semaine sur deux : la semaine du premier jour compte comme la première.`) ; `Quel jour de la
semaine ?`, puis `Lequel dans le mois ?`, avec `Exemple : lundi, puis « le premier » : le cours a
lieu le premier lundi de chaque mois.` ; ou `Dates, une par ligne`, avec `Exemple : 12.10.2026`.
Les dates se lisent et s'écrivent `JJ.MM.AAAA`. Elles s'enregistrent dans l'ordre du calendrier,
quel que soit l'ordre de la saisie, et la fiche les montre dans cet ordre (étape 19, lot 2). Pour un
cours à dates précises, le premier jour se remplit tout seul avec la première date, la plus
ancienne : avec JavaScript, pendant la saisie, tant qu'il est vide, et il suit les dates jusqu'à ce
qu'on le choisisse soi-même ; sans JavaScript, le serveur le remplit à l'envoi quand il arrive vide.
Un premier jour choisi n'est jamais remplacé, et des dates avant lui restent refusées.

Un premier jour que le service a pris n'est pas un premier jour choisi, même quand il revient
rempli. Après un envoi refusé pour une autre raison, il revient dans le champ, et il suit encore les
dates, avec ou sans JavaScript : un champ caché, `startsOnFromDates`, le porte, et le serveur le
reprend de la première date tant qu'il revient tel quel. Changé à la main, il ne correspond plus au
champ caché : il est choisi. Dans la première version du lot, il passait pour choisi au renvoi. Une
coquille corrigée dans la date la plus ancienne (`05.10.20266` devenu `05.10.2026`) faisait alors
refuser le cours : la date corrigée tombait « avant le premier jour », un jour que personne n'avait
choisi (relecture du lot 2).

Sans JavaScript, choisir `à des dates précises` ne change pas la page : on l'envoie une première
fois, et elle revient avec le champ des dates. Pour que ces deux envois partent le premier jour
vide, le navigateur ne l'exige pas sans JavaScript (pas de `required`). C'est le serveur qui refuse
un premier jour vide qu'aucune date ne remplit, avec `Choisissez le premier jour du cours.` Avec
JavaScript, le navigateur l'exige, sauf pour un cours à dates précises. Dans la première version du
lot, il l'exigeait toujours, et le formulaire sans script ne partait pas sans premier jour.

**Horaire** (retour C3). `Comment fixer l'heure ?` : `heure fixe`, `après une prière`,
`avant une prière`, avec `Placé par rapport à une prière, le cours suit son heure, qui change au fil
de l'année.`

- Heure fixe : `Heure de début`, `Heure de fin`, `Exemple : 19:00 et 20:30`.
- Après ou avant une prière : `Quelle prière ?` (avec leurs vrais noms, `Maghrib`, `المغرب`),
  `Combien de minutes après la prière ?` (`De 0 à 240. Exemple : 15. Avec 0, le cours commence juste
après la prière.`) ou `Combien de minutes avant la prière ?` (`De 1 à 120. Exemple : 10.`), et
  `Durée du cours, en minutes` (`De 5 à 1440. Exemple : 90 pour 1 h 30.`).

La base garde un décalage signé : « avant une prière » avec 10 minutes s'écrit −10, et un cours à
−10 se rouvre sur « avant une prière » et 10 (ADR 0004, addendum).

Sans JavaScript, changer `Comment fixer l'heure ?` ne change pas la page, comme pour les dates
précises : on l'envoie une première fois, et elle revient avec les champs de l'autre façon. Aucun de
ces champs n'est donc exigé par le navigateur sans JavaScript (pas de `required`), et le serveur dit
ce qui manque : `Indiquez l'heure de début et l'heure de fin. Exemple : 19:00 et 20:30` pour une
heure fixe sans heure, la phrase des minutes et celle de la durée pour une prière. Avec JavaScript,
les champs suivent le choix, et le navigateur exige ceux qui sont à l'écran, comme avant. Jusqu'au
lot 3 de l'étape 19, `Heure de début` et `Heure de fin` étaient toujours exigées : sur une page
rendue pour une heure fixe, heures vides, il fallait taper des heures qui ne servent à rien pour
voir les champs de la prière, et, dans l'autre sens, des minutes pour revenir à une heure fixe.

Les bornes des minutes suivent la même règle. Sans JavaScript, le champ porte celles des deux choix
réunies, de 0 à 240 (`min` et `max`) : il n'arrête que ce qu'aucun des deux choix n'accepte. Sur
une page rendue pour `avant une prière`, passer à `après une prière` ne change pas la page, et le
champ gardait les bornes d'avant la prière, de 1 à 120 : le navigateur refusait d'envoyer 0 minute,
juste après la prière, ou plus de 120 minutes, justes pourtant après une prière, et il fallait
d'abord envoyer des minutes qu'on ne voulait pas. Le serveur garde les bornes de chaque choix, et
refuse ce qui en sort avec la phrase des minutes : `Avant une prière : de 1 à 120 minutes, en
chiffres. Exemple : 10` pour 0 minute avant une prière. Avec JavaScript, les bornes suivent le
choix, de 1 à 120 avant une prière et de 0 à 240 après, comme avant (relecture du lot 3).

Une organisation sans le module des prières n'a pas `Comment fixer l'heure ?` : l'heure fixe est la
seule façon, et il n'y a rien à changer. `Heure de début` et `Heure de fin` y restent donc exigées
par le navigateur, avec ou sans JavaScript, sur un nouveau cours comme sur sa fiche. La première
version du lot 3 les laissait sans `required` sans JavaScript là aussi : des heures vides partaient,
et revenaient avec la phrase du serveur (relecture du lot 3).

**Lieu, intervenant et période.** `Salle (facultatif)`, avec `aucune salle` et `Les salles se créent
dans les réglages, par une personne responsable.` ; `Intervenant (facultatif)`, avec `La personne
qui donne le cours, par son nom ou sa fonction. Exemple : l'imam` ; `Premier jour du cours
(obligatoire)`, avec `Les séances commencent ce jour-là.` ; `Dernier jour du cours (facultatif)`,
avec `Laissez vide si le cours continue sans date de fin.` ; `Publication`, `brouillon, pas encore
sur la page publique` ou `publié, visible sur la page publique`, avec `Un brouillon ne se voit que
dans cet espace. Publiez le cours quand tout est prêt.` Le calendrier des deux champs de date va du
01.01.1970 au 31.12.2100, les bornes que le serveur applique.

**Le bouton** : `Créer le cours`, ou `Enregistrer les modifications` sur la fiche.

## Ce qui reste à reprendre

- Aucun test du dépôt ne pilote les onglets : le retour sur l'onglet de la langue en cause, après
  un refus, n'est prouvé que dans un navigateur, par les relectures.
- Les deux gestes que le formulaire fait avec JavaScript au lot 2 de l'étape 19, la case de la
  langue d'enseignement qui suit la langue de saisie et le premier jour qui suit les dates, ne sont
  pas pilotés par les tests du dépôt non plus. Ils ont été éprouvés dans un vrai Chrome sans
  interface pendant le lot, et restent à ajouter au parcours automatique, avec le premier jour qui
  suit encore les dates après un envoi refusé, tant qu'on ne l'a pas changé à la main.
- Les tests HTTP lisent les champs de l'horaire que le serveur rend sans `required` (étape 19,
  lot 3). Qu'ils le redeviennent une fois la page hydratée, avec JavaScript, ne se voit que dans un
  navigateur : le parcours automatique le vérifie depuis la relecture du lot 3 (retour C3), avec
  JavaScript sur l'écran d'un nouveau cours, et sans JavaScript par un choix de prière envoyé
  heures vidées. Ces deux gestes ont été joués dans un vrai Chrome contre le serveur construit des
  tests, et chacun tombe sur son mutant ; le parcours entier, sur l'image, reste à passer.
- Le parcours automatique ne passe pas non plus, pour l'instant, par les autres gestes du lot 2 dans
  un vrai navigateur : le premier jour laissé vide d'un cours à dates précises, envoyé sans
  JavaScript en deux fois ; `Supprimer ce cours` puis `Oui, supprimer`, avec et sans JavaScript ; le
  bloc `Le cours est publié.` et son message ; la séance annulée, barrée, sur la page publique d'un
  cours. Les tests HTTP lisent ce que le serveur rend pour chacun, et un vrai Chrome les a joués
  pendant la relecture du lot, avec et sans JavaScript.
