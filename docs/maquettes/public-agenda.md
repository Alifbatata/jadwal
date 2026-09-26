# Page d'abonnement au calendrier

Le flux agenda est la sortie la plus utile et la moins connue : une fois l'abonnement posé, le
programme de l'organisation arrive dans le calendrier du téléphone et se met à jour tout seul. Cette
page existe parce que « copiez cette adresse et collez-la dans votre application de calendrier »
n'aide personne.

**Lien** : `/m/<identifiant>/agenda`, et `/m/<identifiant>/<langue>/agenda`. Le choix complet, quel
que soit l'appareil : `?appareil=tous`.

> **Révisé à l'étape 18 (ADR 0048).** La page ne montrait qu'un bouton `webcal:`, qui ne mène à
> rien d'utile sur Android, et trois marches à suivre. Elle propose maintenant d'abord ce que
> l'appareil du visiteur sait ouvrir, lu par le serveur dans les en-têtes, et garde toujours le
> choix complet à un lien.

## Structure, de haut en bas

1. **Titre de niveau 1** : `S'abonner au calendrier`, puis le nom de l'organisation, en lien vers
   son programme, et les langues qu'elle publie. Pas de vues ni de filtres : le flux porte tout le
   programme.
2. **Un paragraphe** : `Le programme de <Nom de l'organisation> s'ajoute à votre calendrier et se
met à jour tout seul. Rien à réinstaller quand un cours change.` Il ne promet plus de délai :
   Google peut mettre jusqu'à un jour.
3. **Tout le programme**, titre de niveau 2, puis le bloc qui dépend de l'appareil (voir plus bas).
4. **Un seul cours**, titre de niveau 2, quand l'organisation a au moins un cours publié : une
   phrase, puis la liste des cours, un par ligne, chacun en lien vers **son** flux (ADR 0028). Le
   lien et la phrase suivent l'appareil :
   - iPhone, iPad, Mac : le lien `webcal:` du cours, et `Vous pouvez aussi n'ajouter qu'un cours.
Touchez son nom : il s'ajoute seul et se met à jour comme le reste. Son adresse en https figure sur
la page du cours.` ;
   - Android : le lien de Google Agenda pour ce cours, dans un nouvel onglet, et `Vous pouvez aussi
n'ajouter qu'un cours. Touchez son nom : Google Agenda propose de l'ajouter seul, et il se met à
jour comme le reste.` ;
   - ailleurs : la page du cours, à l'ancre `#agenda`, et `Vous pouvez aussi n'ajouter qu'un cours.
Touchez son nom : sa page propose les mêmes choix, pour ce cours seul.`
5. **Ajouter l'adresse à la main**, titre de niveau 2 : `Si le bouton ne fait rien, copiez
l'adresse et suivez les étapes de votre application.`, puis trois titres de niveau 3 dans cet ordre,
   en texte et sans capture d'écran : `Sur iPhone et iPad`, `Sur Android`, `Sur Outlook`. La
   section Android se termine par le délai de Google.
6. **Le pied commun**.

## Le bloc selon l'appareil

Le serveur lit `Sec-CH-UA-Platform`, sinon `User-Agent`, et range le visiteur dans l'un de trois
cas. La réponse porte `Vary: Sec-CH-UA-Platform, User-Agent`.

**iPhone, iPad, Mac.**

- Le bouton `Ajouter à mon calendrier`, en `webcal:`.
- `Touchez le bouton, ou cliquez dessus sur un Mac : l'application Calendrier propose de vous
abonner. Acceptez, et le calendrier se met à jour tout seul, environ une fois par heure.`
- `Ou copiez cette adresse dans votre application de calendrier :`, puis l'adresse `https:`, en
  texte sélectionnable, de gauche à droite même sur la page arabe.
- `Un autre appareil ? Voir tous les choix`, vers `?appareil=tous`.

**Android.**

- Le bouton `Ajouter à Google Agenda`, vers Google Agenda, avec la demande d'abonnement prête, dans
  un nouvel onglet annoncé aux lecteurs d'écran.
