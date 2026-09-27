# Les cours, les pauses et le formulaire d'un cours

Décrit après le code, à l'étape 18 (retours B4, C3, et B1, D2, A3 pour ces écrans). Textes :
`apps/web/src/lib/i18n/courses.ts` et `course-form.ts`, dans les cinq langues. Le résumé et le
passage entre la base et l'écran sont dans `apps/web/src/lib/course-form.ts`, le même code pour le
serveur et pour le navigateur.

## La liste des cours, `/cours`

1. Titre de niveau 1 : `Cours`, puis `Les cours de votre organisation. Un cours publié apparaît sur
la page publique du programme. Un brouillon reste dans cet espace.`
2. Le bouton `Ajouter un cours` (avant : `Nouveau cours`).
3. Un bloc par cours : le titre (`Cours sans titre` s'il n'en a pas), l'état (`brouillon`
   ou `publié`), le rythme et l'horaire (`un lundi et mercredi sur deux, 10 min avant
Maghrib, pendant 1 h`), puis les valeurs avec leur libellé : `Public : adultes · Salle : Grande
salle · Intervenant : …`, et le lien `Modifier ce cours`, dont les lecteurs d'écran entendent aussi
   le titre.

Sans cours : `Aucun cours pour l'instant. Touchez « Ajouter un cours » pour créer le premier.`

### Les pauses, sur le même écran

- Titre `Pauses`, puis `Une pause arrête les séances pendant une période : vacances, Ramadan,
travaux. Elle vaut pour un seul cours, ou pour tous les cours de l'organisation.`
- Chaque pause : le cours ou `Toute l'organisation`, `Du lundi 21.12.2026 au dimanche 03.01.2027`,
  la raison, et le bouton `Supprimer cette pause`. Sans pause : `Aucune pause prévue.`
- **Nouvelle pause** : `Pour quel cours ?`, `Premier jour de la pause`, `Dernier jour de la pause`,
  `Raison (facultatif)` avec l'aide `Elle s'affiche sur la page publique. Exemple : Vacances d'été`,
  puis le bouton `Ajouter la pause`.
- Après un geste : `La pause est ajoutée.` ou `La pause est supprimée.` ; les erreurs :
  `Choisissez le premier et le dernier jour de la pause.`,
  `Le dernier jour de la pause vient avant le premier.`

## Nouveau cours, `/cours/nouveau`, et fiche d'un cours, `/cours/<id>`

Le même formulaire. Titre `Nouveau cours`, ou `Modifier le cours : <titre>` sur la fiche, puis
`Remplissez les champs, puis enregistrez. Le résumé ci-dessous montre ce qui sera publié, et
signale ce qui manque.`

La fiche n'ouvre qu'un cours. L'adresse d'une session du vendredi y répond 404, comme un cours
inconnu : la page `Page introuvable`, qu'on l'ouvre ou qu'on y envoie le formulaire. Jusqu'à l'étape
19, le formulaire envoyé à cette adresse faisait un cours de la session. La base refuse maintenant
qu'une ligne change de type (migration 0069, ADR 0033).

### Le résumé, en haut (retour B4)

Une section `Résumé : ce qui sera publié`, une ligne par information : le titre dans chaque langue
remplie, la langue de saisie d'abord (`Titre en français :`), chacun suivi de sa description
(`Description en français :`), puis `Public :`, `Jours :` ou `Dates :`, `Fréquence :`,
`Horaire :`, `Salle :`, `Intervenant :`, `Langue d'enseignement :`, `Premier jour :`,
`Dernier jour :` s'il y en a un, et `État :`.

Ce qui manque garde sa ligne, marqué par la couleur, le gras et un souligné pointillé, et une phrase
le dit : `pas encore écrit`, `pas choisis`, `à indiquer`, `pas choisie`, `aucun pour l'instant`. Ce
que le serveur refuserait est marqué `à corriger`, avec la règle : `Horaire : à corriger, de 1 à
120 minutes avant la prière`, `Dernier jour : à corriger, il tombe avant le premier jour`,
`Description en allemand : à corriger, il manque le titre en allemand`. Pour un cours à dates
précises, seules les dates entre le premier et le dernier jour sont montrées comme publiées ; les
autres ont leur ligne, `Dates avant le premier jour, pas publiées :` ou `Dates après le dernier
jour, pas publiées :`, et `Dates : aucune ne sera publiée` s'il n'en reste aucune. Le résumé est
juste sans JavaScript, au rendu du serveur et après un envoi refusé ; avec JavaScript, il suit la
saisie.

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
parlée pendant le cours. Cochez-en une ou plusieurs.`

**Jours et fréquence.** `Le cours a lieu` : `chaque semaine, ou une semaine sur deux`,
`une fois par mois`, `à des dates précises`. Puis selon le choix : les jours et `Fréquence` (`Une
semaine sur deux : la semaine du premier jour compte comme la première.`) ; `Quel jour de la
semaine ?`, puis `Lequel dans le mois ?`, avec `Exemple : lundi, puis « le premier » : le cours a
lieu le premier lundi de chaque mois.` ; ou `Dates, une par ligne`, avec `Exemple : 12.10.2026`.
Les dates se lisent et s'écrivent `JJ.MM.AAAA`.

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

**Lieu, intervenant et période.** `Salle (facultatif)`, avec `aucune salle` et `Les salles se créent
dans les réglages, par une personne responsable.` ; `Intervenant (facultatif)`, avec `La personne
qui donne le cours, par son nom ou sa fonction. Exemple : l'imam` ; `Premier jour du cours
(obligatoire)`, avec `Les séances commencent ce jour-là.` ; `Dernier jour du cours (facultatif)`,
avec `Laissez vide si le cours continue sans date de fin.` ; `Publication`, `brouillon, pas encore
sur la page publique` ou `publié, visible sur la page publique`, avec `Un brouillon ne se voit que
dans cet espace. Publiez le cours quand tout est prêt.`

**Le bouton** : `Créer le cours`, ou `Enregistrer les modifications` sur la fiche.

## Ce qui reste à reprendre

Relevé par la relecture de l'étape 18, non corrigé à la fin de l'étape :

- la liste n'a aucun bouton pour supprimer un cours ; l'action existe côté serveur, sans autre garde
  que l'appartenance. Depuis l'étape 19, la base réserve la suppression d'un cours à la personne
  responsable (migration 0065) : appelée par un éditeur, l'action ne supprime rien, mais écrit
  encore au journal et répond comme si le cours était supprimé. Le bouton et la garde de l'action
  viennent au lot suivant ;
- un cours enregistré avant l'étape 18 peut avoir des dates hors de sa période : sa fiche le
  signale et demande de corriger, mais la liste des cours le montre encore `publié` ;
- aucun test du dépôt ne pilote les onglets : le retour sur l'onglet de la langue en cause, après
  un refus, n'est prouvé que dans un navigateur, par les relectures.
