# ADR 0025 : Super-admin — pouvoirs complets, consultation non tracée, passkey obligatoire

## Contexte

L'étape 3 avait construit une retenue élaborée autour du compte super-admin : aucun droit sur les
données d'une organisation, et une **fenêtre d'accès de support** — motif écrit, vingt-quatre heures
au plus, révocable, tracée dans le journal de l'organisation visée — pour les cas où il fallait
regarder (ADR 0018).

À l'usage, l'exploitant demande l'inverse. Une demande de support arrive par téléphone un vendredi
soir ; ouvrir une fenêtre, écrire un motif, entrer, corriger, révoquer, c'est cinq gestes et deux
écrans pour remettre une date à sa place. Et la trace dans le journal de l'organisation transforme
chaque dépannage en événement : « quelqu'un a regardé chez vous » s'affiche alors même que la
personne responsable venait de le demander.

La décision de l'exploitant est prise, et elle renverse celle de l'étape 3. Ce document la consigne,
avec son prix, plutôt que de laisser l'ADR 0018 dire le contraire en silence.

## Décision

### Le super-admin a tous les droits, en permanence

- **Plus de fenêtre.** La table `support_access`, sa fonction, ses politiques conditionnelles et son
  écran sont retirés. Il n'y a plus rien à ouvrir.
- Il **lit et écrit** dans toutes les organisations : cours, exceptions, pauses, salles, réglages ;
  il invite, retire et change les rôles ; il crée, suspend et ferme une organisation ; il attribue
  le plan.
- **Le contexte d'organisation reste obligatoire.** Ce n'est plus une barrière — il entre où il veut
  — c'est un garde-fou : ses politiques restent bornées par `jadwal.current_org_id()`, donc une
  écriture qui viserait une autre organisation que celle où il est entré est refusée par la base.
  Une bannière lui rappelle à l'écran dans quelle organisation il travaille. Le risque a changé de
  nature : ce n'est plus l'accès, c'est la méprise.

### Ses écritures sont signées, ses lectures ne le sont pas

- **Toute modification** entre dans le journal d'audit de l'organisation, avec l'état avant, l'état
  après et son identité, sous les mêmes noms d'action qu'une modification faite par un responsable.
  Le journal dit ce qui a changé, pas qui avait le droit de le changer.
- **Aucune consultation n'y entre.** Pas de courriel, pas d'entrée de journal, rien qui signale à
  une organisation qu'un super-admin a regardé ses données. C'est une décision explicite, et c'est
  celle qui coûte le plus cher.
- **Un registre interne** (`admin_access_log`) note, une entrée par requête : la date,
  l'organisation, le type d'action et la route. Il protège l'exploitant en cas de contestation. Le
  rôle applicatif n'a **aucun droit** dessus — ni politique, ni `GRANT`, ni clé étrangère qui le
  rendrait atteignable par une jointure — donc une organisation ne peut pas le lire, même
  indirectement. Il est en insertion seule pour le super-admin lui-même : une trace qu'on peut
  récrire ne protège personne.

### Ce que ces pouvoirs coûtent, et ce qui les tient

Le compte super-admin devient une **clé maîtresse** sur toutes les organisations. L'isolation par
les lignes ne le contient plus ; elle ne contient plus que ses erreurs de contexte.
`docs/SECURITE.md` le dit dans ses barrières et dans ce qui n'est pas couvert. Trois contreparties
en découlent, et elles ne sont pas décoratives :

- **Passkey obligatoire.** Une session ne porte les pouvoirs que si elle a été **ouverte par une
  passkey**. Un lien magique seul ne les donne jamais : une boîte aux lettres compromise ne doit pas
  suffire à ouvrir toutes les organisations du service.
  - **Amorçage.** Enregistrer une passkey depuis une session ordinaire n'est permis que tant que le
    compte n'en a aucune. Dès qu'il en a une, enregistrer ou supprimer exige une session déjà
    prouvée par passkey. Sans cette règle, qui tient la boîte aux lettres enregistrerait la sienne
    et la protection entière ne servirait à rien.
  - **Plusieurs passkeys par compte**, parce que perdre son téléphone ne doit pas fermer le service.
  - **Secours** : quand toutes sont perdues, le propriétaire efface les passkeys du compte côté
    base, ce qui rouvre la fenêtre d'amorçage. Jamais de question secrète, jamais de code envoyé par
    courriel — l'un et l'autre ramèneraient la boîte aux lettres au centre.
  - La vérification de l'utilisateur est exigée (`userVerification: 'required'`), pas seulement
    préférée : sans elle, un authentificateur volé et déverrouillé suffirait.
- **Session de douze heures**, sans renouvellement. Le plafond est mesuré depuis `created_at`, que
  Better Auth ne touche jamais : l'usage ne le repousse pas. Au-delà, la session est **révoquée**,
  pas seulement ignorée. La documentation de Better Auth dit qu'un `databaseHook` de création de
  session ne peut pas changer `expiresAt` : le plafond est donc tenu par notre code, à chaque
  requête, et non par un réglage de la bibliothèque.
- **Limitation de débit plus stricte** sur les chemins d'authentification par passkey que sur le
  reste du service.

### Transparence

`docs/CONDITIONS.md` dit aux organisations, en français simple, que l'exploitant peut accéder à
leurs données pour l'assistance et la maintenance. C'est ce qui remplace la notification supprimée :
l'information est donnée une fois, clairement, au lieu d'être répétée à chaque intervention.

## Conséquences

