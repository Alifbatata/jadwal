# Modèle de menace

Une page. Ce qu'on protège, contre qui, par quelles barrières, et ce qui n'est pas couvert.

## Ce qu'on protège

Une seule chose est sensible : **l'adresse électronique des responsables** (ADR 0009). Le reste —
programmes de cours, salles, horaires — est public par destination. S'y ajoutent deux atteintes qui
ne sont pas des fuites mais des dommages : **effacer ou fausser le programme d'une organisation**,
et **apprendre qui est responsable de quelle organisation**, ce qui est une information sensible
pour des communautés religieuses.

## Contre qui

| Adversaire                                   | Ce qu'il cherche                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Un responsable d'une autre organisation      | lire ou modifier les données d'une organisation voisine                                          |
| Un éditeur de l'organisation                 | se faire responsable, inviter, changer rôles et réglages, lire les membres, signer pour un autre |
| Un curieux sans compte                       | savoir si telle adresse est responsable quelque part                                             |
| Quelqu'un qui a volé une boîte aux lettres   | entrer dans l'espace d'une organisation                                                          |
| Un compte applicatif compromis               | lire toutes les organisations, effacer ses propres traces                                        |
| Qui vole la boîte aux lettres du super-admin | obtenir la clé maîtresse du service                                                              |
| Nous-mêmes, par erreur                       | une requête sans filtre, un script d'entretien de trop                                           |

## Les barrières

**1. L'isolation est dans la base, pas dans les requêtes.** La sécurité au niveau des lignes est
activée et forcée sur toutes les tables. Une requête écrite sans filtre d'organisation ne rend rien
au lieu de tout rendre. Le contexte est posé par transaction et disparaît avec elle, même après une
erreur (ADR 0013). Disons ce que cette barrière arrête et ce qu'elle n'arrête pas : elle arrête
**nos erreurs** — une requête sans filtre, un script d'entretien de trop, un identifiant venu du
client — et elle les arrête quoi qu'écrive le code appelant. Elle n'arrête pas quelqu'un qui **tient
le mot de passe du rôle applicatif** : ce rôle pose lui-même son contexte, donc il peut le poser sur
l'organisation de son choix et lire les organisations une par une, et sur la personne de son choix,
une personne responsable comprise (barrière 4 bis). Ce que ce mot de passe n'ouvre
pas, en revanche, ce sont les sessions et les jetons, qui appartiennent à un autre rôle, et le
journal d'audit, qu'il ne peut ni modifier ni effacer.

**2. Aucun rôle en jeu n'échappe aux politiques.** Le propriétaire des tables n'est ni
superutilisateur ni porteur de `BYPASSRLS` : elles s'appliquent aussi à lui, et ses écritures
d'entretien exigent un drapeau posé pour la durée d'une transaction (ADR 0019). Un test de catalogue
échoue si un objet appartient à un autre rôle, si ce rôle porte un attribut privilégié, directement
ou par appartenance, ou si une table perd son forçage. Une exception, écrite comme limite dans
l'ADR 0019 : le propriétaire garde `TRUNCATE`, qui n'examine aucune politique. Sans son drapeau, il
peut vider une table, journal d'audit et acceptations compris. Il est de confiance par construction.

**3. Quatre rôles, quatre périmètres.** Le rôle du serveur ne sert qu'à l'amorçage. Le propriétaire
migre. Le rôle de connexion ne touche qu'aux sessions et aux passkeys ; le rôle applicatif n'a
**aucun droit** sur elles, donc un jeton de session lui est inaccessible (ADR 0016). Le super-admin,
lui, n'est plus contenu par la base : voir la barrière 10, qui dit ce que cela coûte.

**4. Le contexte vient de la session, jamais de la requête.** Une fonction unique fait le lien, et
l'appartenance est revérifiée à chaque requête. Un identifiant d'organisation glissé dans un
formulaire, une URL ou un en-tête ne donne rien.

