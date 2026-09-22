# Vue Semaine

C'est la page d'accueil publique d'une organisation, et la vue par défaut. C'est ce lien que
l'organisation met dans sa bio Instagram et dans son groupe WhatsApp : il doit répondre à une seule
question, « qu'est-ce qu'il y a cette semaine ? », en un coup d'œil, sur un téléphone.

**Lien** : `/m/<identifiant>` dans la langue par défaut de l'organisation, `/m/<identifiant>/<langue>`
sinon. Les filtres et la vue passent par la requête : `?public=kids`, `?vue=semaine`.

## Structure, de haut en bas

1. **L'en-tête commun** (voir `README.md`) : nom, vues, filtres, langues.
2. **La période affichée**, en une ligne discrète : `Du lundi 21 septembre au dimanche 27 septembre`.
3. **Un bloc par jour**, dans l'ordre chronologique, sur sept jours à partir d'aujourd'hui.
   - Titre du jour, en toutes lettres : `lundi 21 septembre`. Le jour courant porte en plus la
     mention `aujourd'hui`.
   - Sous le titre, les séances du jour, triées par heure ; une séance sans heure connue passe en
     dernier.
   - **Un jour sans séance n'est pas affiché.** Sept blocs vides ne disent rien.
4. **Le pied commun**.

## Quand il n'y a rien à afficher

Un seul paragraphe, et il doit dire **pourquoi** :

- pause de toute l'organisation avec motif : `Pas de cours cette semaine : vacances scolaires.`
- pause sans motif saisi : `Pas de cours cette semaine : une pause est en cours.`
- aucun cours publié : `Le programme n'est pas encore publié.`
- cours publiés mais aucune séance cette semaine : `Aucune séance cette semaine.`

Ces quatre phrases sont distinctes à dessein. « Aucune séance » quand l'organisation est en vacances
laisse croire à un oubli ; nommer la pause répond à la question avant qu'elle soit posée.

## Ce que la vue ne fait pas

- Elle ne déplie aucun détail : pour la description d'un cours, on suit son lien.
- Elle n'affiche pas les séances passées du jour. Une séance qui a eu lieu ce matin reste affichée
  jusqu'à la fin de la journée : la retirer à midi ferait douter de la page.
- Elle ne propose pas de navigation « semaine suivante ». La vue Mois est là pour cela.

## Comportements

- Changer de filtre garde la vue et la langue ; changer de langue garde la vue et le filtre.
- Un filtre qui ne laisse rien affiche : `Aucune séance cette semaine pour ce public.`
- Le titre du navigateur est `<Nom de l'organisation> — Cours de la semaine`.
