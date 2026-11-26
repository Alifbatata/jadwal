# Vue Aujourd'hui, et les onglets de l'application

Écrite avant le code, à l'étape 24 (ADR 0052 et 0053). La page publique d'une organisation devient
son application : elle s'ouvre, une fois installée, sur ce qui se passe aujourd'hui.

**Lien** : `?vue=aujourdhui` sur la page de l'organisation, dans chaque langue. La vue par défaut
reste la vue Semaine : les liens déjà partagés ne changent pas de sens. C'est l'application
installée qui s'ouvre sur Aujourd'hui.

## Les onglets de l'application

Hors du cadre du widget, l'en-tête porte une navigation principale, juste sous le nom de
l'organisation. Les lecteurs d'écran entendent son nom, `Navigation principale`.

| Onglet        | Ce qu'il ouvre                                         | Quand il est là                        |
| ------------- | ------------------------------------------------------ | -------------------------------------- |
| `Aujourd'hui` | cette vue                                              | toujours                               |
| `Programme`   | la vue Semaine, puis `Tous les cours` et `Mois`        | toujours                               |
| `Prières`     | l'onglet des heures de prière (`public-prieres.md`)    | module des heures de prière allumé     |
| `Infos`       | les informations de l'organisation (`public-infos.md`) | l'organisation en a saisi au moins une |

- L'onglet courant est marqué, comme une vue l'était : fond d'accent, graisse, `aria-current`.
  `Programme` est marqué sur les trois vues du programme, sur la page d'un cours et sur la page
  d'abonnement.
- Sous `Programme`, la liste `Affichage` ne garde que `Semaine`, `Tous les cours` et `Mois`, puis
  les filtres par public. Les autres onglets n'ont ni cette liste ni ces filtres.
- Sur un téléphone, la navigation principale tient en bas de l'écran, à portée du pouce ; sur un
  écran large, elle reste sous le nom. Des liens, sans script.
- **Dans le cadre du widget, rien ne change** : pas de navigation principale, et la liste
  `Affichage` garde ses quatre vues, `Prières` comprise. Le widget encadre un programme, pas une
  application.

## L'installation

Hors du cadre du widget, chaque page publique annonce à un navigateur de quoi l'installer comme une
application. Rien ne s'affiche : ce sont des balises de l'en-tête du document.

- **Le manifeste** de l'organisation, à `/m/<identifiant>/manifest.webmanifest` : son nom, sa
  couleur, et l'adresse où l'application s'ouvre, la vue `Aujourd'hui`, dans la langue de la page
  d'où on l'installe. Installée depuis la page arabe ou la page française, c'est la même
  application. Un lien qui sort des pages de l'organisation s'ouvre dans le navigateur.
- **Les icônes**, dessinées par le serveur à la couleur de l'organisation : une carte claire avec
  trois lignes, sur un fond de cette couleur. 192 et 512 pixels pour le manifeste, une troisième
  dont le fond remplit tout le carré pour les systèmes qui rognent l'icône à leur façon, et 180
  pixels pour un iPhone. L'adresse d'une icône porte la couleur : quand la couleur change,
  l'adresse change.
- **La couleur de la barre du système**, celle de l'organisation.

Le nom et la couleur viennent de la base : un changement est une saisie dans l'écran Réglages, pas
une nouvelle version de quoi que ce soit.

Sur un téléphone Android, le navigateur propose alors « Installer l'application » ou « Ajouter à
l'écran d'accueil ». Sur un iPhone, c'est « Partager », puis « Sur l'écran d'accueil ».

## Structure de la vue, de haut en bas

1. **L'en-tête** : le nom, la navigation principale avec `Aujourd'hui` marqué, le choix de la
   langue. Ni liste `Affichage`, ni filtres par public, ni bloc du vendredi du haut : la vue donne
   elle-même la prière du vendredi quand c'est un vendredi.
2. **L'annonce**, si l'organisation en a saisi une (`public-infos.md`) : un encadré, en texte brut.
3. **Les prières du jour**, quand le module est allumé et que des heures sont publiées :
   - le titre de niveau 2, `Aujourd'hui, vendredi 09.10.2026` ;
   - une phrase qui donne la prochaine prière : `Prochaine prière : Asr à 16:30.`, ou, avec une
     iqama, `Prochaine prière : Maghrib à 19:10, iqama à 19:15.` Un vendredi, tant qu'une session
     n'a pas commencé : `Prochaine prière : prière du vendredi à 12:30 et 13:45.` Après l'Isha :
     `Prochaine prière : Fajr, demain à 05:30.` Sans heure pour demain, la phrase n'est pas écrite ;
   - le tableau du jour, celui de l'onglet `Prières` : `Prière`, `Adhan`, `Iqama`, et le vendredi
     les heures de la prière du vendredi à la place de l'iqama du Dhuhr ;
   - un lien, `Les sept prochains jours`, vers l'onglet `Prières`.
     Sans le module, ou sans heure publiée, ce bloc n'existe pas, et le titre `Aujourd'hui, …` coiffe
     le bloc suivant.
4. **Les séances du jour**, sous le titre de niveau 2 `Au programme aujourd'hui` : les séances
   d'aujourd'hui, triées par heure, écrites comme dans la vue Semaine, annulations et déplacements
   compris. Quand il n'y en a pas, une phrase dit pourquoi :
   - pause avec motif : `Pas de cours aujourd'hui : vacances scolaires.`
   - pause sans motif : `Pas de cours aujourd'hui : une pause est en cours.`
   - aucun cours publié : `Le programme n'est pas encore publié.`
   - sinon : `Aucune séance aujourd'hui.`
5. **La suite**, sous le titre de niveau 2 `À venir` : le premier des six jours suivants qui a des
   séances, avec son nom et sa date en titre de niveau 3, et ses séances. Puis un lien,
   `Voir toute la semaine`, vers la vue Semaine. Sans séance dans les six jours, seul le lien reste.
6. **Le pied commun**.

## Ce que la vue ne fait pas

- Elle ne compte pas à rebours, et rien n'y bouge : la page n'a pas de script. La prochaine prière
  est celle de l'instant où la page a été demandée ; la page n'est gardée en cache qu'une minute.
- Elle n'a pas de filtre par public : elle montre tout ce qui a lieu aujourd'hui.

## Comportements

- Le titre du navigateur est `<Nom de l'organisation> | Aujourd'hui`.
- Changer de langue garde la vue.
- Une séance qui a eu lieu ce matin reste affichée jusqu'à la fin de la journée, comme dans la vue
  Semaine.
- La prochaine prière est la première dont l'adhan n'est pas encore passé, à l'heure de
  l'organisation. Un vendredi où des sessions ont lieu, le Dhuhr est la prière du vendredi : elle
  reste la prochaine tant qu'une session n'a pas commencé, et la phrase ne cite que celles qui
  restent.
