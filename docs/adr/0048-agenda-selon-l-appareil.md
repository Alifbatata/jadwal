# ADR 0048 : l'abonnement au calendrier selon l'appareil

- Statut : accepté
- Date : 2026-09-26
- Complète : [0027](0027-pages-publiques.md), [0028](0028-flux-agenda-par-cours.md)

## Contexte

La page « S'abonner au calendrier » proposait le même bouton à tout le monde, un lien `webcal:`, et
trois marches à suivre à la main (iPhone, Android, Outlook). Sa maquette le disait en toutes
lettres : « Elle ne détecte pas l'appareil. […] une détection se trompe, et une détection qui se
trompe cache la bonne réponse. »

Les tests du chef de projet, à l'étape 18, ont montré ce que cela coûte. Sur un téléphone Android,
le lien `webcal:` ne mène à rien d'utile : Google Agenda ne l'ouvre pas. La personne doit lire la
marche à suivre, qui lui dit d'aller sur un ordinateur (retour E1). Et la page promettait une mise à
jour « environ une fois par heure », ce qui est faux pour Google (retour E2).

Deux contraintes. La page publique ne charge aucun script (ADR 0027) : si quelqu'un doit reconnaître
l'appareil, c'est le serveur, dans les en-têtes de la requête. Et l'ADR 0027 refuse « une détection
silencieuse sur l'en-tête du navigateur » : il le dit de la langue, pour qu'un lien partagé s'ouvre
dans la langue de celui qui l'envoie.

## Décision

**Le serveur lit l'appareil**, et la page propose d'abord ce que cet appareil sait ouvrir
(`appareilDe` dans `apps/web/src/lib/public/abonnement.ts`) :

- **`Sec-CH-UA-Platform` d'abord.** Chrome et Edge l'envoient sans qu'on le demande, et réduisent
  l'en-tête `User-Agent` au point qu'un Android n'y dit plus son modèle.
- **Sinon `User-Agent`**, que Safari et Firefox envoient seul. Android est cherché avant Apple : tous
  les agents Android disent « Linux », aucun ne dit « iPhone ».
- **Trois cas, pas un nom d'appareil de plus** :

| Cas                                   | Ce que la page propose en premier                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| iPhone, iPad, Mac                     | le bouton `Ajouter à mon calendrier`, en `webcal:` : l'application Calendrier l'ouvre elle-même                                             |
| Android                               | le bouton `Ajouter à Google Agenda`, vers `calendar.google.com/calendar/render?cid=` suivi de l'adresse `webcal:` encodée                   |
| tout autre appareil, ou aucun en-tête | le choix entre Google Agenda, Outlook (`outlook.live.com/calendar/0/addfromweb?url=…&name=…`), une autre application, et l'adresse à copier |

Safari sur iPad se dit Macintosh : le Mac est rangé avec l'iPhone et l'iPad, parce que les trois
ouvrent `webcal:` de la même façon.

**La page garde toujours une porte de sortie.** Quand elle a choisi pour le visiteur, un lien
`Un autre appareil ? Voir tous les choix` mène au choix complet (`?appareil=tous`), qui ne dépend
d'aucun en-tête. La page d'abonnement garde aussi la section `Ajouter l'adresse à la main`, avec les
trois marches à suivre, et l'adresse `https:` du flux, à copier, est affichée dans tous les cas.

**Deux pages seulement** choisissent selon l'appareil : la page d'abonnement au programme et le bloc
`Ajouter ce cours à mon agenda` de la page d'un cours (flux d'un seul cours, ADR 0028). Le lien
`S'abonner au calendrier` du pied des autres pages ne change pas : il mène à la page d'abonnement.
Le faire changer selon l'appareil ferait varier toutes les pages du programme.