**4 bis. Dans une organisation, l'éditeur n'est pas responsable, pour la base non plus.** Depuis
l'étape 18 (ADR 0046, migration 0059), la base tient la même séparation que les écrans. Pour le
rôle applicatif, les gestes réservés aux responsables exigent que la personne du contexte soit
responsable de l'organisation du contexte : lire et écrire les invitations, lire la liste des
membres et leurs comptes, lire le journal, changer un rôle, retirer un membre, modifier les réglages
et les salles, régler les heures de prière, et depuis l'étape 19 supprimer un cours (migrations
0064, 0065 et 0070). La suppression d'une session du vendredi reste à l'éditeur, et un cours ne
devient pas une session le temps d'être supprimé : le type d'une ligne ne change pas, pour personne
(migration 0069). Une fonction à droits du définisseur le dit, `jadwal.is_org_admin()`, que seul le
rôle applicatif peut appeler. L'éditeur garde tout ce qu'il fait à l'écran : les cours, les séances,
les pauses, le vendredi. Il ne lit plus que sa propre adhésion et son propre compte, ne nomme que
lui-même dans ce qu'il écrit, et peut quitter l'organisation, lui seul et pour lui seul
(migration 0066), depuis « Vos organisations » ; la dernière personne responsable ne part pas.
L'écran pose le contexte de l'organisation quittée avec la personne, et le journal consigne le
départ, signé d'elle.
Cette barrière arrête les erreurs de l'application : un écran qui oublierait sa garde, un rôle lu
dans la mauvaise adhésion, comme à l'étape 17. Elle n'arrête pas qui tient le mot de passe du rôle
applicatif, qui pose lui-même la personne du contexte (barrière 1). Le super-admin n'est pas
concerné : il garde ses pouvoirs (barrière 10).

**5. Ce qui n'est pas explicitement autorisé est refusé.** Une contrainte de vérification qui rend
`NULL` accepterait la ligne : toutes sont closes par `is true`. Une politique par opération, jamais
une seule qui les couvre toutes. Une clé étrangère composite, parce que les vérifications
d'intégrité contournent la sécurité au niveau des lignes. Pour la même raison, le rôle applicatif
ne modifie d'une adhésion que le rôle et sa date (migration 0053, addendum de l'ADR 0013), d'une
organisation que les colonnes de l'écran des réglages, jamais le plan, l'état ni l'identifiant
d'URL (migration 0059), et d'un compte que sa langue, la personne elle-même (migration 0060). Avant,
un membre pouvait repointer une adhésion de son organisation vers un compte jamais invité, puis lire
son courriel ; et le nom de la contrainte dans l'erreur disait si une collègue avait accepté les
conditions. Le refus tombe maintenant sur un droit absent, avant toute clé : il ne dit rien de ce
qui existe.

**6. Le journal d'audit est en ajout seul**, y compris pour le compte qui l'écrit, et son horodatage
lui échappe (ADR 0015, 0020). Un compte compromis ne peut pas effacer ses traces, et cela vaut aussi
pour le super-admin, qui a pourtant tous les autres droits : il y écrit, il n'y récrit rien. Le
propriétaire, lui, purge sans lire. Depuis l'étape 19, l'auteur d'une entrée écrite par le rôle
applicatif est la personne du contexte, et aucune autre : un membre ne signe plus au nom d'un
collègue (migration 0063), et le super-admin ne signe plus au nom d'un membre, ni de personne
(migration 0071). Sa lecture est réservée à la personne responsable (migration 0070) : le
journal nomme les membres et les personnes invitées, et un éditeur y relisait la liste que la
barrière 4 bis lui retire. Le super-admin le lit comme avant. L'acceptation des conditions suit la
même règle : le rôle applicatif lit et ajoute ses propres acceptations, sans rien modifier ni
supprimer, et le moment est posé par la base, jamais par l'application. Le super-admin les lit, sans
en écrire aucune. Elles partent avec l'adhésion, par la clé en cascade, et par aucun autre chemin
(ADR 0044), hors le `TRUNCATE` du propriétaire (barrière 2).

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
fois, et son jeton est stocké haché. Une invitation dure quatorze jours, et c'est la base qui le
tient : elle refuse une durée plus longue et une date de création choisie par l'application
(migration 0056), puis l'acceptation d'une invitation échue et l'adhésion qui la suivrait
(migration 0057). Elle tient aussi ce qu'une invitation peut devenir, pour tous les rôles de
connexion, super-admin compris (migration 0058) : une invitation consommée ou annulée ne sert plus,
seule la personne invitée accepte, à son propre nom, l'adhésion porte le rôle de l'invitation, et
la date de réponse, dont la purge compte ses quatre-vingt-dix jours, ne bouge plus. Et seule une
personne responsable écrit, lit ou annule les invitations de son organisation : un éditeur qui
s'écrirait une invitation de responsable est refusé dès l'insertion (barrière 4 bis, ADR 0017).

