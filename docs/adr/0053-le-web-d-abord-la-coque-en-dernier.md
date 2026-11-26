# 0053 : le web d'abord, la coque des magasins en dernier

- Statut : accepté
- Date : 2026-11-26
- Complète et corrige : [0052](0052-application-mobile-et-sermon-traduit-en-direct.md)

## Contexte

L'ADR 0052 fait paraître l'application sur l'App Store et sur Google Play dès sa première version,
et la règle pour une seule organisation : son nom, son icône et sa couleur sont des variables de
construction.

Le lendemain, le chef de projet a précisé quatre points.

- Les comptes des magasins ne s'ouvriront que lorsque tout le reste sera terminé.
- L'application doit marcher sur tous les appareils, et aussi comme site, pour les ordinateurs.
- La première organisation changera sans doute de nom et de lieu.
- D'autres organisations viendront plus tard.

Deux coques natives étaient en balance. Capacitor enveloppe une interface web. Expo demande une
interface écrite pour lui, dans un autre outil que le reste du dépôt.

Lu dans les documentations officielles le 26 novembre 2026 :

- Capacitor 8 construit pour Android avec Android Studio, et pour iOS avec macOS et Xcode. Son
  réglage `server.url`, qui charge un site distant, « n'est pas prévu pour la production ».
- Apple attend d'une application qu'elle soit plus qu'un site emballé (règle 4.2 de ses consignes).
- Un navigateur de la famille de Chrome propose d'installer un site qui sert un manifeste (un nom,
  des icônes de 192 et 512 pixels, une adresse de départ, un mode d'affichage) en HTTPS. Le
  travailleur de service n'est plus exigé pour installer : il sert à lire sans réseau.
- Les rapports de bogues de WebKit disent qu'un site installé sur iPhone peut perdre le son quand
  l'écran se verrouille.

## Décision

### Une seule interface, celle du web

L'application est l'interface que sert jadwal. Elle marche dans tout navigateur, sur téléphone,
tablette et ordinateur, et elle s'installe depuis le navigateur : un manifeste par organisation,
et un travailleur de service qui garde le dernier programme reçu.

Il n'y a pas de seconde interface. Le dossier `apps/mobile`, annoncé par l'ADR 0052, ne contiendra
que la coque.

### La coque native vient à l'étape 26

Elle enveloppe cette même interface, embarquée dans l'application et non chargée à distance, et lui
ajoute ce qu'un navigateur ne donne pas : l'écoute qui se poursuit écran verrouillé. La candidate
est Capacitor. Nous écartons Expo, parce qu'il demanderait d'écrire l'interface une seconde fois et
ne donnerait pas le site. Le choix se confirme à l'étape 26, sur une coque d'essai, quand les
comptes des magasins existent.

L'application iPhone se construira hors du poste de travail, qui n'est pas un Mac.

### Rien de propre à une organisation n'est figé dans une construction

Le nom, le lieu, la couleur et les informations d'une organisation viennent du serveur. Un
changement de nom ou d'adresse est une saisie, pas une nouvelle version de l'application.

Chaque organisation a son adresse, et cette adresse est son application. Le choix entre plusieurs
organisations dans une même application viendra avec la deuxième.

Cela corrige l'ADR 0052 : il n'y a pas de variable de construction par organisation.

## Conséquences

- L'étape 24 ne demande ni compte, ni magasin, ni outil de construction mobile : elle se fait et se
  vérifie sur le poste, dans un navigateur.
- Une personne qui n'installe rien a la même application qu'une autre, à la même adresse.
- Jusqu'à la coque, l'écoute du direct sur iPhone peut s'arrêter écran verrouillé. L'écran d'écoute
  garde l'écran allumé tant qu'il joue. Ce point ne peut pas être essayé pour l'instant, faute
  d'iPhone : il reste un risque ouvert.
- Le widget pose un cadre vers la page publique (ADR 0005). L'habillage d'application ne doit pas y
  entrer : un test le garde.
- Le travailleur de service met des réponses en cache. Il ne garde que des pages et des données
  publiques, jamais l'espace des responsables.
- La coque devra porter de vraies fonctions natives pour passer la relecture d'Apple : l'écoute en
  arrière-plan et la lecture sans réseau.
