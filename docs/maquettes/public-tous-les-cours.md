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
5. **Les prochaines dates**, au plus cinq : `Prochaines séances : lundi 21 septembre,
mercredi 23 septembre, lundi 28 septembre.` Une séance annulée n'y figure pas ; une séance
   déplacée y figure à sa nouvelle date.
6. **Deux liens**, dans cet ordre : `Voir la page du cours`, `Ajouter à mon agenda`.

Le détail se déplie **sur place**, sans fenêtre modale : c'est le comportement natif de `<details>`,
donc sans JavaScript, et il survit à un rechargement puisque l'élément ouvert est celui que l'URL
désigne (`#cours-<identifiant>`).

## Quand il n'y a rien

`Aucun cours publié pour l'instant.` — et rien d'autre : pas de pause à nommer ici, puisqu'une pause
ne supprime pas un cours, elle en suspend les séances.

## Comportements

- Un cours sans séance à venir reste affiché, avec `Prochaines séances : aucune date à venir.` Il
  existe, il a seulement fini ou pas encore commencé.
- Le titre du navigateur est `<Nom de l'organisation> — Tous les cours`.
