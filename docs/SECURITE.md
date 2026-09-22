# Modèle de menace

Une page. Ce qu'on protège, contre qui, par quelles barrières, et ce qui n'est pas couvert.

## Ce qu'on protège

Une seule chose est sensible : **l'adresse électronique des responsables** (ADR 0009). Le reste —
programmes de cours, salles, horaires — est public par destination. S'y ajoutent deux atteintes qui
ne sont pas des fuites mais des dommages : **effacer ou fausser le programme d'une organisation**,
et **apprendre qui est responsable de quelle organisation**, ce qui est une information sensible
pour des communautés religieuses.

## Contre qui

| Adversaire                                   | Ce qu'il cherche                                          |
| -------------------------------------------- | --------------------------------------------------------- |
| Un responsable d'une autre organisation      | lire ou modifier les données d'une organisation voisine   |
| Un curieux sans compte                       | savoir si telle adresse est responsable quelque part      |
| Quelqu'un qui a volé une boîte aux lettres   | entrer dans l'espace d'une organisation                   |
| Un compte applicatif compromis               | lire toutes les organisations, effacer ses propres traces |
| Qui vole la boîte aux lettres du super-admin | obtenir la clé maîtresse du service                       |
| Nous-mêmes, par erreur                       | une requête sans filtre, un script d'entretien de trop    |

## Les barrières

**1. L'isolation est dans la base, pas dans les requêtes.** La sécurité au niveau des lignes est
activée et forcée sur toutes les tables. Une requête écrite sans filtre d'organisation ne rend rien
au lieu de tout rendre. Le contexte est posé par transaction et disparaît avec elle, même après une
erreur (ADR 0013). Disons ce que cette barrière arrête et ce qu'elle n'arrête pas : elle arrête
**nos erreurs** — une requête sans filtre, un script d'entretien de trop, un identifiant venu du
client — et elle les arrête quoi qu'écrive le code appelant. Elle n'arrête pas quelqu'un qui **tient
le mot de passe du rôle applicatif** : ce rôle pose lui-même son contexte, donc il peut le poser sur
l'organisation de son choix et lire les organisations une par une. Ce que ce mot de passe n'ouvre
pas, en revanche, ce sont les sessions et les jetons, qui appartiennent à un autre rôle, et le
journal d'audit, qu'il ne peut ni modifier ni effacer.

**2. Aucun rôle en jeu n'échappe aux politiques.** Le propriétaire des tables n'est ni
superutilisateur ni porteur de `BYPASSRLS` : elles s'appliquent aussi à lui, et ses écritures
d'entretien exigent un drapeau posé pour la durée d'une transaction (ADR 0019). Un test de catalogue
échoue si un objet appartient à un autre rôle, si ce rôle porte un attribut privilégié — directement
ou par appartenance — ou si une table perd son forçage.

**3. Quatre rôles, quatre périmètres.** Le rôle du serveur ne sert qu'à l'amorçage. Le propriétaire
migre. Le rôle de connexion ne touche qu'aux sessions et aux passkeys ; le rôle applicatif n'a
**aucun droit** sur elles, donc un jeton de session lui est inaccessible (ADR 0016). Le super-admin,
lui, n'est plus contenu par la base : voir la barrière 10, qui dit ce que cela coûte.

**4. Le contexte vient de la session, jamais de la requête.** Une fonction unique fait le lien, et
l'appartenance est revérifiée à chaque requête. Un identifiant d'organisation glissé dans un
formulaire, une URL ou un en-tête ne donne rien.

**5. Ce qui n'est pas explicitement autorisé est refusé.** Une contrainte de vérification qui rend
`NULL` accepterait la ligne : toutes sont closes par `is true`. Une politique par opération, jamais
une seule qui les couvre toutes. Une clé étrangère composite, parce que les vérifications
d'intégrité contournent la sécurité au niveau des lignes. Pour la même raison, le rôle applicatif
ne modifie d'une adhésion que le rôle et sa date (migration 0053, addendum de l'ADR 0013). Avant,
un membre pouvait repointer une adhésion de son organisation vers un compte jamais invité, puis lire
son courriel ; et le nom de la contrainte dans l'erreur disait si une collègue avait accepté les
conditions. Le refus tombe maintenant sur un droit absent, avant toute clé : il ne dit rien de ce
qui existe.

**6. Le journal d'audit est en ajout seul**, y compris pour le compte qui l'écrit, et son horodatage
lui échappe (ADR 0015, 0020). Un compte compromis ne peut pas effacer ses traces, et cela vaut aussi
pour le super-admin, qui a pourtant tous les autres droits : il y écrit, il n'y récrit rien. Le
propriétaire, lui, purge sans lire. L'acceptation des conditions suit la même règle : le rôle
applicatif lit et ajoute ses propres acceptations, sans rien modifier ni supprimer, et le moment est
posé par la base, jamais par l'application. Le super-admin les lit, sans en écrire aucune. Elles
partent avec l'adhésion, par la clé en cascade, et par aucun autre chemin (ADR 0044).