- `Touchez le bouton : Google Agenda s'ouvre dans votre navigateur et propose d'ajouter l'agenda.
Confirmez, et il apparaît aussi dans l'application Google Agenda de votre téléphone.`
- `Google peut mettre jusqu'à 24 heures à rafraîchir un abonnement.`, dans un paragraphe à lui.
- L'adresse `https:` à copier, puis `Un autre appareil ? Voir tous les choix`.

**Ailleurs, ou avec `?appareil=tous`.** `Choisissez votre application de calendrier :`, puis
quatre choix, chacun avec sa phrase :

| Choix                   | Ce qu'il fait                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Google Agenda`         | nouvel onglet ; `Il propose d'ajouter l'agenda à votre compte Google.`, puis le délai de Google                                                                                    |
| `Outlook`               | nouvel onglet, Outlook sur le web ; `Outlook sur le web s'ouvre avec l'adresse déjà remplie : choisissez Importer. Avec un compte de travail ou d'école, copiez plutôt l'adresse.` |
| `Une autre application` | lien `webcal:` ; `Calendrier d'Apple, Thunderbird ou toute application qui sait s'abonner à un calendrier : elle s'ouvre et propose l'abonnement.`                                 |
| `Copier l'adresse`      | `Sélectionnez-la, copiez-la, puis collez-la dans votre application, là où elle propose d'ajouter un calendrier par son adresse.`, puis l'adresse `https:`                          |

Le choix complet ne dépend d'aucun en-tête, et sa réponse ne porte pas ce `Vary`.

## Le texte des trois marches à suivre, en français

**Sur iPhone et iPad.** Touchez le bouton ci-dessus : votre iPhone propose d'ajouter le calendrier.
Si rien ne se passe, ouvrez Réglages, puis Applications, Calendrier, Comptes, Ajouter un compte,
Autre, Ajouter un abonnement à un calendrier, et collez l'adresse.

**Sur Android.** Ouvrez Google Agenda sur un ordinateur : l'application du téléphone ne sait pas
ajouter un abonnement. Dans Autres agendas, choisissez À partir de l'URL, collez l'adresse, puis
ajoutez l'agenda. Il apparaîtra ensuite sur votre téléphone. Google peut mettre jusqu'à 24 heures à
rafraîchir un abonnement.

**Sur Outlook.** Ouvrez Outlook sur le web, allez dans Calendrier, Ajouter un calendrier,
S'abonner à partir du Web, collez l'adresse, donnez-lui un nom, puis importez.

Ces textes sont traduits dans les quatre autres langues, avec les noms de menus dans la langue de la
page : un menu français dans une page allemande ne servirait à personne.

## Ce qui reste à reprendre

Relevé par la relecture de l'étape 18, non corrigé à la fin de l'étape :

- la page servie à Android dit, sous le bouton, que Google Agenda s'ouvre dans le navigateur et
  propose l'abonnement, et plus bas, qu'il faut un ordinateur. L'aide de Google dit la seconde
  chose ; le bouton doit être éprouvé sur un vrai téléphone Android, puis les deux phrases
  accordées ;
- `Si le bouton ne fait rien` et `Touchez le bouton ci-dessus` s'affichent aussi sur le choix
  complet, qui n'a que des liens ;
- le choix `Outlook` ne dit pas que Microsoft peut mettre plus de 24 heures à rafraîchir.

## Ce que la page ne fait pas

- Elle ne cache rien : quand elle choisit pour le visiteur, le choix complet est à un lien, et les
  étapes à la main restent sur la page. Une détection se trompe parfois, et elle ne doit jamais
  cacher la bonne réponse.
- Elle ne charge aucun script, et ne lit aucun cookie. Les liens de Google et d'Outlook sont les
  seuls à mener vers un autre domaine.
- Elle ne propose pas de filtrer un flux par public. La question est fermée par l'ADR 0028 : le flux
  par cours répond au vrai besoin, qui est « je veux celui-là ».

## Comportements

- Le titre du navigateur est `S'abonner au calendrier | <Nom de l'organisation>`.
- Le lien `webcal:` et l'adresse `https:` désignent le même fichier, au même chemin.
- Le lien `S'abonner au calendrier` du pied des autres pages mène ici, et ne change pas selon
  l'appareil : sinon toutes les pages du programme varieraient.