Depuis l'étape 18, les courriels parlent cinq langues, et le choix de la langue ne consulte pas
davantage les comptes. Le lien de connexion part dans la langue de l'écran d'où il est demandé ;
l'invitation, depuis l'étape 19, dans la langue que la personne qui invite choisit dans le
formulaire, celle de son écran d'abord, pour toute adresse. Lire la langue du compte destinataire,
ce serait chercher un compte par son adresse : un test vérifie, dans chacune des cinq langues,
qu'une invitation vers un compte réglé en arabe est la même, objet, texte et HTML, que vers une
adresse inconnue, et que l'écran répond la même phrase (ADR 0017, ADR 0047). **Le lien porte une
chose de plus, et une seule** : quand un choix de langue fait avant la connexion attend sur le
navigateur de la demande, son adresse de retour le porte (`/organisations?language=de`), sinon elle
reste `/organisations`. Ce choix vient du cookie de ce
navigateur, jamais du compte. La vérification du lien l'écrit sur le compte que le jeton désigne, et
nulle part ailleurs : une adresse qui porte ce paramètre, posée sur un autre site, ne change ni la
page ni le compte, et aucun écran ne le lit. Depuis l'étape 19, la vérification renvoie à l'écran
d'arrivée sans lui : il ne reste pas dans l'adresse que la personne voit et peut copier. La
demande retire le choix pour toute adresse de forme acceptable, qu'un courriel parte ou que la
limite par adresse le retienne : garder le choix dans ce seul cas changerait les cookies de la
réponse, et dirait qu'on a déjà demandé trois liens pour cette adresse dans l'heure.

**9. Le navigateur est bridé.** Politique de sécurité du contenu avec nonce, `frame-ancestors` calculé
par route, pas de cadre par défaut, protection contre la soumission d'un formulaire depuis un autre
site, cookie signé `HttpOnly` `SameSite=Lax`. Le transport strict (HSTS) demande deux ans,
sous-domaines compris, sans `preload`. L'application dit la même valeur que le bloc de site du
serveur web, et un test compare les deux.

**Deux cookies de langue, et rien de personnel dedans.** Depuis l'étape 18, l'espace retient la
langue choisie (ADR 0047). `jadwal_language` ne porte que le code de la langue, `fr` à `ar` ;
`jadwal_language_pending` porte `1`, et dit qu'un choix fait avant la connexion attend d'être donné
au compte. Les deux sont `HttpOnly`, `SameSite=Lax`, `Secure` dès que le service est servi en
HTTPS, valables un an, et ne sont posés que par un choix fait dans le formulaire, jamais au premier
passage. Le formulaire (`POST /langue`) ne renvoie jamais vers un autre site : le chemin de retour
est vérifié avant et après sa normalisation, parce que `/.//ailleurs` devient `//ailleurs`, qu'un
navigateur lit comme une autre origine. Un envoi depuis un autre site est refusé par SvelteKit.
Chaque réponse de l'espace porte `Vary: Accept-Language, Cookie`. Le côté public ne lit aucun de
ces cookies.

**L'appareil, lu pour deux pages publiques.** La page d'abonnement au calendrier et la page d'un
cours lisent `Sec-CH-UA-Platform`, sinon `User-Agent`, pour proposer d'abord le bouton d'agenda qui
convient, et leur réponse porte `Vary: Sec-CH-UA-Platform, User-Agent` (ADR 0048). L'application
n'écrit l'appareil nulle part. Ces deux pages portent des liens vers Google Agenda et Outlook, qui
s'ouvrent dans un nouvel onglet avec `rel="noopener"` ; un test refuse tout autre domaine dans un
lien, et toute ressource chargée d'un autre domaine.

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
l'organisation, comme celles d'un responsable, de sa propre identité, que la base exige depuis la
migration 0071 ; ses lectures vont dans un registre interne
qu'aucune organisation ne peut atteindre, ni directement ni par une jointure. La base le borne
pourtant à l'organisation où il est entré, table des organisations comprise depuis la migration
0055 : entré dans l'une, il ne lit et ne modifie plus qu'elle, et une instruction sans filtre ne
touche pas les autres. Il ne les voit toutes que dans sa console, sans contexte. Ce n'est pas une
limite de pouvoir, puisqu'il entre où il veut : c'est une garde contre la méprise.

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

**12. Aucune image ne part sans le parcours complet.** Le playbook commence par une garde, jouée
sur le poste qui déploie avant toute connexion au serveur (ADR 0045). Elle n'accepte qu'une image
publiée sous le chemin du dépôt, avec l'étiquette source de ce dépôt. Elle lit le commit de
l'image dans le registre, vérifie au passage que le registre a rendu l'image du digest demandé, et
exige une exécution verte du flux `parcours` pour ce commit. Tout se lit sans compte : aucun secret
de plus. Le rôle qui écrit l'image n'accepte qu'un verdict rendu par la garde dans le même passage :
ni une sélection de tâches, ni une variable de la garde posée à la main ne le remplacent. Par la
voie prévue, la lever demande une dérogation écrite qui nomme son image, affichée en rouge et
gardée au récapitulatif. Ce qu'elle n'arrête pas : qui tient le registre, le compte ou le dépôt,
puisqu'elle croit l'étiquette de révision que la CI pose sur l'image, ni qui modifie le playbook
ou pointe ses adresses vers un faux service. C'est une garde contre l'oubli et la hâte.

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
  La contrepartie : il n'efface rien à distance, par décision, pas même une archive que le
  stockage aurait oubliée une fois son verrou passé.
  Chaque nuit, la tâche de sauvegarde vérifie donc que chaque objet distant tient l'âge promis de
  son préfixe, 182 jours au plus, et échoue sinon, ce qui fait partir l'alerte. Ce qui reste hors
  de portée : qui obtient à la fois une archive **et** la clé privée de l'exploitant a tout.