**7. Les purges sont bornées, et elles appartiennent au propriétaire.** Journal à vingt-quatre mois,
invitations résolues à quatre-vingt-dix jours, comptes sans adhésion à douze mois. Aucune n'est
accordée au rôle applicatif ni au super-admin : la tentative échoue sur un refus de droit
(ADR 0020, étape 4). Depuis l'étape 6, un **verrou de conservation** suspend la purge du journal et
du registre interne d'une organisation, le temps d'un litige (ADR 0030). Il ne se pose que depuis la
base, avec le mot de passe du propriétaire : ni l'application ni le super-admin n'ont le moindre
droit sur cette table, et la clé étrangère en `restrict` empêche aussi de supprimer l'organisation
pour emporter son journal.

**8. La connexion ne dit rien.** Demander un lien ne consulte pas les comptes : la réponse, le
contenu affiché et le temps de réponse sont les mêmes pour une adresse connue et une adresse
inconnue. Inviter ne consulte pas davantage (ADR 0016, 0017). Le lien dure quinze minutes, sert une
fois, et son jeton est stocké haché.

**9. Le navigateur est bridé.** Politique de sécurité du contenu avec nonce, `frame-ancestors` calculé
par route, pas de cadre par défaut, protection contre la soumission d'un formulaire depuis un autre
site, cookie signé `HttpOnly` `SameSite=Lax`.

**9 bis. Le widget est confiné, et ne reçoit qu'un nombre.** Depuis l'étape 6, le widget d'une
organisation ne redessine rien : il pose un cadre vers la page publique (ADR 0005 révisé). Le rendu
reste donc dans **notre** origine, et une faute d'échappement chez nous ne peut pas devenir une
injection sur le site d'une organisation — ce qui serait le risque d'un widget qui injecterait
notre HTML dans la page hôte. Le seul canal entre les deux est un message qui porte une hauteur en
pixels ; le parent vérifie la fenêtre émettrice, l'origine par égalité stricte et la forme du
message, borne la valeur, et ne traite aucun autre type. Le fichier servi porte
`Access-Control-Allow-Origin: *` — ce qu'il ouvre est un fichier public — et une empreinte
d'intégrité est disponible pour les sites qui l'exigent, à une adresse versionnée et immuable.

**10. Le compte super-admin est une clé maîtresse, et rien dans la base ne le contient.** Depuis
l'étape 4, il lit et écrit dans toutes les organisations, en permanence, et ses consultations ne
laissent aucune trace visible par elles (ADR 0025). Ce qui le protège n'est plus l'isolation, c'est
l'authentification : **une passkey est obligatoire** pour exercer ces pouvoirs, un lien magique seul
ne les donne jamais, la session qui les porte dure au plus douze heures sans renouvellement, et la
limitation de débit y est plus stricte qu'ailleurs. Une passkey nouvelle ne s'enregistre que depuis
une session déjà prouvée par passkey, sauf pour la toute première — sans cette règle, une boîte aux
lettres compromise se fabriquerait la sienne. Ses **écritures** restent signées dans le journal de
l'organisation, comme celles d'un responsable ; ses lectures vont dans un registre interne
qu'aucune organisation ne peut atteindre, ni directement ni par une jointure.

**11. jadwal est cloisonné sur la machine, et ne suppose rien de son voisinage.** Un serveur peut
héberger d'autres applications ; jadwal n'a besoin d'en connaître aucune, et ne compte sur aucune.
Ce qu'il garantit pour lui-même tient en cinq points. L'application et sa base tournent en
**conteneurs**, système de fichiers en lecture seule, sans aucune capacité du noyau — sauf les cinq
dont l'initialisation de la base a besoin, pas une de plus —, avec `no-new-privileges`, et **jamais
sous le compte privilégié** : dans son conteneur, l'application tourne sous un compte dédié non
privilégié, et la base redescend sur le sien une fois son volume préparé. Les deux sont réunis sur un
**réseau Docker qui n'est qu'à jadwal** : aucun autre service n'y entre, et jadwal n'est présent sur
aucun autre. La **base ne publie aucun port** — elle n'est joignable que depuis ce réseau — et
l'application ne publie le sien que sur la boucle locale, derrière le mandataire ; de l'extérieur,
rien d'autre que lui n'est atteignable. Le **fichier d'environnement**, qui porte tous les secrets du
service, est en `0600 root:root` dans un répertoire en `0700` : aucun groupe partagé, aucun bit de
lecture pour les autres, il est illisible à tout compte non privilégié. Enfin, tout ce que jadwal
dépose porte son nom, dans des répertoires préfixés, et s'enlève d'un seul geste (ADR 0034). Ce que
cette barrière n'arrête pas : qui obtient les droits `root` sur la machine tient le fichier
d'environnement, donc les mots de passe de la base — c'est un secret d'hébergement, et la section
suivante le redit.

