# 0056 : le poste « Diffuser »

- Statut : accepté
- Date : 2026-11-26
- Met en œuvre : [0052](0052-application-mobile-et-sermon-traduit-en-direct.md),
  [0055](0055-le-relais-du-direct.md)

## Contexte

Le relais du direct existe (ADR 0055) : il reçoit la voix d'un poste, la passe à un traducteur et
distribue ce qui en revient. Il ne connaît ni comptes ni organisations, et n'ouvre un direct que
sur présentation d'un jeton signé. Il manquait l'autre bout : l'écran d'où quelqu'un, à la
mosquée, lance le direct, et le serveur qui signe pour lui.

Cet écran est tenu par une personne debout près de la sono, un vendredi, qui a autre chose à
faire. Il doit tenir en un bouton, dire ce qui se passe, et ne rien coûter s'il est oublié.

Lu dans les documentations officielles le 26 novembre 2026 :

- Un navigateur ne donne le micro qu'à une page servie en HTTPS, et l'en-tête `Permissions-Policy`
  du document peut le lui interdire. Le serveur de jadwal l'interdit sur toutes ses pages.
- La politique de sécurité du contenu gouverne les liaisons WebSocket par `connect-src`, et
  `'self'` n'y vaut pas pour une liaison WebSocket dans tous les navigateurs.
- Ces deux en-têtes appartiennent au document : un navigateur les lit quand il le charge, pas
  quand une application change d'écran sans recharger.
- Le son d'un micro se lit hors du fil de la page, par un `AudioWorklet`, en blocs de
  128 échantillons à la fréquence du contexte.
- Un écran peut demander à rester allumé ; le verrou tombe dès que la page n'est plus visible.

## Décision

### Un écran de l'espace des responsables : `/direct`

Un titre, les langues, un bouton. Pendant le direct : la durée, le niveau du micro, les personnes
à l'écoute par langue, et « Arrêter le direct ». À la fin, une phrase qui dit pourquoi.

Sans l'adresse du relais, `JADWAL_LIVE_URL`, l'écran n'existe pas : ni page, ni lien dans la
navigation. Une adresse sans secret, un secret trop court, une adresse qui n'est pas celle d'un
relais, ou une liaison en clair sous un site en HTTPS arrêtent le serveur au démarrage, comme une
`ORIGIN` fausse (ADR 0051). Un direct à moitié réglé montrerait un bouton qui ne mène nulle part.

### Qui diffuse : tout membre de l'organisation

_Remplacé par l'addendum du 27 novembre 2026 : la personne responsable diffuse d'office, un éditeur
seulement si elle lui en donne l'autorisation, et le super-admin entré par ses pouvoirs aussi._

Responsable ou éditeur, connecté, conditions d'utilisation acceptées. La personne à la sono n'est
pas forcément responsable ; lui donner le rôle d'éditeur suffit.

Le super-admin entré dans une organisation par ses pouvoirs ne diffuse pas : pour lui, l'écran
n'existe pas. La voix d'une organisation est lancée par l'un des siens.

### Le jeton se demande en appuyant, et vit une minute

L'écran demande le jeton au serveur web au moment d'ouvrir la liaison, par une requête à part. Le
serveur prend l'organisation dans la session, jamais dans la requête (ADR 0013), refuse une
demande venue d'un autre site, et écrit une ligne au journal de l'organisation avant de répondre :
on sait qui a lancé un direct, et quand. Le jeton n'est jamais rendu dans une page ni gardé dans
un cache.

Le serveur web et le relais ne partagent aucun fichier : la forme du jeton est écrite des deux
côtés. Un jeton témoin, identique dans les tests des deux programmes, fait tomber l'un ou l'autre
s'ils divergent ; et un test lance le relais lui-même, pour lui présenter un jeton que le serveur
web vient de signer.

### Le micro et la liaison ne s'ouvrent que sur cet écran

Sur la réponse de `/direct`, et sur elle seule, `Permissions-Policy` autorise le micro à la page
elle-même, et `connect-src` reçoit l'origine du relais, écrite en toutes lettres. Partout
ailleurs, le micro reste interdit.

On arrive sur cet écran, et on en repart, par un vrai chargement de document : le lien de la
navigation et ceux de l'écran le demandent. Sans cela, l'écran hériterait des en-têtes de la page
d'où l'on vient, et le navigateur refuserait le micro.

### Le son : capté par un `AudioWorklet`, ramené à 24 kHz dans le navigateur

Le relais ne connaît qu'un format (ADR 0055). Le poste demande au navigateur un contexte à
24 kHz ; un petit découpeur, dans le fil du son, ramène de toute façon à 24 kHz ce qu'il reçoit,
le met en 16 bits et le coupe en morceaux de 200 ms. Chaque morceau part au relais tel quel, avec
son niveau de crête, que l'écran montre : on voit que le micro capte, et l'écran le dit quand il
ne capte rien depuis cinq secondes.

Le micro est demandé en mono, sans annulation d'écho, puisque le poste ne rejoue rien, avec la
réduction de bruit et le gain automatique du navigateur. Ce réglage sera mesuré sur un vrai
sermon.

### L'écran reste allumé, et une coupure ne finit pas le direct

Pendant le direct, l'écran demande à rester allumé : un téléphone qui s'endort coupe son micro.

