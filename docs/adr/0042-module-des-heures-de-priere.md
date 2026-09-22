# ADR 0042 : Les heures de prière deviennent un module, éteint par défaut

## Contexte

jadwal est né pour un besoin précis et il a grandi autour de lui. Les heures de prière, l'iqama, la
prière du vendredi et l'ancrage d'un cours sur une prière sont arrivés aux étapes 7 et 8 (ADR 0004,
0033), et ils sont présents partout : un écran de réglages, un écran de saisie, un import CSV, un
bloc en haut de la page publique, une substitution du Dhuhr le vendredi, et un choix de plus dans le
formulaire d'un cours.

Le service s'adresse maintenant à toute organisation qui donne des cours récurrents. Pour une école
de langue, un club ou une association de quartier, ces écrans sont vides et ces questions n'ont pas
d'objet. Un réglage qu'on ne peut pas remplir n'est pas neutre : il fait douter de l'outil.

## La question

Retirer ces fonctions ? Les laisser à tout le monde ? Ou un interrupteur par organisation ?

Les retirer était hors de question : elles marchent, elles sont testées, et elles répondent à un
besoin réel. Les laisser à tout le monde revient à demander à une école de langue de comprendre ce
qu'est une iqama avant de saisir son premier cours.

## Décision

**Un module, par organisation, éteint par défaut : `organization.prayer_module`.**

Six conséquences, chacune décidée plutôt que subie.

### 1. Le drapeau vit sur `organization`, pas sur `prayer_settings`

`prayer_settings` dit **comment** calculer : position, méthode, école, ajustements. C'est une
réponse à une question qui ne se pose que si le module est allumé. Le drapeau, lui, doit être lisible
partout où l'organisation l'est, y compris **sans contexte de session** : la page publique est
désignée par son identifiant d'URL et lue par le rôle public (ADR 0026).

La politique `organization_public_select` donne déjà la ligne entière au rôle public. Poser le
drapeau sur cette table le rend donc lisible par la page publique, le widget et l'API **sans
nouvelle politique, sans jointure et sans requête de plus**. Sur `prayer_settings`, il aurait fallu
ouvrir cette table au public, c'est-à-dire exposer la position saisie à la main d'une organisation
pour répondre à une question binaire.

### 2. Éteindre n'efface rien

Les périodes d'horaires, les jours importés, les réglages de calcul et les sessions du vendredi
restent en base, intacts. Le module rallumé, tout revient tel quel.

Un interrupteur qui détruit n'est pas un interrupteur, c'est une suppression avec une étiquette
rassurante. Et une organisation qui éteint par erreur n'a rien à récupérer dans une sauvegarde.

### 3. La base refuse d'éteindre tant que quelque chose en dépend

Deux choses cessent d'avoir un sens quand le module s'éteint :

- un cours **ancré sur une prière** (`timing_kind = 'prayer'`) n'a plus d'heure calculable ;
- une **session du vendredi** (`kind = 'jumua'`) est une prière.

Laisser éteindre malgré elles produirait une page publique avec des cours sans heure. Le refus est
porté par un déclencheur, `jadwal.refuse_prayer_module_off`, de la même façon que la dernière
personne responsable d'une organisation ne peut pas être retirée (migration 0012) : **la règle tient
quel que soit le code appelant**, et une interface qui oublierait de la vérifier échouerait au lieu
de laisser des données incohérentes.

L'écran des réglages, lui, ne laisse pas la base répondre à sa place : il compte ce qui bloque et le
nomme avant que le bouton ne soit proposé.

### 4. Les organisations qui s'en servent déjà gardent tout

La migration allume le module partout où il sert déjà : une organisation qui a des réglages de
prière, des jours importés, une période d'horaires, une session du vendredi ou un cours ancré sur
une prière le garde allumé. `false` est le défaut **des organisations à venir**, pas une extinction
rétroactive.

Sans cela, la mise à jour aurait vidé la page publique des organisations existantes, et le
déclencheur du point 3 aurait été contourné par la migration elle-même.

### 5. Éteint, le module est absent, et pas vide

Éteint, une organisation ne voit d'heures de prière **nulle part** : ni dans son espace, ni sur sa
page publique, ni dans son widget, ni dans ses flux agenda. Les deux écrans `/prieres` et
`/vendredi` répondent 404, et non une page vide avec un message : une page qui existe pour dire
qu'elle n'a rien à dire reste une page à traduire, à tester et à maintenir. La navigation ne les
propose pas. Le formulaire d'un cours n'offre pas l'ancrage sur une prière.

L'API publique n'a rien à changer : elle n'a jamais exposé d'heures de prière, et une session du
vendredi est un cours que le point 3 interdit de laisser derrière soi.

### 6. Rien n'invite à l'allumer ailleurs que dans les réglages

Pas de bandeau, pas de suggestion sur l'accueil, pas d'étoile sur un menu. L'écran des réglages
porte l'interrupteur et une phrase qui dit ce qu'il ajoute. Une organisation à qui cela ne parle pas
ne doit pas avoir à refuser quelque chose.

## Conséquences

- Une colonne, un déclencheur, une migration qui rattrape l'existant.
- Quatre langues pour le libellé de l'interrupteur, sa phrase d'explication et le message de refus.
- Les tests d'accès couvrent les deux états : ce qui répond 404 éteint, ce qui répond allumé.
- Un test de base couvre le refus d'éteindre, et le prouve en le faisant échouer avec un cours ancré.
- `docs/CADRAGE.md` décrit désormais les heures de prière comme un module optionnel.

## Ce que cette décision ne dit pas

Elle ne dit rien d'un catalogue de modules. Il y en a un, il est prévu pour un besoin connu, et
rien ne justifie aujourd'hui une table `module` avec des lignes et un moteur d'activation. Le jour
où un deuxième module apparaîtra, cette question se posera pour de bon, avec deux exemples sous les
yeux plutôt qu'un seul imaginé.