- **Le déni de service.** La limitation de débit protège les boîtes aux lettres, pas le service.
- **Une personne responsable malveillante dans sa propre organisation** peut effacer le programme de
  son organisation. Le journal dit qui et quand, et l'état avant permet de revenir en arrière.
- **Un éditeur lit l'identifiant de ses collègues** dans les cours, les séances et les pauses qu'ils
  ont écrits (`updated_by`, `created_by`) : un identifiant opaque, sans nom, sans adresse ni rôle,
  qu'aucune table ne lui permet de relier à un compte depuis l'étape 19 (ADR 0046).
- **Une invitation ouvre la fiche de l'organisation à son destinataire**, entière, avant même qu'il
  accepte : une politique porte sur des lignes, pas sur des colonnes. Rien de cette ligne n'est une
  donnée personnelle, et le nom sera public dès l'étape 5 (ADR 0017).
- **Un visiteur qui suit le lien de Google Agenda ou d'Outlook** donne à ce service l'adresse du
  flux, qui est publique. Ce que ce service apprend ensuite de lui ne relève plus de jadwal.
- **Un cache partagé qui ignorerait `Vary`** pourrait servir à un visiteur l'écran préparé pour une
  autre langue ou un autre appareil. Le modèle de `infra/` n'en place aucun devant le service ; une
  instance qui ajoute un cache devant le service vérifie qu'il respecte `Vary`.
- **L'existence d'un compte reste devinable hors du service** : si une personne est publiquement
  responsable d'une organisation, savoir qu'elle a un compte n'apprend rien. Nous protégeons ce que
  le service révèle, pas ce que le monde sait déjà.
- **Aucune revue de sécurité externe** n'a eu lieu. Ce document dit ce que nous avons vérifié
  nous-mêmes, par des essais reproductibles, pas ce qu'un auditeur confirmerait.

## Comment le vérifier

Les tests de `packages/db` jouent l'isolation contre un vrai PostgreSQL avec le rôle non privilégié,
et échouent si une table ajoutée plus tard perd sa protection. `test/org-admin.test.ts` y fait
tenter chaque geste réservé aux responsables par une éditrice, avec le contexte que l'écran pose,
puis par une personne responsable et par le super-admin. Ceux d'`apps/web` lancent un vrai serveur
et suivent le chemin complet d'une connexion. Aucun n'est simulé. Depuis l'étape 18,
`tests/choix-de-la-langue.test.ts` y vérifie un choix fait avant la connexion, le lien qui
l'emporte et n'emporte rien d'autre, une adresse qui ne change la langue d'aucun compte, `Vary` et
le retour du choix de la langue par HTTP, et `src/lib/i18n/language.test.ts` essaie ce retour sous
plus de deux mille formes de points et de barres ; `tests/espace-en-cinq-langues.test.ts` vérifie
les deux cookies, et compare l'invitation vers un compte connu et vers une adresse inconnue ;
`tests/public.test.ts` lit les pages publiques comme un Android, un iPhone et un ordinateur, et
refuse tout lien vers un autre domaine que les deux services d'agenda.

`pnpm parcours:test` rejoue ce qu'une organisation vit, dans Chrome, sur l'image de production et
une base neuve lancées par Docker : la passkey du super-admin, l'invitation, les conditions à
accepter, les cours, la page publique, le widget posé sur une autre origine et le flux agenda. Il
passe axe sur chaque page traversée, et échoue sur tout problème d'accessibilité d'impact `serious`
ou `critical`, les deux niveaux les plus graves d'axe. Le flux `parcours` le lance à chaque poussée
sur `main`, et la garde du déploiement exige son verdict.

`pnpm garde:test` joue cette garde cas par cas, avec le vrai playbook, contre une fausse API du
registre et de GitHub. `pnpm sauvegarde:test` joue le script de sauvegarde entier, jusqu'à la
vérification de l'âge des objets distants, avec le vrai rclone en 1.60.1 puis en 1.75.1 : neuf
passages par version. L'envoi va vers une destination locale, et la liste de quatre de ces passages
passe par un faux stockage S3 : un seau absent, un chemin absent, et deux fois un stockage qui refuse
de lire les métadonnées d'un objet. Les deux épreuves tournent dans des conteneurs jetables, et
aucune ne joint le serveur.
