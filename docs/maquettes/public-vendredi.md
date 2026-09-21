# La prière du vendredi, côté public

C'est l'information la plus cherchée sur la page d'une mosquée, et c'est celle qui se contredit le
plus entre les canaux. Elle doit se lire sans faire défiler, sans cliquer, et sans se demander
laquelle des deux sessions est la bonne.

Une mosquée tient **une, deux, parfois trois sessions** le vendredi, à des heures différentes et
dans des langues différentes — par exemple une première à 12:10 en arabe et en français, une seconde
à 13:30 en arabe seulement. Les horaires changent selon la saison.

## Où le bloc se place

**Tout en haut, juste après le nom de l'organisation, avant les trois vues.** C'est la seule chose
qui passe devant la navigation, et c'est délibéré : quelqu'un qui ouvre le lien un jeudi soir
cherche cela.

Ordre exact de la page publique, dans les trois vues :

1. le nom de l'organisation ;
2. **le bloc du vendredi** ;
3. les trois vues, les filtres par public, les langues ;
4. le contenu de la vue ;
5. le pied commun.

## Le bloc

Titre de niveau 2 : `Prière du vendredi`.

Puis **une ligne par session**, dans l'ordre choisi par la mosquée (première, deuxième, troisième) :

```
Prière du vendredi
12:10 · arabe et français · Grande salle
13:30 · arabe · Grande salle
```

Chaque ligne, dans cet ordre :

1. **L'heure de début**, en `HH:MM`. Toujours une heure fixe : une session du vendredi ne s'ancre
   jamais sur une prière, c'est elle qui remplace le Dhuhr.
2. **Les langues du sermon**, en toutes lettres et dans la langue de la page : `arabe et français`,
   `arabe`, `français, allemand et arabe`. Jamais de codes, jamais de drapeaux.
3. **La salle**, si elle est renseignée.

Trois lignes au plus, donc. Pas de description, pas de nom d'intervenant, pas de bouton. Qui veut
le détail suit le lien de la session, qui existe comme celui d'un cours.

### Ce que le bloc ne dit pas

- **Pas de date.** Le bloc décrit ce qui se passe chaque vendredi, pas le prochain vendredi. Une
  date donnerait à croire que la semaine suivante sera différente.
- **Pas l'heure du Dhuhr.** Quand des sessions existent, elles la remplacent : l'afficher à côté
  ferait exactement la contradiction que ce bloc doit supprimer.
- **Pas de mention d'absence.** Une mosquée qui n'a pas saisi ses sessions n'a pas de bloc, et rien
  ne dit qu'il en manque un : un visiteur n'a pas à connaître nos étapes.

### Quand une session est annulée ou déplacée

Le bloc décrit le rythme habituel et ne porte donc **aucune exception**. Une session annulée ce
vendredi-là, ou déplacée, se lit dans la vue Semaine, là où sont toutes les exceptions — barrée,
avec `Annulé` ou `Date exceptionnelle`, exactement comme une séance de cours.

C'est un choix : un bloc qui changerait chaque semaine ne serait plus une réponse, il serait une
question de plus.

## Dans la vue Semaine

Les sessions apparaissent **aussi** à leur place, dans le bloc du vendredi, triées à leur heure
parmi les cours de ce jour-là. Elles s'affichent comme une séance ordinaire, avec une seule
différence : le mot qui introduit les langues.

```
vendredi 25 septembre
12:10 – 12:50   Prière du vendredi   Ouvert à tous · Grande salle · sermon en arabe et français
13:30 – 14:10   Prière du vendredi   Ouvert à tous · Grande salle · sermon en arabe
19:10 – 20:10   Tafsir du vendredi   Ouvert à tous · Grande salle
```

Le titre est celui que la mosquée a saisi, dans la langue demandée, avec le même repli que pour un
cours. Le libellé `sermon en …` est le nôtre, traduit dans les quatre langues d'interface : c'est
le mot juste, et « langue d'enseignement » ne l'est pas ici.

Répéter les sessions en haut **et** dans le vendredi est voulu : le bloc du haut répond à la question
sans faire défiler, la vue Semaine les remet dans leur journée avec leurs exceptions.

## Dans les autres vues et les autres sorties

- **Tous les cours** : les sessions du vendredi ont leur propre groupe, en tête, sous le titre
  `Prière du vendredi`. Elles ne sont pas mêlées aux cours, dont le rythme se lit autrement.
- **Mois** : elles apparaissent dans la journée du vendredi, comme dans la vue Semaine.
- **Page d'une session** : la même page qu'un cours, à son propre lien, avec les prochaines dates et
  l'abonnement au calendrier.
- **Flux agenda** : elles sont dans le flux de l'organisation, et chacune a le sien, comme un cours.
  Ce sont des événements récurrents ordinaires, à heure fixe.
- **Message de la semaine** : elles ouvrent le message du vendredi, avant les cours de ce jour.

## Accessibilité et langues

Le bloc est une `section` avec son titre de niveau 2, placée avant la navigation dans l'ordre du
document : un lecteur d'écran la rencontre en premier, ce qui est l'ordre voulu. En arabe, le bloc
suit l'écriture de droite à gauche comme le reste de la page, avec des chiffres latins.