Quand la liaison tombe en plein direct, le poste se rebranche seul : un jeton neuf, les mêmes
langues, cinq essais en vingt-trois secondes. Le relais garde ceux qui écoutent entre-temps
(ADR 0055). Passé cinq essais, l'écran dit que la liaison est perdue. Un direct qui n'a jamais
commencé n'est pas retenté : l'écran le dit, et la personne réessaie.

### La logique du poste vit hors de la page

Ce que le poste dit au relais, ce qu'il en entend et ce qu'il fait d'une coupure tient dans un
module sans navigateur, à qui l'on donne la liaison, le jeton et les minuteries. La page lui
donne les vrais ; les tests lui en donnent de faux, puis le branchent sur le vrai relais. La page
n'y ajoute que le micro et l'écran.

## Conséquences

- **Tout membre peut faire dépenser.** Un éditeur lance un direct, donc du temps de traduction
  facturé, jusqu'au plafond du mois. Une désignation plus fine, membre par membre, demanderait une
  colonne et un écran de plus ; elle viendra si le besoin se montre.
- **Les langues se choisissent à chaque direct**, toutes cochées au départ. Une organisation qui
  ne veut jamais d'une langue doit la décocher chaque vendredi, et l'oublier coûte une langue de
  plus. Retenir ce choix appartient aux réglages de l'organisation : à faire.
- **Le navigateur retient l'accord donné pour le micro**, pour tout le site. Les autres écrans ne
  peuvent pas s'en servir pour autant : leur en-tête l'interdit, quel que soit cet accord.
- **Le secret du direct est maintenant lu par deux programmes.** Qui lit l'environnement du
  serveur web le tient, et peut ouvrir un direct au nom de n'importe quelle organisation
  (ADR 0055).
- **Un poste qui quitte l'écran arrête le direct** : la liaison tombe avec la page. C'est voulu ;
  l'écran le dit pendant tout le direct.
- **Le découpeur n'est pas un filtre de studio.** Quand le navigateur refuse un contexte à
  24 kHz, il fait la moyenne des échantillons reçus. C'est assez pour de la voix.
- **Seul Chrome est prouvé**, par une épreuve qui lui donne un fichier pour micro. Safari, Firefox
  et un vrai téléphone restent à essayer.
- **Le traducteur est toujours simulé** : avec lui, la voix ne quitte pas le relais.

## Addendum du 27 novembre 2026 : qui diffuse, et vers quelles langues

Le chef de projet a décidé le 27 novembre 2026 de qui gère quoi : un super-admin, qui gère toutes
les organisations et tous les comptes ; une personne responsable par organisation, qui gère tout
pour la sienne, accès des membres compris. Personne ne diffuse sans un compte, et seuls les comptes
qui en ont l'autorisation diffusent. Il a ajouté que chaque organisation choisit les langues vers
lesquelles son sermon est traduit. Deux conséquences de cet ADR tombent : « tout membre peut faire
dépenser » et « les langues se choisissent à chaque direct ».

### L'autorisation de diffuser est portée par l'adhésion

Une colonne de plus sur l'adhésion, fausse par défaut. La personne responsable a ce droit
**d'office**, sans elle ; un éditeur l'a si elle la lui a donnée. Elle la donne et la retire dans l'écran
Membres, d'un clic, sans confirmation : le geste se défait aussitôt, et ne retire l'accès à rien
d'autre. Le super-admin entré dans l'organisation la donne de la même façon, et diffuse lui-même.

La base le tient, et pas seulement l'écran : le rôle applicatif ne modifie cette colonne que pour
une personne responsable, comme le rôle ; et l'invité, qui écrit lui-même son adhésion en entrant
(ADR 0017), ne peut pas s'y donner l'autorisation. Le droit est relu à chaque requête : retiré, il
ne vaut plus à la requête suivante. Chaque geste laisse une ligne au journal de l'organisation.

**Le super-admin entré par ses pouvoirs diffuse aussi.** La première version de cet ADR le
tenait à l'écart (« la voix d'une organisation est lancée par l'un des siens ») ; le chef de
projet a tranché le même jour : il a tous les droits dans toutes les organisations, diffuser
compris. Il n'en est pas membre : c'est son entrée, passkey prouvée, qui le lui donne, comme pour
tout le reste de l'espace (ADR 0025). Son jeton laisse au journal de l'organisation une ligne à
son nom.

### Les langues du direct sont celles de l'organisation

Une liste de plus sur l'organisation, parmi les sept langues du direct, les sept par défaut. La
personne responsable la règle dans les Réglages, qui ne proposent que les langues que le relais de
l'instance sert. Celles qu'elle avait choisies et que le relais ne sert pas restent choisies :
elles reviendront avec un relais qui les sert, et l'enregistrement ne les efface pas en silence.

L'écran « Diffuser » n'offre plus que les langues de l'organisation que le relais sert. S'il n'en
reste aucune, il le dit, sans bouton.

**Le jeton porte ces langues**, et le relais refuse une ouverture qui en demande une autre. Sans
cela, la règle ne tiendrait que par l'écran, et une langue de plus se paie. Le jeton témoin des
deux programmes change en conséquence.

### Ce qui reste

- Les langues par défaut pour toute l'instance, que le super-admin fixerait : plus tard, comme le
  chef de projet l'a dit.
- Une vue du super-admin sur tous les comptes de toutes les organisations : il les gère aujourd'hui
  en entrant dans chacune.
- L'inscription ouverte à tous, décidée le même jour : un chantier à part. Elle changera qui peut
  écrire au service, et ne donnera rien de plus à un compte sans organisation.
