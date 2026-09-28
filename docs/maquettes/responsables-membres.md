# L'écran Membres

Décrit après le code, à l'étape 18 (retours B3, B1, D2, A3 pour cet écran, et D3), et complété à
l'étape 19 (la langue du courriel, les confirmations, le départ de soi-même). Textes :
`apps/web/src/lib/i18n/members.ts`, dans les cinq langues.

**Lien** : `/membres`, réservé à la personne responsable : un éditeur est renvoyé à l'accueil, et la
base lui refuse les mêmes gestes (ADR 0046).

## Structure, de haut en bas

1. Titre de niveau 1 : le nom de l'organisation, puis `Les personnes qui gèrent avec vous le
programme de votre organisation, et celles que vous avez invitées.`
2. **Membres** : une ligne par membre, avec son adresse, `(vous)` à côté de la sienne, et
   `Rôle : responsable` ou `Rôle : éditeur`. Les boutons `Donner le rôle d'éditeur` ou
   `Donner le rôle de responsable`, et `Retirer de l'organisation`, avec l'aide `Une personne retirée
n'entre plus dans l'espace de votre organisation. Son compte reste, et vous pouvez l'inviter de
nouveau.`
3. **Invitations en attente** : l'adresse, le rôle, et `Envoyée le 25.09.2026, valable jusqu'au
09.10.2026`, dans le fuseau de l'organisation, puis `Annuler l'invitation`. Sans invitation :
   `Aucune invitation en attente.`
4. **Inviter une personne** : `La personne reçoit un courriel avec un lien pour se connecter.
L'invitation vaut 14 jours. La personne apparaît parmi les membres quand elle a accepté ; avant, son
nom ne s'affiche nulle part.` Le champ `Adresse électronique de la personne`, avec
   `Exemple : prenom.nom@exemple.ch`, le choix `Langue du courriel`, avec `La personne invitée reçoit
le courriel dans cette langue.`, le choix `Rôle` (`Éditeur` ou `Responsable`), et le bouton
   `Envoyer l'invitation`. Après l'envoi : `L'invitation a été envoyée à cette adresse.`, la même
   phrase pour toute adresse et toute langue (ADR 0017). Après une erreur, l'adresse, la langue et
   le rôle choisis restent dans le formulaire.
5. **La langue du courriel** (étape 19) propose les cinq langues, chacune écrite dans sa langue
   (`Français`, `Deutsch`, `Italiano`, `English`, `العربية`), comme le choix de la langue en haut de
   l'écran. Celle de l'écran est choisie d'abord. L'aide sous le choix, dans la langue de l'écran,
   lui sert de description pour les lecteurs d'écran. Sans JavaScript comme avec, c'est un champ du
   formulaire : une valeur qu'il ne connaît pas, ou son absence, donne la langue de l'écran.

## Ce que chaque rôle permet (retour B3)

Sous le choix du rôle, deux listes, qu'une personne lit au moment de choisir.

**Ce que peut faire un éditeur**

- Voir les séances des sept prochains jours et copier les messages prêts à coller
- Annuler une séance, la déplacer à une autre date ou à une autre heure, puis la rétablir
- Créer un cours, le modifier et le publier
- Poser une pause, par exemple pendant les vacances, puis la retirer
- Quand les heures de prière sont activées : ajouter une prière du vendredi, la modifier, la
  publier, l'annuler, la déplacer ou la supprimer
- Partager le programme : le lien, le code QR et le code à coller sur un site
- Choisir la langue de son espace
- Passer d'une organisation à l'autre, quand on est membre de plusieurs
- Accepter les conditions d'utilisation et les invitations reçues
- Quitter une organisation dont on est membre

**Réservé au responsable, en plus de tout ce que fait un éditeur**

- Supprimer un cours
- Voir les membres, leur rôle et les invitations en attente
- Inviter une personne, comme éditeur ou comme responsable, et annuler une invitation
- Changer le rôle d'un membre
- Retirer un membre de l'organisation
- Modifier les réglages : nom, fuseau horaire, couleur, formule d'accueil et langues de la page
  publique
- Ajouter ou supprimer une salle
- Activer ou désactiver les heures de prière
- Régler les heures de prière : le calcul, l'import d'un fichier, les horaires saisis à la main et le
  modèle à télécharger

Puis : `Une organisation garde toujours au moins une personne responsable.`

Cette liste est celle de l'ADR 0046. Un test la lie à la base : les tables que les politiques
réservent aux responsables doivent être exactement celles des gestes que l'écran dit réservés, à
une exception près. La base réserve la lecture du journal (migration 0070), qu'aucun écran ne
montre : il nomme les membres et les personnes invitées. Depuis le lot 1 de l'étape 19, elle réserve
aussi la suppression d'un cours à la personne responsable (migration 0065) ; depuis le lot 2, l'écran
Cours la lui propose, et la ligne `Supprimer un cours` ouvre la liste, comme l'écran Cours ouvre la
navigation. Jusqu'au lot 4 de l'étape 18, la ligne des cours de l'éditeur disait aussi « et le
supprimer » : l'éditeur ne peut pas supprimer un cours, et ces mots sont retirés de sa liste. La
liste des membres elle-même, que la ligne « Voir les membres » réserve, l'est aussi dans la base
depuis l'étape 19 (migration 0064) : un éditeur ne lit plus que sa propre adhésion.

La dernière ligne des gestes de l'éditeur, `Quitter une organisation dont on est membre`, vient à
l'étape 19 avec le bouton `Quitter l'organisation` de « Vos organisations »
(`responsables-coquille.md`) : l'éditrice du test la fait elle-même, par cet écran, où la
navigation la mène. Toute personne membre y trouve un lien : `Changer d'organisation` quand elle a
de quoi choisir, `Vos organisations` quand elle n'a qu'une organisation.

