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

## Addendum du 2026-09-23 : ce que la base tient d'une invitation

Une invitation dure quatorze jours. Jusqu'ici, seule l'application le disait : l'écran des membres
posait la fin à quatorze jours, et l'acceptation filtrait les invitations échues. La base, elle,
n'exigeait qu'une fin postérieure à la création. Un appel direct acceptait donc une invitation
échue, et l'adhésion suivait ; une invitation de quinze jours, ou d'un an, passait sans un mot.

**La base tient désormais la durée** (migration 0056). Une contrainte de vérification borne la fin à
quatorze jours de la création. Elle porte sur la durée écoulée et non sur une date de calendrier,
parce qu'une date de calendrier dépend du fuseau de la session : par-dessus le passage à l'heure
d'hiver, quatorze jours comptés à Zurich font 337 heures, et une restauration sous un autre fuseau
pourrait refuser des lignes que l'insertion avait acceptées. La date de création appartient au
serveur, comme l'horodatage du journal (ADR 0020) : aucun rôle de connexion ne peut la nommer, sans
quoi une création datée de l'an prochain rendrait la borne vide. La migration vérifie d'abord les
invitations existantes : si l'une dépasse la borne, elle refuse de s'appliquer et dit combien.

**La base refuse une acceptation échue** (migration 0057). Un déclencheur refuse qu'une invitation
échue passe à « acceptée », et qu'une acceptation échue change de mains. Un déclencheur plutôt
qu'une politique : il tient quels que soient le rôle et la branche de politique qui laissent
passer la ligne (la personne invitée par son adresse, la personne responsable par le contexte, le
super-admin), il dit pourquoi il refuse, et il ne lit que la ligne et l'horloge. La fonction que lit
la politique d'adhésion exige aussi l'échéance : une invitation acceptée à temps puis échue avant
l'adhésion n'ouvre plus rien.

Le déclencheur ne vise pas le retour à vide. Quand un compte est supprimé, la clé étrangère vide le
nom de l'acceptation qu'il portait. Le refuser bloquait la suppression du compte, et avec elle la
purge des comptes en entier. Cet état naissait d'un parcours ordinaire : une personne déjà membre
acceptait une nouvelle invitation, l'adhésion existait déjà, et rien ne consommait l'invitation.
Depuis la migration 0058 (voir plus bas), il ne naît plus que d'un appel direct qui accepte sans
adhérer. Une fois vide, ce nom ne se remplit plus, que l'invitation coure encore ou non : une
acceptation ne passe jamais à un autre compte.

**Limite.** L'échéance est comparée à `now()`, l'heure du début de la transaction. Une transaction
ouverte avant l'échéance et tenue au-delà accepte encore, et l'adhésion suit.

