# Les heures de prière de votre mosquée

Ce texte s'adresse à la personne qui tient le programme d'une mosquée. Il répond à trois questions,
dans cet ordre : **quelle source choisir**, **comment saisir vos heures**, **comment importer un
calendrier**.

Tout se passe dans l'écran **Prières** de votre espace.

## Pourquoi c'est important

Certains de vos cours n'ont pas d'heure fixe : « après Maghrib », « 30 min après le Dhuhr ». Leur
heure change chaque jour, et elle change avec vos heures de prière. Tant que le service ne les
connaît pas, ces cours s'affichent « après Maghrib » sans heure — sur votre page, sur votre site, et
dans les calendriers auxquels les gens se sont abonnés.

Il y a aussi une raison plus simple : les heures affichées sur votre panneau sont **les vôtres**.
Personne d'autre ne peut les décider à votre place.

## 1. Quelle source choisir

Trois sources, et vous pouvez les mélanger. **Celle du haut gagne toujours.**

| Source                    | Quand la choisir                                                 | Ce qu'elle demande                 |
| ------------------------- | ---------------------------------------------------------------- | ---------------------------------- |
| **Vos horaires saisis**   | vous avez un panneau, et ce sont ces heures-là qui font foi      | quelques minutes, deux fois par an |
| **Un calendrier importé** | votre fédération vous donne un fichier, ou vous tenez un tableur | un fichier CSV                     |
| **Le calcul**             | vous n'avez ni l'un ni l'autre, ou vous voulez remplir les trous | la position de la mosquée          |

**Le cas le plus courant** : vous saisissez vos iqamas une fois, sans date de fin, et vous laissez le
calcul donner les heures du soleil. C'est trois minutes de travail, et vous n'y revenez plus.

**Si vos heures sont particulières** : saisissez-les, ou importez-les. Ce que vous donnez passe avant
le calcul, toujours.

L'écran vous montre, pour les **sept prochains jours**, d'où vient chaque heure : `saisi`, `importé`
ou `calculé`. Si une heure ne vient pas d'où vous croyez, cela se voit là.

## 2. Saisir vos horaires

### Ce qu'est une période

Une **période**, c'est votre panneau : un nom, des dates, et pour chaque prière l'heure affichée et
l'heure d'iqama.

```
Nom          Hiver 2027
À partir du  1er novembre 2026
Jusqu'au     (vide — jusqu'à nouvel ordre)

Prière    Heure affichée   Iqama
Fajr                       06:30
Dhuhr                      13:00
Asr                        + 15 min
Maghrib                    + 5 min
Isha                       + 10 min
```

Dans cet exemple, la mosquée n'a saisi **aucune** heure du soleil : elles viennent du calcul ou de
l'import. Elle a seulement dit quand elle appelle la prière. C'est le réglage le plus courant, et il
se fait une fois.

### L'heure affichée et l'iqama

Ce ne sont pas la même chose, et le service garde les deux :

- **L'heure affichée** est celle où la prière entre. C'est un fait astronomique.
- **L'iqama** est celle où vous appelez la prière dans la salle. C'est vous qui la décidez.

Pour chaque prière, l'iqama est **soit une heure fixe** (`06:30`), **soit un nombre de minutes après
l'heure affichée** (`+ 5 min`). Jamais les deux : l'écran vous le dira.

Quelle forme choisir :

- **Un décalage** suit le soleil tout seul, toute l'année. C'est ce qu'on met pour le Maghrib.
- **Une heure fixe** ne bouge pas, pas même au changement d'heure de mars et d'octobre. C'est voulu :
  votre panneau ne change pas de lui-même non plus. Vous la corrigerez quand vous le déciderez.

**Vos cours suivent l'iqama.** Un cours « 30 min après Maghrib », dans une mosquée dont l'iqama du
Maghrib est cinq minutes après le coucher, commence trente minutes après l'iqama — c'est-à-dire
quand les gens sont dans la salle.

### La date de fin

Laissez-la **vide** pour « jusqu'à nouvel ordre ». C'est ce qu'il faut dans la plupart des cas.

Deux périodes ne peuvent pas se chevaucher, et une période sans fin couvre tout ce qui vient après
elle. Pour changer de saison : **fermez** la période en cours à la veille, puis **ajoutez-en une
nouvelle** à partir du lendemain. L'écran refuse le chevauchement et vous dit pourquoi.

### Ne couvrir qu'un mois

C'est permis, et c'est parfois la bonne réponse : une période du 1er au 31 mars avec vos heures de
Ramadan, et le reste de l'année qui retombe sur l'import ou le calcul. Le service ne connaît pas les
mois lunaires — vous saisissez des dates civiles, et vous les corrigerez l'année prochaine.

## 3. Importer un calendrier

### Le plus simple : partir du modèle

L'écran d'import propose **Télécharger un modèle des soixante prochains jours**, déjà rempli avec vos
réglages actuels. Ouvrez-le dans un tableur, corrigez ce qui diffère de votre panneau, enregistrez,
renvoyez-le. Rien à comprendre d'un format, rien à retaper qui ne change pas.

### Le fichier

Un CSV : une ligne d'en-tête, puis une ligne par jour.

```
date;fajr;dhuhr;asr;maghrib;isha
2027-01-01;06:26;12:35;14:34;16:52;18:37
2027-01-02;06:26;12:36;14:35;16:53;18:38
```