- Le support redevient possible en un geste. C'était le but.
- **Une organisation ne peut plus savoir si ses données ont été consultées.** Elle sait ce qui a été
  modifié, et par qui. C'est moins que ce que l'étape 3 promettait, et c'est assumé : le registre
  interne existe pour trancher un litige, pas pour informer.
- Le compte super-admin devient la cible la plus intéressante du service. Toute la contrepartie
  tient dans la passkey : un lien magique intercepté ne donne plus rien de plus qu'un compte
  ordinaire.
- Un compte super-admin qui n'a pas encore enregistré de passkey peut se connecter et ne voit que
  l'écran qui lui permet d'en enregistrer une. C'est la seule page de l'application qui exige
  JavaScript : WebAuthn est une API du navigateur, il n'existe pas de formulaire qui la remplace.
- La fenêtre d'accès de support disparaît du schéma. Les migrations qui la posaient restent dans
  l'histoire, marquées comme non rejouables : un fichier qui nomme une table supprimée ne peut plus
  l'être.
- L'ADR 0018 est **remplacé** par celui-ci. Il reste lisible, avec un en-tête qui renvoie ici : une
  décision annulée se raye, elle ne s'efface pas.

## Addendum du 2026-09-23 : la table des organisations suit aussi le contexte

La décision dit que les politiques du super-admin restent bornées par le contexte. Ce n'était pas
vrai pour la table des organisations elle-même : la lecture, la modification et la suppression y
valaient `true`. Entré dans A, le super-admin lisait B. Quatre lectures de l'application qui ne
filtraient pas sur le contexte lui ont montré les réglages d'une autre organisation que la sienne ;
l'étape 16 les a corrigées une à une, et rien n'empêchait d'en écrire une cinquième. À l'écriture,
c'était pire : une instruction sans `where`, tapée depuis A, modifiait ou supprimait toutes les
organisations du service. C'est exactement la méprise que le contexte existe pour arrêter.

**La migration 0055 borne ces trois politiques au contexte quand il est posé.** Entré dans une
organisation, le super-admin ne voit et ne touche plus qu'elle. Dans sa console, sans contexte, il
les voit et les change toutes : c'est là qu'il les liste, en crée, change le plan et l'état, et lit
celle où il va entrer. Rien ne change pour ces écrans, qui tournent tous sans contexte, ni pour
ceux de l'espace d'une organisation, qui tournent tous avec.

« Sans contexte » veut dire un réglage absent ou vide. Un réglage illisible ne vaut pas la console :
il ne montre rien, comme sur les autres tables (ADR 0013).

Les autres politiques du super-admin qui ne lisent pas le contexte ont été relevées dans le
catalogue, et aucune n'a le même défaut :

- **la création d'une organisation** n'en touche aucune autre ; elle reste ouverte ;
- **la lecture des comptes** : un compte n'appartient à aucune organisation, et le super-admin les
  lit tous par décision (voir plus haut) ;
- **son registre interne**, en lecture et en insertion : c'est le sien, pas une donnée
  d'organisation, et il s'écrit aussi hors de tout contexte.

Un test relève ces politiques dans le catalogue sans nommer de table : une politique du super-admin
qui ne lit pas le contexte le fait échouer tant qu'elle n'est pas ajoutée à cette liste, avec sa
raison.

## Addendum du 2026-09-23 : repousser l'échéance d'une invitation

Depuis la migration 0057, une invitation échue ne s'accepte plus (ADR 0017). Le super-admin, qui
invite, garde le droit de modifier la fin d'une invitation dans l'organisation où il est entré :
c'est une modification ordinaire. Il peut donc rendre la vie à une invitation échue qui a duré
moins de quatorze jours, en repoussant sa fin jusqu'à quatorze jours après sa création. C'est voulu.
La borne de la migration 0056 l'arrête là : une invitation créée il y a plus de quatorze jours ne
reprend pas vie. Aucun écran ne le propose aujourd'hui ; c'est ce que la base permet au rôle du
super-admin, et un test fixe ce comportement.

## Addendum du 2026-09-23 : les passages de statut d'une invitation

Depuis la migration 0058, la base tient ce qu'une invitation peut devenir (ADR 0017), et le
super-admin suit ces règles comme les autres rôles de connexion. Il a tous les droits sur les
données, mais une règle d'intégrité n'est pas un droit de lecture ou d'écriture : elle dit ce que
veut dire une ligne, et « acceptée » veut dire que la personne a accepté. Il n'accepte donc pas à
la place de quelqu'un, ne met pas une acceptation au nom d'un autre compte, ne rend pas la vie à
une invitation annulée ou consommée, et ne change pas la date d'une réponse.

Cela ne lui retire aucun pouvoir. Ce qu'un passage refusé lui donnerait, il l'obtient par un geste
permis : une nouvelle invitation, ou l'adhésion qu'il crée lui-même dans l'organisation où il est
entré. Et la règle l'arrête sur la méprise, comme le contexte : un `update` sans filtre ne rend pas
la vie aux invitations annulées d'une organisation. Il garde le report d'échéance de l'addendum
précédent : ni le statut, ni l'acceptation, ni la date de réponse n'y changent. Seul le
propriétaire, sous son drapeau d'entretien, sort de ces règles (ADR 0019).

## Statut

Accepté, 2026-09-20. Étape 4 de la feuille de route. **Remplace l'ADR 0018** et corrige l'ADR 0013
sur un point : la sécurité au niveau des lignes ne borne plus le super-admin à ce dont il a besoin,
elle le borne à l'organisation où il est entré. Complété le 2026-09-23 (la table des organisations
suit aussi le contexte, le super-admin peut repousser l'échéance d'une invitation, et il suit les
passages de statut d'une invitation, voir les addendums).
