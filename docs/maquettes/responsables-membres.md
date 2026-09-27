# L'écran Membres

Décrit après le code, à l'étape 18 (retours B3, B1, D2, A3 pour cet écran, et D3). Textes :
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
   l'écran. Celle de l'écran est choisie d'abord. Sans JavaScript comme avec, c'est un champ du
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
liste des membres elle-même, que la ligne « Voir les membres »
réserve, l'est aussi dans la base depuis l'étape 19 (migration 0064) : un éditeur ne lit plus que sa
propre adhésion.

## Les messages

Sous l'introduction, chaque geste dit ce qu'il a fait : `L'invitation est annulée : la personne ne
peut plus l'accepter.`, `La personne a été retirée de votre organisation.`, `Le rôle a été changé.
Nouveau rôle : responsable.` Avant l'étape 18, la ligne changeait ou disparaissait sans un mot.

Les erreurs : `Seule une personne responsable peut faire cela.`, `Ce rôle n'existe pas. Choisissez
éditeur ou responsable.`, et, pour la dernière personne responsable : `Une organisation doit
toujours garder au moins une personne responsable. Donnez d'abord ce rôle à une autre personne.`

## Une responsable qui se donne le rôle d'éditeur

Quand une autre personne responsable reste, une responsable peut se donner elle-même le rôle
d'éditeur. L'écran Membres ne lui est alors plus ouvert : elle arrive sur `À venir`, à l'adresse
`/?avis=editeur`, avec en tête un encadré, `Vous avez maintenant le rôle d'éditeur. Les écrans
réservés aux responsables, comme Membres et Réglages, ne vous sont plus ouverts. Pour les retrouver,
demandez à une autre personne responsable de vous redonner le rôle de responsable.` Sa description
est dans `responsables-coquille.md`.

## Le courriel d'invitation

Il part dans la langue de l'écran de la personne qui invite, pour toute adresse : lire la langue du
compte invité demanderait de chercher ce compte par son adresse (ADR 0017, addendum du 2026-09-26).
Son texte est dans `responsables-coquille.md`.

## Ce qui reste à reprendre

Relevé par la relecture de l'étape 18, non corrigé à la fin de l'étape : retirer un membre et
changer un rôle se font sans demande de confirmation. Une responsable qui se retire elle-même de
l'organisation ne reçoit aucune phrase à l'arrivée.