Un exemple complet est là : [`calendrier-prieres-exemple.csv`](calendrier-prieres-exemple.csv).

**Les colonnes.** L'ordre n'a pas d'importance : c'est le nom de l'en-tête qui compte, lu sans tenir
compte de la casse ni des accents. Plusieurs orthographes sont reconnues :

| colonne   | noms acceptés                                      |
| --------- | -------------------------------------------------- |
| `date`    | `date`, `jour`, `day`, `tag`                       |
| `fajr`    | `fajr`, `fadjr`, `fadjer`, `sobh`, `subh`, `imsak` |
| `dhuhr`   | `dhuhr`, `duhr`, `zuhr`, `dohr`, `dhohr`, `midi`   |
| `asr`     | `asr`, `assr`, `aser`                              |
| `maghrib` | `maghrib`, `maghreb`, `magrib`, `coucher`          |
| `isha`    | `isha`, `icha`, `ishaa`, `ichaa`, `isya`           |

Une colonne de lever du soleil (`shuruq`, `chourouk`, `sunrise`, `lever`) est reconnue **et
ignorée** : le service ne s'en sert pas, sa présence n'est pas une erreur. Toute autre colonne est
ignorée de la même façon.

**Les dates.** `2027-01-01` est la forme la plus sûre. Sont aussi acceptées `01/01/2027`,
`01.01.2027` et `1-1-2027`. Quand le fichier ne permet pas de trancher entre jour/mois et mois/jour —
`03/04/2027` —, l'écran le dit et vous laisse choisir ; le choix vaut **pour tout le fichier**,
jamais ligne par ligne. Un export mensuel dont la colonne ne contient qu'un quantième (`1`, `2`,
`3`…) se lit aussi : indiquez l'année et le mois avant d'envoyer.

**Les heures.** `19:23` est la forme la plus sûre. Sont aussi acceptées `9:23`, `19:23:00`, `19h23`
et `7:23 PM`. Une heure avec des secondes non nulles est refusée : elle signale presque toujours une
colonne mal alignée. Les heures sont **locales** : ne convertissez rien, et ne vous occupez pas du
changement d'heure.

Une Isha après minuit s'écrit `00:41` sur la ligne du **jour de la prière**, pas sur celle du
lendemain.

**Ce qu'un tableur ajoute, et qui ne gêne pas** : le séparateur `;` d'Excel en français, la
tabulation ou la virgule, les guillemets, la marque d'ordre des octets, les fins de ligne Windows, et
les encodages UTF-8, UTF-16 ou Windows-1252. L'écran affiche l'encodage retenu ; si ce n'est pas
celui que vous attendiez, vérifiez avant de confirmer.

### Ce qui se passe quand vous envoyez le fichier

**Rien n'est écrit tout de suite.** L'écran vous montre d'abord ce qu'il a compris : combien de
jours, de quelle date à quelle date, les jours manquants, les lignes refusées avec leur numéro et
leur raison, et les avertissements. Vous confirmez, ou vous ne confirmez pas. Tant que vous n'avez
pas confirmé, rien n'a changé, et fermer l'onglet ne laisse rien derrière.

**Refusé** : une date illisible, une date en double, une heure illisible. La ligne est écartée, les
autres passent, et rien n'est deviné.

**Signalé sans être refusé** : un ordre inhabituel des prières dans la journée, ou un écart de plus
de six minutes avec la veille. Le passage à l'heure d'été, qui décale les cinq prières d'une heure le
même jour, est reconnu et ne déclenche rien ; une prière seule qui saute d'une heure, si. Ces cas
sont signalés et non refusés parce qu'ils sont parfois justes : c'est votre calendrier.

### Après l'import

- Un nouvel import **remplace les jours qu'il couvre** et ne touche à aucun autre : vous pouvez
  corriger un mois sans renvoyer l'année.
- L'écran d'accueil vous prévient **trente jours** avant la fin de votre calendrier importé.
- Vous pouvez retirer les jours importés d'une plage ; le calcul les reprend aussitôt.
- Chaque import et chaque retrait apparaissent dans le journal des modifications.

## 4. Le calcul, en dernier recours

Saisissez la position de la mosquée en degrés décimaux, choisissez la méthode, et regardez l'aperçu
des sept prochains jours **avant** d'enregistrer. Comparez-le à votre panneau : un écart constant de
quelques minutes se rattrape avec l'ajustement par prière ; un écart variable veut dire que la
méthode n'est pas la bonne.

Il n'y a **pas de recherche d'adresse** : le champ de position n'interroge aucun service extérieur,
et c'est voulu. Les coordonnées de votre mosquée se lisent sur n'importe quelle carte en ligne, en
faisant un clic droit sur son emplacement.

Nous n'appelons jamais Mawaqit, et nous ne le consultons jamais à votre place.

## Et le vendredi ?

La prière du vendredi ne se règle pas ici : elle a son propre écran, **Vendredi**. Vous y saisissez
une, deux ou trois sessions, avec leur heure et la langue du sermon.

Dès qu'une session existe, elle **remplace le Dhuhr du vendredi** partout — y compris pour un cours
annoncé « après le Dhuhr », qui suit alors la dernière session. C'est ce que font vos fidèles.
