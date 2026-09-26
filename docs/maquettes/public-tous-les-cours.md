# Vue Tous les cours

La réponse à une autre question que la vue Semaine : « qu'est-ce qui existe, et à quel rythme ? »
C'est la vue qu'on consulte en septembre pour choisir un cours à l'année, pas celle qu'on consulte
le mardi soir.

**Lien** : `?vue=cours` sur la page de l'organisation.

## Structure, de haut en bas

1. **L'en-tête commun**.
2. **Les cours groupés par rythme**, dans cet ordre, un groupe par titre de niveau 2 :
   1. `Chaque semaine`
   2. `Une semaine sur deux`
   3. `Chaque mois`
   4. `À des dates précises`
3. **Le pied commun**.

Un groupe sans cours n'apparaît pas.

## Comment un cours s'affiche dans la liste

Chaque cours est un bloc `<details>` replié. Le résumé, toujours dans cet ordre :

1. **Le titre**, en gras.
2. **Le rythme en clair** : `le lundi et mercredi`, `un mardi sur deux`,
   `le dernier samedi du mois`, `à des dates précises`.
3. **L'horaire** : `de 19:00 à 20:30`, ou `après Maghrib` pour un cours ancré.
4. **Le public**, en un mot.

Déplié, le bloc ajoute, dans cet ordre, en sautant ce qui est vide :

1. **La description**.
2. **Le lieu** : `Salle : Grande salle`.
3. **L'intervenant** : `Intervenant : Amina Cherif`.
4. **Les langues d'enseignement** : `Enseigné en français et arabe`.
5. **Les prochaines dates**, au plus trois, en une phrase qui vient entière du dictionnaire,
   ponctuation comprise : `Prochaines séances : lundi 21.09.2026, mercredi 23.09.2026, lundi
28.09.2026`. L'espace avant les deux-points n'existe qu'en français (`Upcoming sessions: …`),
   l'allemand sépare les dates par un point-virgule, puisqu'une virgule suit déjà le nom du jour
   (`Nächste Termine: Montag, 21.09.2026; …`), et l'arabe par `،`. Une séance annulée n'y figure
   pas ; une séance déplacée y figure à sa nouvelle date, et plus à l'ancienne (étape 18).
6. **Un lien** : `Page du cours`, vers la page de ce cours. Avant l'étape 18, il disait `Cours`, et
   se lisait `Courses` en anglais.

Le détail se déplie **sur place**, sans fenêtre modale : c'est le comportement natif de `<details>`,
donc sans JavaScript, et il survit à un rechargement puisque l'élément ouvert est celui que l'URL
désigne (`#cours-<identifiant>`).

## Quand il n'y a rien

`Aucun cours publié pour l'instant.`, et rien d'autre : pas de pause à nommer ici, puisqu'une pause
ne supprime pas un cours, elle en suspend les séances.

## Comportements

- Un cours sans séance à venir reste affiché, avec `Aucune date à venir.` Il existe, il a seulement
  fini ou pas encore commencé.
- Le titre du navigateur est `<Nom de l'organisation> | Tous les cours`.