**Ces deux réponses le disent par `Vary: Sec-CH-UA-Platform, User-Agent`.** Leur `Cache-Control`
reste `public` (300 secondes pour l'abonnement, 120 pour un cours). Le choix complet ne porte pas ce
`Vary`.

**Google Agenda et Outlook s'ouvrent dans un nouvel onglet**, annoncé aux lecteurs d'écran : ces
services refusent d'être encadrés, et la page l'est souvent, dans le widget d'un site. Le lien
`webcal:` reste dans l'onglet, puisque c'est une application qui le prend.

**Le délai de Google est dit**, dans les cinq langues : « Google peut mettre jusqu'à 24 heures à
rafraîchir un abonnement. », sous le bouton d'Android, sous le choix de Google et dans les étapes à
la main. Celui de Microsoft aussi, sous le choix d'Outlook et dans ses étapes : « Outlook peut
mettre plus de 24 heures à rafraîchir un abonnement. » L'introduction de la page ne promet plus de
délai ; le bouton d'Apple garde « environ une fois par heure ».

**Sur Android, la page dit ce qu'il faut faire si le bouton ne donne rien.** Sous le bouton :
« Touchez le bouton : il ouvre Google Agenda et lui demande d'ajouter cet agenda. Si Google Agenda
propose de l'ajouter, confirmez. » Puis, puisque l'aide de Google dit qu'on ne s'abonne à un agenda
par son adresse que depuis le navigateur d'un ordinateur, le passage par un ordinateur, avec les
libellés de l'interface de Google (le signe +, « À partir de l'URL », « Ajouter l'agenda »), et
l'adresse à coller. Pour un seul cours, un lien « Page du cours », juste sous son nom, mène à la
page du cours, qui donne l'adresse de ce cours et la même marche à suivre. Sur le choix complet, qui
n'a que des liens, la section à la main ne parle pas d'un bouton.

Les adresses de Google et d'Outlook sont des constantes du code, et non des variables
d'environnement : ce sont les adresses fixes de services publics, pas un réglage d'instance.

### Pourquoi ce n'est pas la détection que l'ADR 0027 refuse

L'ADR 0027 protège une chose : un lien partagé s'ouvre dans la langue choisie. Ici, la langue reste
dans l'adresse et rien d'autre ne la change. L'appareil ne décide que du bouton montré en premier ;
rien n'est caché, puisque le choix complet est à un lien, et les étapes à la main sur la même page.
Et c'est justement ce qu'on veut d'un lien partagé : chacun l'ouvre sur son téléphone, et y trouve
le bouton de son téléphone.

La page ne lit toujours aucun cookie et ne charge toujours rien d'un autre domaine. Les liens vers
Google et Outlook sont des liens que le visiteur choisit de suivre ; en les suivant, il donne à ce
service l'adresse du flux, qui est publique. `apps/web/tests/public.test.ts` refuse toute ressource
d'un autre domaine, et n'admet un lien `<a>` vers ailleurs que pour `calendar.google.com` et
`outlook.live.com`, avec `target="_blank"` et `rel="noopener"`.

## Conséquences

- Un iPhone et un Mac s'abonnent d'un geste, comme avant. Un Android voit le bouton de Google au lieu
  d'un lien qui ne mène à rien.
- Un cache partagé qui respecte `Vary` garde une version par navigateur. Le modèle de `infra/caddy/`
  n'en place aucun devant le service. Un cache qui ignorerait `Vary` pourrait servir à un iPhone la
  page préparée pour un Android : le lien vers le choix complet reste alors la sortie.
- **Aucun des deux liens n'est documenté.** Le 2026-09-26, ni Google ni Microsoft ne décrivent
  `render?cid=` ou `addfromweb` ; les formes retenues sont celles de l'usage établi. L'aide de Google
  dit même qu'on ne s'abonne à un agenda par son adresse que depuis un ordinateur, jamais depuis
  l'application Android : le bouton ouvre la version web de Google Agenda dans le navigateur. Il
  faut l'éprouver sur un vrai téléphone Android avant d'en rien promettre ; l'essai reste à faire
  (`ETAT-PROJET.md`). En attendant, la page ne promet pas que le bouton suffit : elle dit ce qu'il
  demande, puis le passage par un ordinateur.
- La relecture de l'étape 18 a relu l'aide de Google en six langues : elle ne donne aucun délai de
  rafraîchissement. La phrase qui annonce jusqu'à 24 heures n'a donc plus d'appui écrit.
- `outlook.live.com` est l'Outlook des comptes personnels. Un compte de travail ou d'école copie
  l'adresse, et la page le dit.
- La maquette `docs/maquettes/public-agenda.md` décrit désormais ce comportement.

## Statut

Accepté, 2026-09-26. Étape 18, retours E1 et E2 du chef de projet. Révisé le même jour, à la fin
de l'étape : la page servie à Android ne se contredit plus, et le délai d'Outlook est dit.
