# Vue Semaine

C'est la page d'accueil publique d'une organisation, et la vue par défaut. C'est ce lien que
l'organisation met dans sa bio Instagram et dans son groupe WhatsApp : il doit répondre à une seule
question, « qu'est-ce qu'il y a cette semaine ? », en un coup d'œil, sur un téléphone.

**Lien** : `/m/<identifiant>` dans la langue par défaut de l'organisation, `/m/<identifiant>/<langue>`
sinon. Les filtres et la vue passent par la requête : `?public=kids`, `?vue=semaine`. Une langue que
l'organisation ne publie pas, `/m/<identifiant>/en` par exemple, renvoie (`307`) vers la même page à
l'adresse courte, dans la langue par défaut, filtres gardés (27.09.2026) ; la page d'abonnement et
celle d'un cours font de même.

## Structure, de haut en bas

1. **L'en-tête commun** (voir `README.md`) : nom, vues, filtres, langues.
2. **La période affichée**, en une ligne discrète, en dates seules : `Du 21.09.2026 au 27.09.2026`
   (étape 18 ; chaque jour, plus bas, porte déjà son nom).
3. **Un bloc par jour**, dans l'ordre chronologique, sur sept jours à partir d'aujourd'hui.
   - Titre du jour, le nom du jour puis la date : `lundi 21.09.2026`. Le jour courant porte en plus
     la mention `aujourd'hui`.
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
- Le titre du navigateur est `<Nom de l'organisation> | Cours de la semaine`.
