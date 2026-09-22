# ADR 0017 : Invitation sans fuite d'information

## Contexte

L'adresse électronique est la seule donnée personnelle du service (ADR 0009), et elle est unique
pour tout le service : une même personne responsable de deux organisations n'a qu'un compte.
L'étape 2 a laissé la question ouverte : « Que voit un responsable d'un compte déjà enregistré
ailleurs ? »

Le chemin naïf est celui de presque tous les logiciels de gestion d'équipe. On saisit une adresse ;
si elle correspond à un compte, la personne est ajoutée aussitôt et son nom s'affiche ; sinon un
courriel d'inscription part. Ce chemin transforme le formulaire d'invitation en oracle : n'importe
quel responsable d'une organisation peut savoir si telle adresse a un compte chez nous, et en
apprendre le nom. Pour un service qui s'adresse à des communautés religieuses, savoir qui est
responsable d'une organisation est une information sensible, et ce n'est pas au formulaire
d'invitation de la donner.

L'étape 2 a déjà fermé la variante base de données de cette fuite : une organisation ne peut plus
écrire une ligne désignant une personne qu'elle ne voit pas, et l'écriture des adhésions a quitté le
rôle applicatif. Il reste à décider ce que fait l'application.

## Décision

- **Le chemin d'invitation ne consulte jamais les comptes par adresse.** Il n'y a pas de recherche à
  faire : on enregistre l'invitation et on envoie le courriel. Aucune branche du code ne dépend de
  l'existence d'un compte, donc il n'y a rien à faire fuir — ni par le message, ni par le contenu
  affiché, ni par le temps de réponse. L'égalité des temps n'est pas obtenue par une temporisation
  artificielle mais par l'absence de différence de traitement.
- **La réponse est toujours la même**, mot pour mot : l'invitation a été envoyée à l'adresse saisie.
- **Rien n'apparaît dans la liste des membres tant que la personne n'a pas accepté.** Les
  invitations en attente forment une liste à part.
- **Une invitation en attente n'affiche que ce que le responsable a saisi** : l'adresse, la date, et
  qui a invité. Jamais un nom, jamais un indice venu d'un compte existant.
- **Le nom n'apparaît qu'après acceptation**, parce qu'à ce moment la personne a consenti à être
  rattachée à cette organisation.
- **L'acceptation est faite par la personne elle-même**, connectée. C'est elle qui crée son adhésion :
  la politique d'écriture n'autorise une adhésion que pour soi-même. Une organisation ne peut donc
  jamais rattacher quelqu'un en silence, même en connaissant son identifiant.
- **Le responsable peut annuler une invitation** tant qu'elle n'a pas été acceptée.
- **Une invitation acceptée ne vaut qu'une fois.** L'adhésion créée la marque consommée, par un
  déclencheur et non par la bonne volonté du code : une personne retirée de l'organisation ne peut
  pas se réinscrire avec la même invitation. Il faut l'inviter de nouveau.
- **La personne invitée lit la ligne de l'organisation qui l'invite**, et la lit entière : nom,
  identifiant d'URL, fuseau, couleur d'accent, langues, plan, état et dates. Une politique de
  sécurité porte sur des lignes, pas sur des colonnes : donner le nom, c'est donner la ligne. Rien
  de tout cela n'est une donnée personnelle, et le nom comme l'identifiant d'URL seront publics dès
  l'étape 5 ; le plan est la seule mention un peu commerciale, et nous l'assumons plutôt que
  d'annoncer une restriction que la base ne tient pas. Membres, cours et journal, eux, restent
  fermés : ils exigent l'appartenance.
- **L'invitation, son acceptation, son annulation et son expiration sont écrites dans le journal
  d'audit** de l'organisation.

## Conséquences

- Inviter une adresse déjà titulaire d'un compte et inviter une adresse inconnue sont, du point de
  vue du responsable, exactement la même opération avec exactement le même retour. Un test le
  vérifie sur le message, sur le contenu affiché et sur le temps de réponse.
- Une personne déjà titulaire d'un compte reçoit un courriel qui l'invite à rejoindre une
  organisation ; elle se connecte comme d'habitude et accepte, ou ignore. Elle n'est jamais
  rattachée sans l'avoir voulu.
- La personne invitée ne peut pas récrire son invitation : le droit de modification est réduit aux
  trois colonnes de la réponse, pas au rôle. Une invitation d'éditeur ne devient pas une invitation
  de responsable.
- Le responsable ne peut pas savoir si quelqu'un a un compte. C'est le but, et c'est aussi une gêne :
  il ne saura pas non plus pourquoi une invitation reste en attente. La liste des invitations en
  attente, avec leur date, est la seule réponse que nous donnons.
- Le service ne peut pas proposer de complétion d'adresse ni d'annuaire interne. Aucun besoin connu
  n'en demande.
- Inviter quelqu'un lui ouvre la fiche de l'organisation avant même qu'il accepte. Une invitation
  envoyée par erreur montre donc le plan de l'organisation à un inconnu. Si cela devenait gênant,
  il faudrait une vue réduite aux colonnes publiques, pas une politique de plus : c'est un
  changement de schéma, pas un réglage.

## Statut

Accepté, 2026-09-20. Étape 3 de la feuille de route (connexion, organisations, rôles, invitations,
super-admin, journal).