## Ce qui n'est pas couvert

- **Un superutilisateur du serveur PostgreSQL voit tout.** Aucune politique ne s'applique à lui.
  C'est pourquoi il ne sert qu'à l'amorçage, et jamais à l'application — et depuis l'ADR 0040,
  ce n'est plus seulement une discipline de code : **le conteneur de l'application ne porte plus son
  mot de passe**, ni celui du propriétaire du schéma. Les deux vivent dans le fichier d'environnement
  d'un conteneur de démarrage qui crée les rôles, passe les migrations et s'arrête. Ce que cela
  n'arrête pas : qui obtient les droits `root` sur la machine lit ce fichier-là comme les autres.
- **Un compte super-admin compromis ouvre toutes les organisations, en lecture comme en écriture,
  sans qu'aucune d'elles soit prévenue d'une consultation.** C'est la conséquence directe et assumée
  de l'ADR 0025, et c'est le risque le plus lourd du service. Il ne tient qu'à la passkey : sans
  elle, un lien magique intercepté ne donne rien de plus qu'un compte ordinaire. Le registre interne
  permet de reconstituer ce qui a été consulté **après coup**, il n'empêche rien. Les organisations
  en sont informées par `docs/CONDITIONS.md`, ce qui remplace la notification que l'étape 3
  prévoyait.
- **La passkey repose sur l'appareil.** Un appareil déverrouillé entre les mains de quelqu'un
  d'autre porte la passkey avec lui. La vérification de l'utilisateur est exigée, ce qui impose un
  code ou une biométrie à chaque usage, mais elle ne remplace pas la garde de l'appareil.
- **Une boîte aux lettres compromise donne l'accès.** Le lien magique est la seule preuve
  d'identité ; les passkeys sont dans la feuille de route, pas dans la V1.
- **Le mot de passe du rôle applicatif ouvre toutes les organisations, une par une.** La sécurité au
  niveau des lignes cloisonne les requêtes de l'application, pas le rôle qui pose le contexte. Ce
  mot de passe est donc un secret d'hébergement, au même titre que celui de la base (étape 8).
- **Le chiffrement au repos** relève de l'hébergement (étape 8). Les sauvegardes, elles, quittent le
  serveur chiffrées avec une clé publique dont la privée n'est jamais là : une archive volée reste
  illisible (ADR 0035). Et depuis l'ADR 0037, le serveur ne peut plus **effacer** ce qu'il a envoyé —
  qui prend le serveur prend la base, pas les sauvegardes des cent quatre-vingts derniers jours.
  Ce qui reste hors de portée : qui obtient à la fois une archive **et** la clé privée de
  l'exploitant a tout.
- **Le déni de service.** La limitation de débit protège les boîtes aux lettres, pas le service.
- **Une personne responsable malveillante dans sa propre organisation** peut effacer le programme de
  son organisation. Le journal dit qui et quand, et l'état avant permet de revenir en arrière.
- **Une invitation ouvre la fiche de l'organisation à son destinataire**, entière, avant même qu'il
  accepte : une politique porte sur des lignes, pas sur des colonnes. Rien de cette ligne n'est une
  donnée personnelle, et le nom sera public dès l'étape 5 (ADR 0017).
- **L'existence d'un compte reste devinable hors du service** : si une personne est publiquement
  responsable d'une organisation, savoir qu'elle a un compte n'apprend rien. Nous protégeons ce que
  le service révèle, pas ce que le monde sait déjà.
- **Aucune revue de sécurité externe** n'a eu lieu. Ce document dit ce que nous avons vérifié
  nous-mêmes, par des essais reproductibles, pas ce qu'un auditeur confirmerait.

## Comment le vérifier

Les tests de `packages/db` jouent l'isolation contre un vrai PostgreSQL avec le rôle non privilégié,
et échouent si une table ajoutée plus tard perd sa protection. Ceux d'`apps/web` lancent un vrai
serveur et suivent le chemin complet d'une connexion. Aucun n'est simulé.

`pnpm parcours:test` rejoue ce qu'une organisation vit, dans Chrome, sur l'image de production et
une base neuve lancées par Docker : la passkey du super-admin, l'invitation, les conditions à
accepter, les cours, la page publique, le widget posé sur une autre origine et le flux agenda. Il
passe axe sur chaque page traversée, et échoue sur tout problème d'accessibilité d'impact `serious`
ou `critical`, les deux niveaux les plus graves d'axe.
