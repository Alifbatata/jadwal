# Les heures de prière de votre organisation

Ce texte s'adresse à la personne qui tient le programme d'une organisation. Il répond à quatre
questions, dans cet ordre : **quelle source choisir**, **comment régler chacune**, **comment placer
un cours avant ou après une prière**, et **ce que voit le public**.

Tout se passe dans l'écran **Heures de prière** de votre espace. Il est réservé à la personne
responsable, et il n'existe que si les heures de prière sont activées dans **Réglages**. L'écran se
lit dans votre langue, choisie en haut de la page.

## Pourquoi c'est important

Certains de vos cours n'ont pas d'heure fixe : « après Maghrib », « 30 min après le Dhuhr »,
« 10 min avant Isha ». Leur heure change chaque jour, et elle change avec vos heures de prière. Tant
que le service ne les connaît pas, ces cours s'affichent « après Maghrib » sans heure : sur votre
page, sur votre site, et dans les calendriers auxquels les gens se sont abonnés.

Il y a aussi une raison plus simple : les heures affichées sur votre panneau sont **les vôtres**.
Personne d'autre ne peut les décider à votre place.

## 1. Une question, trois réponses

L'écran commence par une seule question : **D'où viennent vos heures de prière ?**

| Réponse                           | Quand la choisir                                                    | Ce qu'elle demande                 |
| --------------------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| **Calculées pour votre localité** | vous n'avez ni panneau ni fichier, ou vous voulez remplir les trous | le nom ou le NPA de votre localité |
| **Importées depuis un fichier**   | votre mosquée ou votre fédération vous donne son calendrier         | un fichier CSV                     |
| **Saisies à la main**             | vous avez un panneau, et ce sont ces heures-là qui font foi         | quelques minutes, deux fois par an |

Chaque réponse ne montre que ce qu'elle demande, puis l'**aperçu des sept prochains jours**, puis le
bouton **Enregistrer**. Rien n'est enregistré avant. Sans JavaScript, un bouton **Continuer** affiche
la réponse choisie.

Vous pouvez mélanger les trois. L'écran le dit en une phrase : si plusieurs sources donnent une
heure pour le même jour, **la saisie à la main passe avant le fichier, et le fichier avant le
calcul**.

**Le cas le plus courant** : vous choisissez **Calculées pour votre localité**, vous choisissez votre
localité, et vous réglez vos iqamas une fois, sans date de fin, sous **L'iqama (facultatif)**. C'est
trois minutes de travail, et vous n'y revenez plus.

En bas de l'écran, **Ce que voit le public les sept prochains jours** montre d'où vient chaque
heure : `saisie`, `importée` ou `calculée`. Si une heure ne vient pas d'où vous croyez, cela se voit
là.

## 2. Calculées pour votre localité

### Choisir la localité

1. Dans **Nom ou NPA de la localité**, tapez le nom ou le NPA : `Bienne`, `Lugano` ou `2502`. Les
   accents et les majuscules ne comptent pas. Pour deux localités du même nom, ajoutez le canton :
   `Wil SG`, ou `Buchs (AG)`.
2. Touchez **Chercher**, puis choisissez votre localité dans la liste **Choisissez votre localité**.
   Avec JavaScript, la liste se remplit pendant que vous tapez.
3. L'écran affiche **Localité choisie :** avec son NPA, son nom, son canton et sa position.

La liste est la liste officielle des localités suisses, rangée dans le service : **aucun autre site
n'est interrogé**, ni quand vous cherchez ni plus tard. Sa source est dite à côté du choix : « Liste
officielle des localités : Office fédéral de topographie swisstopo, version du 01.09.2026. ». Sur
l'écran en arabe, tapez le NPA ou le nom en lettres latines.

**Hors de Suisse**, ouvrez le repli **Hors de Suisse** et donnez la latitude et la longitude de
votre organisation en degrés décimaux, par exemple latitude 48.8566 et longitude 2.3522 pour Paris.
Sur une carte en ligne, un clic droit sur l'emplacement affiche ces deux nombres. Si une localité
est déjà choisie, cochez à sa place, dans la liste, la dernière case, **Hors de Suisse : utiliser
la position donnée plus bas** : sinon, c'est la localité qui compte, et non ces deux nombres. Avec
JavaScript, taper une position coche cette case toute seule.

### Vérifier avant d'enregistrer

Touchez **Voir l'aperçu** : les heures des sept prochains jours s'affichent, calculées avec ce que
vous venez de choisir, sans rien enregistrer. Comparez-les à votre panneau :

- un écart constant de quelques minutes se rattrape avec l'**ajustement par prière** ;
- un écart qui varie d'un jour à l'autre veut dire que la méthode n'est pas la bonne.

