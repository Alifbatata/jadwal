# L'onglet Infos, et l'annonce

Écrit avant le code, à l'étape 24 (ADR 0052). Une organisation dit d'elle ce qu'un visiteur cherche
avant de venir : où elle est, comment la joindre, comment y entrer. Et, quand il le faut, une
annonce du moment.

**Lien** : `?vue=infos` sur la page de l'organisation, dans chaque langue. L'onglet n'existe que si
l'organisation a saisi au moins une information ; sinon, `?vue=infos` montre la vue Semaine, comme
toute vue inconnue.

## Ce que l'organisation saisit

Dans l'écran Réglages (`responsables-reglages.md`), réservé à la personne responsable. Six champs,
tous facultatifs, tous en **texte brut** :

| Champ                  | Ce qu'il contient                                     | Limite          |
| ---------------------- | ----------------------------------------------------- | --------------- |
| `Adresse`              | la rue, le numéro, le code postal, la localité        | 300 caractères  |
| `Téléphone`            | un numéro, tel qu'on le compose                       | 40 caractères   |
| `Adresse électronique` | celle de l'organisation                               | 254 caractères  |
| `Site internet`        | une adresse qui commence par `https://` ou `http://`  | 300 caractères  |
| `Accès`                | transports, stationnement, entrées, accès en fauteuil | 1000 caractères |
| `Annonce`              | une information du moment                             | 500 caractères  |

Ces textes ne se traduisent pas : ils s'affichent tels quels dans les cinq langues, marqués dans la
langue par défaut de l'organisation pour les lecteurs d'écran. Ce que l'organisation écrit ici est
public : l'écran le dit au-dessus du formulaire.

## Structure de l'onglet, de haut en bas

1. **L'en-tête**, avec `Infos` marqué (`Infos`, `Über uns`, `Info`, `Info`, `معلومات`). Ni liste
   `Affichage`, ni filtres, ni bloc du vendredi.
2. **L'annonce**, si elle est saisie : un encadré sous le titre de niveau 2 `Annonce`. Les retours à
   la ligne de la saisie sont gardés.
3. **Adresse**, titre de niveau 2 : l'adresse, ses lignes gardées, puis un lien,
   `Ouvrir dans une carte`. Sur un téléphone Android, le lien ouvre l'application de cartes du
   téléphone ; sur un iPhone, un iPad ou un Mac, Plans ; ailleurs, OpenStreetMap, dans un nouvel
   onglet. C'est un lien que le visiteur choisit de suivre : la page ne charge aucune carte.
4. **Contact**, titre de niveau 2 : le téléphone (un lien `tel:`), l'adresse électronique (un lien
   `mailto:`), le site (un lien, dans un nouvel onglet). Chaque ligne porte son étiquette.
5. **Accès**, titre de niveau 2 : le texte, ses lignes gardées.
6. **Le pied commun**.

Un bloc dont le champ est vide n'est pas affiché. Le bloc `Contact` s'affiche dès qu'une de ses
trois lignes existe.

## L'annonce ailleurs

L'annonce s'affiche aussi en tête de la vue `Aujourd'hui` (`public-aujourdhui.md`), et nulle part
ailleurs : ni dans le programme, ni dans le cadre du widget.

## Comportements

- Le titre du navigateur est `<Nom de l'organisation> | Infos`.
- Aucun script, aucune ressource d'un autre domaine, comme partout côté public.
- Le lien du site ne s'affiche que s'il commence par `https://` ou `http://` : la base le garantit,
  et la page le revérifie.
- L'API publique donne les mêmes champs, sous `info`, dans les réglages d'affichage de
  l'organisation (`docs/API.md`).