La durée vit à deux endroits, l'écran et la contrainte. L'écran compte en heures, comme la
contrainte : quatorze jours de calendrier, comptés dans un fuseau qui change d'heure, font 337
heures par-dessus le passage à l'heure d'hiver (335 par-dessus celui du printemps, 336 le reste de
l'année), et la base refuserait les 337. Un test rejoue la fin que pose l'écran sous deux fuseaux,
par-dessus le passage à l'heure d'hiver, et vérifie que la base l'accepte à la seconde près, et pas
une seconde de plus : l'un ne peut pas changer sans l'autre.

**Le rôle, l'usage unique et les passages de statut** (migration 0058). Les relectures de l'étape 17
ont trouvé trois trous plus anciens, dans le même modèle d'appel direct : une requête tapée sous un
rôle de connexion, hors de l'écran.

- **Le rôle.** Une personne invitée comme éditrice acceptait, puis créait elle-même une adhésion de
  responsable : la fonction que lit la politique d'adhésion ne regardait pas le rôle. Elle reçoit
  désormais le rôle de l'adhésion, et exige une invitation de ce rôle-là. Une adhésion née d'une
  invitation porte exactement le rôle de celle-ci. Le super-admin n'est pas concerné : il crée une
  adhésion sans invitation, dans l'organisation où il est entré (ADR 0025).
- **Une seule fois.** Une personne déjà membre, réinvitée, acceptait, et rien ne consommait
  l'invitation, puisqu'aucune adhésion n'était créée. Retirée ensuite, elle se remettait seule dans
  l'organisation, tant que l'invitation courait. L'acceptation par une personne déjà membre consomme
  maintenant l'invitation sur-le-champ. La personne garde son adhésion et son rôle ; pour
  changer ce rôle, la personne responsable passe par l'écran des membres. L'écran d'acceptation ne
  tente plus d'adhésion dans ce cas. La migration consomme aussi les acceptations déjà écrites :
  l'écran accepte et adhère dans la même transaction, donc aucune n'attendait une adhésion à venir.
- **Les passages de statut.** La politique de modification laissait la personne invitée écrire
  n'importe quel statut sur toute ligne reçue à son adresse, et la personne responsable sur toute
  ligne de son organisation. Une invitation consommée repassait à « acceptée » ou « en attente », et
  resservait après un retrait. Une invitation annulée par le responsable s'acceptait encore, ce que
  la décision exclut. Une acceptation passait d'un compte à un autre. La base tient désormais ce
  qu'une invitation peut devenir : elle naît en attente, acceptée par personne ; en attente, elle
  est acceptée ou annulée ; acceptée, elle est consommée ; consommée ou annulée, elle ne bouge plus.
  Seule la personne à qui elle est adressée l'accepte, à son propre nom, et cette acceptation ne
  passe jamais à un autre compte : le nom ne se vide que lorsque le compte est supprimé. La date
  de réponse, qu'un appel direct repoussait pour garder une adresse plus longtemps que les
  quatre-vingt-dix jours de la purge, est l'heure de la réponse, écrite une fois pour toutes. Un
  déclencheur refuse tout le reste, en disant quelle règle est enfreinte. La migration dresse la
  liste des gestes légitimes qui écrivent une invitation (écrans, adhésion, suppression d'un
  compte, purges, restauration), et aucun n'est refusé.

Le super-admin suit ces règles. Il a tous les droits sur les données (ADR 0025), mais une règle
d'intégrité n'est pas un droit de lecture ou d'écriture : elle dit ce que veut dire une ligne, et
« acceptée » veut dire que la personne a accepté. Elle ne lui retire rien, puisqu'il peut inviter de
nouveau ou créer lui-même une adhésion, et elle l'arrête sur la méprise, comme le contexte. Seul le
propriétaire, sous son drapeau d'entretien, en sort (ADR 0019).

L'invitation est consommée à l'acceptation, et non au retrait. Consommer au retrait obligeait à
suivre tous les chemins qui suppriment une adhésion, jusqu'à la cascade de la suppression d'un
compte. À l'acceptation, il suffit de suivre un seul geste, le passage à « acceptée » : c'est le
seul qui nomme une personne.

Ce que la base tient, pour les rôles de connexion : une invitation consommée ne sert plus, une
invitation annulée ne s'accepte plus, une acceptation est faite par la personne à qui l'invitation
est adressée et ne passe à personne d'autre, une invitation échue ne s'accepte pas, une invitation
résolue garde sa date de réponse, et une adhésion née d'une invitation porte le rôle de celle-ci.

**Limite du rôle.** Pour le rôle applicatif, la base ne sépare pas l'éditeur du responsable à
l'intérieur d'une organisation : toute personne qui a le contexte de l'organisation peut, par un
appel direct, s'écrire une invitation, de n'importe quel rôle, à sa propre adresse, l'accepter et
adhérer avec ce rôle, comme elle peut changer le rôle d'une adhésion, le sien compris (migration
0053). C'est l'écran des membres qui réserve ces gestes aux personnes responsables. L'application ne
pose le contexte d'une organisation qu'après avoir vérifié l'appartenance, et juste après une
acceptation ; qui tient le mot de passe du rôle applicatif le pose où il veut (`docs/SECURITE.md`).
Ce que tient la migration 0058, c'est la promesse d'une invitation donnée : l'adhésion qui en naît
porte son rôle, une seule fois, et seulement si la personne l'a acceptée elle-même. Séparer les
rôles dans la base est une décision du modèle de sécurité, qui reste à prendre.

## Statut

Accepté, 2026-09-20. Étape 3 de la feuille de route (connexion, organisations, rôles, invitations,
super-admin, journal). Complété le 2026-09-23 (ce que la base tient d'une invitation : la durée,
l'échéance, le rôle, l'usage unique, les passages de statut et la date de réponse, voir
l'addendum).