Les deux réglages sont dans le repli **Méthode de calcul, école et ajustements (facultatif)**. Les
réglages proposés conviennent à la plupart des organisations : en cas de doute, gardez la **Ligue
islamique mondiale**. L'école ne change que l'heure de l'Asr. Puis touchez **Enregistrer**.

## 3. Saisies à la main

### Ce qu'est une période

Une **période**, c'est votre panneau : un nom, des dates, et pour chaque prière l'heure affichée et
l'heure d'iqama.

```
Nom de la période   Hiver 2027
Premier jour        01.11.2026
Dernier jour        (vide : jusqu'à nouvel ordre)

Prière    Heure affichée   Iqama
Fajr                       06:30
Dhuhr                      13:00
Asr                        15 minutes après
Maghrib                    5 minutes après
Isha                       10 minutes après
```

Dans cet exemple, l'organisation n'a saisi **aucune** heure du soleil : elles viennent du calcul ou
de l'import. Elle a seulement dit quand elle appelle la prière. C'est le réglage le plus courant, et
il se fait une fois.

Touchez **Voir l'aperçu** : l'écran montre les sept prochains jours tels qu'ils seraient avec cette
période, sans rien enregistrer. Puis touchez **Enregistrer cette période**. L'aperçu ne montre que
les sept prochains jours : une période qui commence plus tard, un Ramadan dans trois mois par
exemple, n'y apparaît pas encore.

### L'heure affichée et l'iqama

Ce ne sont pas la même chose, et le service garde les deux :

- **L'heure affichée** est celle où la prière entre. C'est un fait astronomique.
- **L'iqama** est celle où vous appelez la prière dans la salle. C'est vous qui la décidez.

Pour chaque prière, l'iqama est **soit une heure fixe** (`06:30`), **soit un nombre de minutes après
l'heure affichée** (`5`). Jamais les deux : l'écran vous le dira.

Quelle forme choisir :

- **Des minutes** suivent le soleil toutes seules, toute l'année. C'est ce qu'on met pour le
  Maghrib.
- **Une heure fixe** ne bouge pas, pas même au changement d'heure de mars et d'octobre. C'est voulu :
  votre panneau ne change pas de lui-même non plus. Vous la corrigerez quand vous le déciderez.

**Vos cours suivent l'iqama.** Un cours « 30 min après Maghrib », dans une organisation dont
l'iqama du Maghrib est cinq minutes après le coucher, commence trente minutes après l'iqama,
c'est-à-dire quand les gens sont dans la salle.

Vos iqamas se règlent aussi sous les deux autres réponses, dans **L'iqama (facultatif)** : les
heures affichées y sont repliées sous **Remplacer aussi les heures affichées**, puisque le calcul ou
le fichier les donnent déjà.

### Le dernier jour

Laissez-le **vide** pour « jusqu'à nouvel ordre ». C'est ce qu'il faut dans la plupart des cas.

Deux périodes ne peuvent pas se chevaucher, et une période sans dernier jour couvre tout ce qui
vient après elle. Pour changer de saison : **fermez** la période en cours à la veille, puis
**ajoutez-en une nouvelle** à partir du lendemain. L'écran refuse le chevauchement et vous dit
pourquoi.

**Copier pour l'année suivante** recopie une période aux mêmes jours, un an plus tard, et la marque
« dates à vérifier » jusqu'à ce que vous l'enregistriez.

### Ne couvrir qu'un mois

C'est permis, et c'est parfois la bonne réponse : une période du 01.03 au 31.03 avec vos heures de
Ramadan, et le reste de l'année qui retombe sur l'import ou le calcul. Le service ne connaît pas les
mois lunaires : vous saisissez des dates civiles, et vous les corrigerez l'année prochaine.

## 4. Importées depuis un fichier

### Le plus simple : partir du modèle

Sous **Importées depuis un fichier**, le lien **Télécharger un modèle des soixante prochains jours**
donne un fichier déjà rempli avec les heures calculées pour votre localité, si vous en avez choisi
une. Ouvrez-le dans un tableur, corrigez ce qui diffère de votre panneau, enregistrez, renvoyez-le.
Rien à comprendre d'un format, rien à retaper qui ne change pas.

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

**Les dates.** Sont acceptées `01.01.2027`, `01/01/2027`, `1-1-2027`, et la forme qui commence par
l'année, `2027-01-01`, celle du modèle. Quand le fichier ne permet pas de trancher entre jour puis
mois et mois puis jour (`03/04/2027`), l'écran le dit et vous laisse choisir dans **Si les dates sont
écrites en chiffres seuls** ; le choix vaut **pour tout le fichier**, jamais ligne par ligne. Un
export mensuel dont la colonne ne contient qu'un quantième (`1`, `2`, `3`…) se lit aussi : indiquez
l'**Année du fichier** et le **Mois du fichier** avant d'envoyer.

