# 0052 : une application mobile par organisation, et le sermon traduit en direct

- Statut : accepté
- Date : 2026-11-25
- Complète : [0002](0002-architecture-monorepo.md), [0007](0007-langues-et-traductions.md),
  [0009](0009-vie-privee.md), [0026](0026-api-publique.md), [0033](0033-priere-du-vendredi.md),
  [0049](0049-service-gratuit-acces-donne-par-le-super-admin.md)

## Contexte

Jusqu'à l'étape 23, jadwal publie le programme d'une organisation par quatre sorties, toutes sur le
web : un widget, une page publique, un flux agenda et des messages à copier.

Le chef de projet a changé le but le 25 novembre 2026. Il veut une application qu'on installe sur le
téléphone, propre à l'organisation qu'il sert : elle affiche son programme et ses informations, et
elle traduit le sermon du vendredi en direct, à l'oral, dans plusieurs langues, pendant que l'imam
parle. Les responsables remplissent le programme ; tout le reste se consulte. D'autres fonctions
viendront.

Trois questions se posaient.

**Refaire ou bâtir.** La saisie, la base, les droits, l'API publique en lecture, les cinq langues,
les heures de prière et les sessions du vendredi existent et sont éprouvés. Il manque ce qui
s'installe sur un téléphone, et tout le direct.

**Comment l'application s'installe.** Une application web installable est gratuite et ne passe par
aucun magasin. Une application des magasins demande une coque native, un compte chez Apple et chez
Google, et une validation à chaque version. Sur iPhone, les rapports de bogues de WebKit disent
qu'une application web installée perd le son quand l'écran se verrouille ; une coque native qui
déclare l'audio en arrière-plan n'a pas cette limite. Or écouter vingt minutes de traduction se fait
téléphone en poche.

**Comment traduire la parole en direct.** Trois familles : un service de traduction voix à voix,
payé à la minute et par langue ; un service qui rend un texte traduit, que le téléphone lit avec sa
propre voix, pour quelques centimes ; des modèles libres sur le serveur de l'instance, qui demandent
une machine avec carte graphique. Aucune ne garantit la justesse sur un sermon, qui cite des textes
religieux en arabe classique.

## Décision

### Le serveur reste, et devient le serveur de l'application

Rien de ce qui existe n'est refait. Les responsables saisissent dans l'espace web, comme avant.
L'application ne lit que l'API publique : elle n'a ni compte ni cookie, et elle ne permet aucune
saisie. Le widget, la page publique et les flux agenda restent.

Le serveur continue de servir plusieurs organisations, chacune isolée des autres (ADR 0013).

### Une application par organisation, distribuée par les magasins

L'application vit dans `apps/mobile`. Une construction est réglée pour une seule organisation : son
nom, son icône, sa couleur, l'adresse de son serveur. Ces réglages sont des variables de
construction, jamais des valeurs écrites dans le code.

Elle paraît sur l'App Store et sur Google Play dès sa première version (décision du 25 novembre
2026). La coque native est choisie sur preuve, par un ADR à part, avec trois critères : l'écoute se
poursuit écran verrouillé sur iPhone, l'application iPhone se construit sans Mac, et elle porte
assez de fonctions natives pour ne pas être un site emballé.

Elle a cinq onglets : Aujourd'hui, Programme, Prières, Direct, Infos. Elle parle les cinq langues de
jadwal, et le dernier programme reçu reste lisible sans réseau.

### Le direct est un module à part, éteint par défaut

Le relais du direct vit dans `apps/live`, à part du serveur web. Lui seul porte la clé du service
de traduction ; le serveur web ne la voit jamais.

- Une personne désignée, sur place, lance le direct d'un bouton. Il ne démarre jamais seul, et il
  s'arrête seul après une durée maximale.
- La voix n'est enregistrée nulle part : elle traverse le relais et le service de traduction.
- Le relais tient un plafond de dépense, réglé par l'instance.
- La personne qui écoute choisit sa langue. Elle n'est pas identifiée.
- L'écran d'écoute dit que la traduction est automatique et peut contenir des erreurs.
- Sept langues au départ : français, allemand, italien, anglais, albanais, bosnien, turc.
- Sans clé de service, le module est éteint, et l'onglet Direct n'apparaît pas : une instance
  auto-hébergée n'est pas obligée de payer un tiers.

Le service de traduction n'est pas choisi ici. Il le sera à l'étape 25, après avoir passé un vrai
enregistrement de sermon par la traduction voix à voix, puis par le texte traduit que lit le
téléphone, en mesurant la justesse, le retard et le coût. Un ADR consignera ce choix.

### Trois étapes

- Étape 24 : l'application, sans le direct.
- Étape 25 : le direct.
- Étape 26 : l'hébergement, la mise en ligne, la soumission aux magasins.

## Conséquences

- La cible première devient l'application. Les sorties web restent servies et testées.
- Le dépôt gagne deux paquets et, avec la coque, une chaîne de construction mobile. La CI devra
  construire l'application.
- Le direct revient sur un point de l'ADR 0009 : pendant un sermon, une voix part chez un service
  tiers. C'est la voix d'une personne nommée, qui doit avoir donné son accord. Les conditions
  d'utilisation le diront avant la première diffusion. Les personnes qui écoutent, elles, restent
  sans compte, sans cookie et sans mesure d'audience.
- jadwal reste gratuit pour l'organisation (ADR 0049). Les comptes des magasins et le service de
  traduction sont à la charge de qui exploite l'instance.
- Le risque principal n'est pas technique : une machine peut mal traduire un verset ou un hadith.
  La mention à l'écran ne suffit pas à l'écarter. La « pré-traduction validée par le responsable »,
  notée pour plus tard dans le cadrage, y répondrait : un texte remis à l'avance, traduit, relu par
  une personne, que l'application suit pendant le sermon.
- Une application distribuée embarque du code tiers : l'avis des licences (ADR 0043) devra la
  couvrir avant la soumission.
- Qui s'auto-héberge et veut l'application la construit et la publie sous son propre compte.