## Les messages

Sous l'introduction, chaque geste dit ce qu'il a fait : `L'invitation est annulée : la personne ne
peut plus l'accepter.`, `La personne a été retirée de votre organisation.`, `Le rôle a été changé.
Nouveau rôle : responsable.` Avant l'étape 18, la ligne changeait ou disparaissait sans un mot.

Les erreurs : `Seule une personne responsable peut faire cela.`, `Ce rôle n'existe pas. Choisissez
éditeur ou responsable.`, pour une adhésion que l'écran ne trouve plus dans l'organisation, ou un
identifiant mal formé : `Cette personne ne fait plus partie de l'organisation.` (avant l'étape 19,
une adhésion inconnue était dite « retirée », et un identifiant mal formé rendait une erreur 500),
et, pour la dernière personne responsable : `Une organisation doit toujours garder au moins une
personne responsable. Donnez d'abord ce rôle à une autre personne.`

## Retirer un membre, changer un rôle : la confirmation (étape 19)

Les deux gestes ne se font plus au premier envoi, comme la suppression d'une salle occupée
(`responsables-reglages.md`). Le bouton de la ligne rend l'écran avec, en haut, sous les messages et
avant la liste, une demande annoncée (`role="alert"`), encadrée de rouge :

- pour retirer : `Vous allez retirer cette personne de l'organisation :` et son adresse, puis l'aide
  `Une personne retirée n'entre plus dans l'espace de votre organisation. Son compte reste, et vous
pouvez l'inviter de nouveau.`, le bouton `Retirer cette personne` et le lien `Ne rien changer` ;
- pour changer un rôle : `Vous allez donner le rôle de responsable à cette personne :` (ou
  `le rôle d'éditeur`) et son adresse, puis ce que le rôle change : `Elle pourra faire tout ce qui
est réservé au responsable, membres et réglages compris.`, ou `Elle gérera toujours les cours et le
programme, mais n'ouvrira plus les écrans réservés aux responsables, comme Membres et Réglages.`,
  le bouton `Donner ce rôle` et le lien `Ne rien changer`.

Une responsable qui se vise elle-même lit des phrases qui parlent d'elle, sans son adresse :
`Vous allez vous donner le rôle d'éditeur.`, puis `Les écrans réservés aux responsables, comme
Membres et Réglages, ne vous seront plus ouverts. Pour les retrouver, il faudra qu'une autre personne
responsable vous redonne le rôle de responsable.` et le bouton `Prendre le rôle d'éditeur` ; ou
`Vous allez vous retirer vous-même de l'organisation.`, puis `Son espace ne vous sera plus ouvert.
Pour y revenir, il faudra qu'une personne responsable vous invite de nouveau.` et le bouton
`Me retirer de l'organisation`.

Le bouton de la demande renvoie le même formulaire, avec `confirm=yes` : c'est lui qui écrit. Le lien
`Ne rien changer` ramène à l'écran sans rien envoyer. Tout marche sans JavaScript : ce sont des
formulaires ordinaires. Quand le geste laisserait l'organisation sans personne responsable, l'écran
ne demande pas de confirmer : il répond aussitôt par la phrase de la dernière personne responsable.
La base reste la vérité, et son refus est traduit de la même façon au second envoi.

## Une responsable qui se donne le rôle d'éditeur

Quand une autre personne responsable reste, une responsable peut se donner elle-même le rôle
d'éditeur, après la confirmation. L'écran Membres ne lui est alors plus ouvert : elle arrive sur
`À venir`, à l'adresse
`/?avis=editeur`, avec en tête un encadré, `Vous avez maintenant le rôle d'éditeur. Les écrans
réservés aux responsables, comme Membres et Réglages, ne vous sont plus ouverts. Pour les retrouver,
demandez à une autre personne responsable de vous redonner le rôle de responsable.` Sa description
est dans `responsables-coquille.md`.

## Une responsable qui se retire elle-même (étape 19)

Quand une autre personne responsable reste, une responsable peut se retirer elle-même, après la
confirmation. L'organisation ne lui est plus ouverte, et la session ne la désigne plus : elle arrive
sur « Vos organisations », à l'adresse `/organisations?avis=depart&organisation=<identifiant>`, avec
en tête l'encadré `Vous avez quitté l'organisation. Son espace ne vous est plus ouvert. Pour y
revenir, demandez à une personne responsable de vous inviter de nouveau.` C'est l'encadré du départ
depuis « Vos organisations », décrit dans `responsables-coquille.md`. Avant, elle arrivait sans un
mot.

## Le courriel d'invitation

Il part dans la langue que la personne qui invite choisit, celle de son écran d'abord, pour toute
adresse : lire la langue du compte invité demanderait de chercher ce compte par son adresse
(ADR 0017, addendum du 27.09.2026). Jusqu'à l'étape 19, il partait toujours dans la langue de
l'écran. Son texte est dans `responsables-coquille.md`.