**Les heures.** `19:23` est la forme la plus sûre. Sont aussi acceptées `9:23`, `19:23:00`, `19h23`
et `7:23 PM`. Une heure avec des secondes non nulles est refusée : elle signale presque toujours une
colonne mal alignée. Les heures sont **locales** : ne convertissez rien, et ne vous occupez pas du
changement d'heure.

Une Isha après minuit s'écrit `00:41` sur la ligne du **jour de la prière**, pas sur celle du
lendemain.

**Ce qu'un tableur ajoute, et qui ne gêne pas** : le séparateur `;` d'Excel en français, la
tabulation ou la virgule, les guillemets, la marque d'ordre des octets, les fins de ligne Windows, et
les encodages UTF-8, UTF-16 ou Windows-1252. L'écran affiche l'encodage retenu ; si ce n'est pas
celui que vous attendiez, vérifiez avant d'enregistrer.

### Ce qui se passe quand vous envoyez le fichier

Choisissez le fichier dans **Votre fichier**, puis touchez **Lire le fichier**.

**Rien n'est écrit tout de suite.** L'écran vous montre d'abord ce qu'il a lu : combien de jours, du
premier au dernier, les jours manquants, les lignes refusées avec leur numéro et leur raison, et ce
qu'il faut vérifier. Puis l'aperçu de sept jours du fichier, les sept prochains ou, pour un fichier
qui commence plus tard, ses sept premiers, et le bouton **Enregistrer ces N jours**. Tant que vous
ne l'avez pas touché, rien n'a changé, et fermer l'onglet ne laisse rien derrière.

**Refusé** : une date illisible, une date en double, une heure illisible. La ligne est écartée, les
autres passent, et rien n'est deviné.

**Signalé sans être refusé** : un ordre inhabituel des prières dans la journée, ou un écart de plus
de six minutes avec la veille. Le passage à l'heure d'été, qui décale les cinq prières d'une heure le
même jour, est reconnu et ne déclenche rien ; une prière seule qui saute d'une heure, si. Ces cas
sont signalés et non refusés parce qu'ils sont parfois justes : c'est votre calendrier.

### Après l'import

- Un nouvel import **remplace les jours qu'il couvre** et ne touche à aucun autre : vous pouvez
  corriger un mois sans renvoyer l'année.
- L'écran **À venir** vous prévient **trente jours** avant la fin de votre calendrier importé.
- **Retirer des jours importés** efface les jours d'une plage, du **Premier jour à retirer** au
  **Dernier jour à retirer**. Si une localité est choisie, le calcul remplit de nouveau ces jours
  cette nuit, ou tout de suite quand vous enregistrez le calcul.
- Chaque import et chaque retrait apparaît dans le journal des modifications.

## 5. Un cours avant ou après une prière

Dans le formulaire d'un cours, **Comment fixer l'heure ?** propose trois réponses : `heure fixe`,
`après une prière` et `avant une prière`. Pour les deux dernières, choisissez **Quelle prière ?**,
puis le nombre de minutes :

- après une prière, de 0 à 240 minutes ; avec 0, le cours commence juste après la prière ;
- avant une prière, de 1 à 120 minutes.

Le programme écrit alors « 15 min après Maghrib » ou « 10 min avant Maghrib », dans chaque langue de
votre page. Dans les deux cas, le cours suit l'iqama quand vous en avez réglé une, l'heure affichée
sinon.

## 6. Ce que voit le public

Quand les heures de prière sont activées, votre page publique et votre programme sur votre site ont
un onglet **Prières**, à côté de Semaine, Tous les cours et Mois :

- **Aujourd'hui**, avec la date : pour chaque prière, l'heure de l'adhan et celle de l'iqama. Une
  phrase dit ce que sont ces deux mots. Sans iqama réglée, la case montre un tiret.
- **Les sept prochains jours** : une ligne par jour, une colonne par prière.
- **Prière du vendredi** : chaque session, avec son heure, la langue du sermon et la salle. Le
  vendredi, la case du Dhuhr donne les heures de la prière du vendredi.

Les heures sont celles que vous avez réglées ici, par la même règle de priorité : l'onglet ne peut
pas dire une autre heure que votre programme.

Nous n'appelons jamais un service tiers de calendrier de prière, et nous n'en consultons aucun à
votre place.

## Et le vendredi ?

La prière du vendredi ne se règle pas ici : elle a son propre écran, **Prière du vendredi**. Vous y
saisissez une, deux ou trois sessions, avec leur heure et la langue du sermon.

Dès qu'une session existe, elle **remplace le Dhuhr du vendredi** partout, y compris pour un cours
annoncé « après le Dhuhr », qui suit alors la dernière session. C'est ce que font vos fidèles.
