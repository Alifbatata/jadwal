# La coquille de l'espace, la connexion et les écrans d'entrée

Décrit après le code, à l'étape 18 (retours B1 et D2), et complété à l'étape 19 (le départ d'une
organisation et le lien de la navigation qui y mène, l'écran d'arrivée du lien de connexion, la
langue de l'invitation). Les textes sont dans `apps/web/src/lib/i18n/` : `common.ts` pour la
coquille, `sign-in.ts`, `organisations.ts`, `sign-out.ts` et `error.ts` pour les écrans ; les
courriels dans `apps/web/src/lib/server/mail/messages.ts`. Tout existe dans les cinq langues, et
l'arabe se lit de droite à gauche. Comment l'espace choisit sa langue est dans l'ADR 0047.

## La coquille, en haut de chaque écran de l'espace

Dans cet ordre :

1. **La bannière du super-admin**, seulement quand il est entré dans une organisation par ses
   pouvoirs : `Vous travaillez dans <organisation> avec vos pouvoirs de super-admin.`, puis le lien
   `Changer d'organisation`, vers la console.
2. **Le choix de la langue** : le titre `Langue`, puis cinq boutons, chacun écrit dans sa langue :
   `Français`, `Deutsch`, `Italiano`, `English`, `العربية`. La langue en cours est marquée. C'est un
   vrai formulaire (`POST /langue`), qui marche sans JavaScript et revient sur le même écran. Il est
   là sur chaque écran, connexion, erreurs et super-admin compris.
3. **La marque** `jadwal`, lien vers l'accueil de l'espace.
4. **La navigation**, une fois les conditions acceptées :
   - pour tous : `À venir`, `Cours`, `Prière du vendredi` (si les heures de prière sont activées),
     `Partager` ;
   - pour une personne responsable en plus : `Membres`, `Heures de prière` (si les heures de prière
     sont activées), `Réglages` ;
   - `Changer d'organisation`, pour qui est membre de plusieurs organisations, ou qu'une invitation
     attend encore ;
   - sinon, depuis l'étape 19, `Vos organisations`, vers le même écran, sous son titre : il n'y a
     rien à changer, mais c'est là que la personne quitte son organisation. Avant, qui n'avait
     qu'une organisation n'y trouvait aucun chemin pendant sa session. Le super-admin entré par ses
     pouvoirs n'a ni l'un ni l'autre : il garde le lien de sa bannière.

   Avant l'étape 18, les deux entrées des prières s'appelaient `Vendredi` et `Prières` ; elles
   portent maintenant le titre de leur écran.

5. **L'adresse du compte**, précédée pour les lecteurs d'écran de `Connecté avec l'adresse`, puis
   `Super-admin` pour l'exploitant, puis le bouton `Se déconnecter`.

Au pied de chaque écran : le lien `Conditions d'utilisation`.

## L'encadré de la responsable devenue éditrice

Une responsable qui se donne elle-même le rôle d'éditeur, sur l'écran Membres, n'a plus accès à cet
écran. L'action l'envoie sur `À venir`, à l'adresse `/?avis=editeur`, et la coquille affiche en tête
du contenu, avant tout le reste, un encadré annoncé aux lecteurs d'écran (`role="status"`) :

`Vous avez maintenant le rôle d'éditeur. Les écrans réservés aux responsables, comme Membres et
Réglages, ne vous sont plus ouverts. Pour les retrouver, demandez à une autre personne responsable
de vous redonner le rôle de responsable.`

Il existe dans les cinq langues (`becameEditor`, dans `common.ts`). La coquille ne l'affiche qu'à
une personne qui est bien éditrice de l'organisation : une adresse copiée ne fait rien dire de faux.
Il passe par un paramètre d'adresse, et non par un cookie : rien à retenir, rien de personnel. Il
disparaît à l'écran suivant, et revient si elle recharge cette adresse. Avant, elle arrivait sur
`À venir` sans un mot.

## Se connecter, `/connexion`

1. Titre de niveau 1 : `Se connecter`.
2. `Cet espace sert aux personnes qui gèrent le programme d'une organisation. Saisissez votre
adresse électronique : vous recevrez un lien pour vous connecter. Il n'y a pas de mot de passe.`
3. Le champ `Votre adresse électronique`, avec l'aide
   `L'adresse à laquelle votre invitation est arrivée. Exemple : prenom.nom@example.org`. Il se lit
   de gauche à droite, même en arabe. Depuis l'étape 20, les adresses d'exemple de tous les écrans
   s'écrivent sur `example.org`, un domaine réservé aux exemples (RFC 2606), qui n'appartient à
   personne : `vorname.name@example.org`, `nome.cognome@example.org`, `first.last@example.org` et
   `name@example.org` dans les autres langues. Un test des dictionnaires refuse tout autre domaine.
4. Le bouton `Recevoir un lien de connexion`.
5. `Pas encore invité ? Demandez à la personne responsable de votre organisation de vous inviter.`
6. Le lien `Lire les conditions d'utilisation`.

**Après l'envoi**, l'écran dit ce qu'il faut faire : `Si cette adresse peut se connecter, un lien
vient d'y être envoyé. Ouvrez votre messagerie et touchez le lien : il est valable quinze minutes et
ne sert qu'une fois.`, puis `Rien reçu après quelques minutes ? Regardez dans les courriels
indésirables, ou demandez un autre lien.`, `Vous pouvez fermer cette page.` et le lien
`Demander un autre lien`. La phrase est la même pour une adresse connue et une adresse inconnue.

**Une langue choisie sur cet écran** part avec le lien : le courriel arrive dans cette langue, et le
lien en fait la langue du compte, sur quelque navigateur qu'il s'ouvre. La règle exacte est dans
l'ADR 0047. Depuis l'étape 19, l'écran où le lien ramène est `/organisations`, sans rien dans son
adresse : la vérification du lien donne la langue au compte, puis y renvoie sans le `?language=de`
que le lien portait, et qu'aucun écran ne lit.

**Une adresse mal formée** : `Cette adresse n'a pas la forme d'une adresse électronique. Exemple :
prenom.nom@example.org`, reliée au champ, et l'adresse tapée reste dans le champ.

## Vos organisations, `/organisations`

On y arrive après le lien de connexion, et, pendant la session, par la navigation :
`Changer d'organisation` pour qui a de quoi choisir, `Vos organisations` pour les autres.

1. Titre de niveau 1 : `Vos organisations`.
2. `Choisissez l'organisation dont vous voulez gérer le programme.`, puis une ligne par
   organisation : le bouton qui la choisit, à son nom, `Rôle : responsable` ou `Rôle : éditeur`, et,
   depuis l'étape 19, le bouton `Quitter l'organisation`, que le nom de l'organisation décrit pour
   les lecteurs d'écran.
3. `Une personne responsable gère tout, membres et réglages compris. Un éditeur gère les cours et le
programme.`
4. **Invitations reçues**, s'il y en a : `En acceptant une invitation, vous devenez membre de
l'organisation et vous gérez son programme avec elle.`, puis, pour chacune, le bouton
   `Accepter l'invitation`.

**Quitter une organisation** (étape 19). Le bouton ne fait rien partir au premier envoi : l'écran
revient avec, en haut, sous le titre et avant la liste, une demande annoncée (`role="alert"`),
encadrée de rouge : `Vous allez quitter cette organisation :` et son nom, puis `Son espace ne vous
sera plus ouvert. Pour y revenir, il faudra qu'une personne responsable vous invite de nouveau.`, le
bouton `Confirmer le départ` et le lien `Rester dans l'organisation`, qui ramène à l'écran sans rien
envoyer. Confirmé, le départ supprime l'adhésion de la personne, et avec elle son acceptation des
conditions dans cette organisation ; son compte reste, comme ce qu'elle a écrit. Le journal de
l'organisation le consigne, signé d'elle (`member.leave`). La session ne désigne plus
l'organisation, et l'écran revient avec l'encadré du départ. Sans JavaScript comme avec : ce sont
des formulaires ordinaires.

**La seule personne responsable ne part pas.** Dès le premier envoi, sans demande de confirmation,
l'écran le dit en haut (`role="alert"`) : `Vous êtes la seule personne responsable de cette
organisation :` et son nom, puis `Une organisation garde toujours au moins une personne responsable.
Avant de la quitter, ouvrez-la, puis, dans l'écran Membres, donnez le rôle de responsable à un autre
membre ou invitez une personne comme responsable.` La base tient la même règle (migration 0012), et
son refus est traduit par la même phrase si l'autre responsable part entre les deux envois.

**L'encadré du départ.** Après un départ, d'ici ou depuis l'écran Membres pour une responsable qui
s'est retirée elle-même, la personne arrive à l'adresse
`/organisations?avis=depart&organisation=<identifiant>`. En tête du contenu, avant le titre, un
encadré annoncé (`role="status"`) : `Vous avez quitté l'organisation. Son espace ne vous est plus
ouvert. Pour y revenir, demandez à une personne responsable de vous inviter de nouveau.` Il ne nomme
pas l'organisation : la base ne la montre plus à qui l'a quittée, et une adresse ne doit pas pouvoir
faire écrire un nom à l'écran. Comme celui de la responsable devenue éditrice, il passe par un
paramètre d'adresse, et non par un cookie. Il ne s'affiche qu'à une personne qui n'est pas membre de
l'organisation que l'adresse nomme : une adresse copiée ne fait rien dire de faux à qui en est
membre.

**Sans organisation** : `Votre compte n'est rattaché à aucune organisation pour le moment. Pour
gérer le programme d'une organisation, il faut y être invité : demandez à la personne responsable
de vous envoyer une invitation à votre adresse.`, puis `Votre adresse :` et l'adresse du compte.

**Les erreurs disent quoi faire** : `Cette invitation n'est plus valable : elle a peut-être expiré ou
été annulée. Demandez-en une nouvelle à la personne qui vous a invité.` Pour une organisation dont la
personne n'est pas membre, ou un identifiant mal formé : `Vous n'êtes pas membre de cette
organisation.`

## Se déconnecter, `/deconnexion`

Titre `Déconnexion`, `Vous n'êtes plus connecté.`, et le lien `Se reconnecter`. L'onglet du
navigateur a enfin un titre.

## La page d'erreur de l'espace

Nouvelle à l'étape 18. Elle dit, selon le code, ce qui arrive et quoi faire, puis le lien
`Revenir à l'accueil`. Elle ne recopie jamais le message technique.

| Code  | Titre                     | Phrase                                                                      |
| ----- | ------------------------- | --------------------------------------------------------------------------- |
| 404   | `Page introuvable`        | `Cette adresse ne mène à aucune page. Vérifiez-la, ou revenez à l'accueil.` |
| 403   | `Accès refusé`            | `Cette page n'est pas ouverte à votre compte.`                              |
| 429   | `Trop de demandes`        | `Attendez une minute, puis réessayez.`                                      |
| autre | `Une erreur est survenue` | `Le service n'a pas pu afficher cette page. Réessayez dans un instant.`     |

## Les deux courriels

**Le lien de connexion**, dans la langue de l'écran d'où il est demandé : objet
`Votre lien de connexion à jadwal`, `Voici votre lien de connexion :`, le lien
`Se connecter à jadwal`, `Il est valable quinze minutes et ne peut servir qu'une fois.`, puis
`Si vous n'avez rien demandé, ignorez ce message : personne n'a accès à votre compte.`

**L'invitation**, dans la langue que la personne qui invite choisit dans le formulaire, celle de son
écran d'abord (étape 19, ADR 0017, addendum du 27.09.2026) : objet
`Invitation à rejoindre <organisation> sur jadwal`, puis, pas à pas, comment accepter :
`Pour accepter, ouvrez cette page et connectez-vous avec l'adresse électronique qui a reçu ce
message :`, le lien `Se connecter pour accepter`, `Vous recevrez un lien de connexion, puis
l'invitation vous attendra sur l'écran « Vos organisations ».`, `L'invitation est valable quatorze
jours.`, `Tant que vous n'avez pas accepté, rien n'est partagé et votre nom n'apparaît nulle part.`

Aucune date dans ces courriels. Chacun porte `lang` et `dir` dans sa langue, et la signature du
service.
