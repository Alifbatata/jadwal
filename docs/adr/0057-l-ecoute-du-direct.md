# 0057 : l'écoute du direct

- Statut : accepté
- Date : 2026-11-27
- Met en œuvre : [0052](0052-application-mobile-et-sermon-traduit-en-direct.md),
  [0055](0055-le-relais-du-direct.md), [0056](0056-le-poste-diffuser.md)

## Contexte

Le relais distribue le direct par organisation et par langue (ADR 0055), et le poste « Diffuser »
l'alimente (ADR 0056). Il manquait la page de celle ou celui qui écoute, sur son téléphone,
pendant le prêche : choisir sa langue, entendre la traduction, lire les sous-titres.

Deux contraintes viennent de l'existant. Les pages publiques sont rendues sans SvelteKit dans le
navigateur (`csr = false`, ADR 0027) : leur seul script est un fichier servi à part, qui garde la
page pour une lecture sans réseau (ADR 0054). Et le relais distribuait le son tel que le
traducteur le rend, du PCM à 48 000 octets par seconde : environ 100 Mo pour un prêche de
35 minutes, sur le forfait de chaque téléphone.

Lu dans les documentations officielles le 27 novembre 2026 : `AudioDecoder`, le seul moyen de
décoder de l'Opus par morceaux dans une page, ne marche pas encore dans tous les navigateurs
courants ; un tampon de son d'une autre
fréquence que celle du contexte est ramené à la sienne à la lecture ; un son qui démarre hors
d'un geste est soumis aux règles de lecture automatique ; un module (`<script type="module">`) est différé
d'office ; la permission de garder l'écran allumé est ouverte à la page elle-même par défaut.

## Décision

### Une vue de la page publique, et un onglet

`?vue=direct`, avec un onglet « Direct » entre Prières et Infos, sous le même en-tête et dans les
mêmes langues que le reste de la page. Elle n'existe que si le direct est allumé sur l'instance
et qu'il reste une langue à offrir : celles que l'organisation a choisies, croisées avec celles
du relais. Sinon l'adresse montre la semaine, comme une vue inconnue. Jamais dans le cadre du
widget, qui encadre un programme.

### Le module d'écoute, servi à part

`/m/ecoute.js`, un module de la même origine, chargé sur cette vue seule : la politique de
sécurité du contenu le laisse passer sans nonce. Le moteur de SvelteKit pèserait plus que toute
la page, pour un bouton. Le module n'importe rien, ne garde rien et ne porte aucun texte : la page
lui donne les siens, dans sa langue. Sans JavaScript, la page le dit, et les commandes, qui ne
feraient rien, restent cachées.

### Les en-têtes : la liaison, jamais le micro

Une page du direct dit au serveur ce qu'elle ouvre (`locals.live`). L'écran « Diffuser » ouvre la
liaison vers le relais et le micro ; la vue d'écoute la liaison seule. Le micro reste interdit
partout ailleurs, la vue d'écoute comprise.

### Le son servi aux téléphones : IMA ADPCM, 4 bits, 24 kHz

Le relais code ce que le traducteur rend, **une fois par morceau et par langue**, et le même
paquet part à chacun ; la page le décode. Quatre fois moins que le PCM : 12 020 octets par
seconde, environ 25 Mo pour 35 minutes. Aucune dépendance de part et d'autre : l'algorithme de
l'IMA tient en quarante lignes. Un paquet témoin, calculé à la main, est écrit dans les tests du
codeur et du décodeur, qui vivent dans deux paquets séparés.

Chaque paquet porte dans son en-tête l'état du codeur à son premier échantillon : il se décode
seul. Le relais peut donc sauter un morceau pour un téléphone en retard sans abîmer la suite, et
le seuil de ce retard se compte en secondes de son codé.

Opus serait encore quatre fois plus léger, mais il demanderait un codeur dans le relais et un
décodeur que tous les navigateurs n'ont pas. Si l'épreuve de charge le demande, le levier suivant
est connu : descendre à 16 kHz, ou Opus. Le poste « Diffuser » continue d'envoyer du PCM : c'est
ce que les services de traduction prennent.

### On ne se branche qu'en appuyant sur « Écouter »

Une page ouverte ne prend ni place sur le relais ni données. Branchée, elle attend le direct s'il
n'a pas commencé ; il commence, le son vient ; il finit, la page le dit et attend le suivant.
Changer de langue rebranche. Une liaison qui tombe se refait seule, cinq essais, d'une à huit
secondes d'écart ; un relais plein ou une langue qu'il ne sert pas ne se réessaient pas.

### La lecture, les sous-titres, l'écran

Les tampons sont mis bout à bout sur l'horloge du contexte de son, avec 300 ms d'avance ; un trou
reprend avec la même avance ; au-delà de deux secondes d'avance, un morceau est jeté, pour que le
direct ne prenne pas de retard. Le contexte naît dans le geste.

Les sous-titres sont le texte du relais : une phrase provisoire, que la suivante remplace, puis
sa forme définitive ; les trois dernières définitives restent à l'écran, et elles seules sont
annoncées aux lecteurs d'écran. La mention « traduction automatique, peut contenir des erreurs »
est toujours visible, avant le bouton.

L'écran reste allumé pendant l'écoute, et la page dit pourquoi : sur un téléphone verrouillé, le
son d'une page web s'arrête (ADR 0052).

### Pas de copie hors réseau

Le travailleur de service ne garde pas cette vue : sans réseau, il n'y a pas de direct, et une
copie dirait « pas de direct » alors qu'un direct passe peut-être.

## Conséquences

- Le relais regarde désormais les octets qu'il distribue : l'addendum de l'ADR 0055 le dit.
- Le son codé perd un peu. Mesuré le 27 novembre 2026, par morceaux de 200 ms, codeur du relais et
  décodeur de la page : 42 dB de rapport signal sur bruit sur une voix de synthèse, 40 dB sur un
  son pur, 16 dB sur du bruit blanc, le pire cas d'un codage qui prédit l'échantillon suivant ;
  le tout en quelques millisecondes de calcul par seconde de son. Les tests exigent 25 dB sur la
  voix. L'oreille en jugera sur un vrai prêche, au chantier 4.
- Sur un iPhone, rien ne garantit le son écran verrouillé, et le bouton du silence peut couper une
  page web ; la page demande au navigateur, là où il le sait, de la traiter comme un média. La
  preuve sur un vrai iPhone reste à faire ; le téléphone d'essai du chef de projet est un Android.
- Une organisation dont le direct est allumé montre un onglet « Direct » même quand elle ne diffuse
  jamais : un réglage pour le cacher n'existe pas encore.
- La vue d'écoute a son propre script : la promesse d'une page publique sans JavaScript ne vaut
  plus pour elle, et elle seule.
