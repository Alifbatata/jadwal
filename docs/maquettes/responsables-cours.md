# Les cours, les pauses et le formulaire d'un cours

Décrit après le code, à l'étape 18 (retours B4, C3, et B1, D2, A3 pour ces écrans). Textes :
`apps/web/src/lib/i18n/courses.ts` et `course-form.ts`, dans les cinq langues. Le résumé et le
passage entre la base et l'écran sont dans `apps/web/src/lib/course-form.ts`, le même code pour le
serveur et pour le navigateur.

## La liste des cours, `/cours`

1. Titre de niveau 1 : `Cours`, puis `Les cours de votre organisation. Un cours publié apparaît sur
la page publique du programme. Un brouillon reste dans cet espace.`
2. Le bouton `Ajouter un cours` (avant : `Nouveau cours`).
3. Un bloc par cours : le titre (`Cours sans titre` s'il n'en a pas), l'état (`brouillon`,
   `publié`, `archivé`), le rythme et l'horaire (`un lundi et mercredi sur deux, 10 min avant
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

### Le résumé, en haut (retour B4)

Une section `Résumé : ce qui sera publié`, une ligne par information : le titre dans chaque langue
remplie, la langue de saisie d'abord (`Titre en français :`), puis `Public :`, `Jours :` ou
`Dates :`, `Fréquence :`, `Horaire :`, `Salle :`, `Intervenant :`, `Langue d'enseignement :`,
`Premier jour :`, `Dernier jour :` s'il y en a un, et `État :`.

Ce qui manque garde sa ligne, marqué par la couleur, le gras et un souligné pointillé, et une phrase
le dit : `pas encore écrit`, `pas choisis`, `à indiquer`, `pas choisie`, `aucun pour l'instant`. Le
résumé est juste sans JavaScript, au rendu du serveur et après un envoi refusé ; avec JavaScript, il
suit la saisie.

### Les erreurs

Un encadré `Le cours n'est pas enregistré. À corriger :`, une phrase par champ, avec un exemple,
dans l'ordre du formulaire, et le formulaire garde ce qui a été tapé. Par exemple :
`Cochez au moins une langue d'enseignement.`, `Avant une prière : de 1 à 120 minutes, en chiffres.
Exemple : 10`, `Cette date n'est pas valable : 31.02.2026. Écrivez chaque date comme ceci :
12.10.2026`. Un cours sans langue d'enseignement cochée est refusé ; avant l'étape 18, il prenait la
langue de saisie sans le dire.

### Les cadres du formulaire, dans cet ordre

**Titre et description.** Des onglets `Langue du texte`, la langue de saisie marquée
`(langue de saisie)`. `Titre en français (obligatoire)`, avec `Le nom du cours sur la page
publique. Exemple : Arabe pour débutants` ; `Description en français (facultatif)`, avec `Quelques
phrases : à qui s'adresse le cours, ce qu'on y apprend.` ; `Langue de saisie`, avec `La langue dans
laquelle vous écrivez. Le titre dans cette langue est obligatoire. Les autres langues sont
facultatives, et rien n'est traduit automatiquement.`

**Public et langue.** `À qui s'adresse le cours ?`, puis `Langue d'enseignement`, avec `La langue
parlée pendant le cours. Cochez-en une ou plusieurs.`

**Jours et fréquence.** `Le cours a lieu` : `chaque semaine, ou une semaine sur deux`,
`une fois par mois`, `à des dates précises`. Puis selon le choix : les jours et `Fréquence` (`Une
semaine sur deux : la semaine du premier jour compte comme la première.`) ; `Quelle semaine du
mois ?` et `Quel jour de cette semaine ?` ; ou `Dates, une par ligne`, avec `Exemple : 12.10.2026`.
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

- le résumé n'a pas de ligne pour la description, qui est pourtant publiée ;
- un cours à dates précises dont les dates tombent avant le premier jour est accepté, et le résumé
  les annonce, alors qu'aucune séance ne sera publiée ;
- le résumé montre sans les marquer des valeurs que le serveur refusera (130 minutes avant une
  prière, un dernier jour avant le premier) ;
- les champs de titre et de description ne portent ni `lang` ni `dir` : un texte français se range
  de droite à gauche dans l'espace en arabe ;
- sans JavaScript, les titres des autres langues restent cachés (défaut antérieur) ;
- `Quelle semaine du mois ?` ne dit pas la règle réelle, « le premier lundi du mois » ;
- la liste n'a aucun bouton pour supprimer un cours, et l'état `archivé` n'est pas proposé.
